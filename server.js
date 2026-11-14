// Static file server plus a small /api/chat proxy. The browser never sees an API key.
// Backend is picked from the environment: ANTHROPIC_API_KEY, OPENAI_API_KEY (any OpenAI-compatible
// endpoint), GOOGLE_APPLICATION_CREDENTIALS (a Vertex AI service account key), or a local opencode service.
// Override with CP_BACKEND=anthropic|openai|vertex|opencode.
// Settings can live in a .env file next to this one (see .env.example); a variable already in the environment wins.
import http from "node:http";
import { sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anthropic, openai, vertex, serviceAccountAssertion, opencodePrompt, DEFAULT_PERSONA, withPersona, intFrom, leakedNotes } from "./backends.js";

const PROJECT = path.dirname(fileURLToPath(import.meta.url));
// Resolved from this file, not the working directory, so the Electron wrapper in desktop/ finds the same .env.
if (existsSync(path.join(PROJECT, ".env"))) process.loadEnvFile(path.join(PROJECT, ".env"));

const ROOT = path.join(PROJECT, "public");
const PORT = Number(process.env.PORT || 7777);
const HOST = process.env.HOST || "127.0.0.1"; // set HOST=0.0.0.0 to reach it from outside a container
const env = process.env;
const BACKEND = env.CP_BACKEND || (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : env.GOOGLE_APPLICATION_CREDENTIALS ? "vertex" : "opencode");
const DEFAULT_MODEL = { anthropic: "claude-sonnet-5-5", openai: "gpt-4o-mini", vertex: "google/gemini-3.8-flash", opencode: "gpt-6.1-sol" }[BACKEND];
const MODEL = env.CP_MODEL || DEFAULT_MODEL;
const PERSONA = env.PERSONA?.trim() || DEFAULT_PERSONA;
const TIMEOUT_MS = intFrom(env.CP_TIMEOUT_MS, 60_000, 1_000, 600_000);  // how long to wait for the model
const HISTORY = intFrom(env.CP_HISTORY, 60, 2, 1000);                   // messages the page keeps and sends as context
const expandHome = (file) => (file.startsWith("~/") ? path.join(homedir(), file.slice(2)) : file);  // .env has no shell to do it
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".webp": "image/webp", ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
};

async function readBody(req, limit = 1024 * 1024) {  // room for a long CP_HISTORY
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function post(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = await r.json().catch(() => ({}));
  const failure = Array.isArray(json) ? json[0] : json;  // Vertex's OpenAI-compatible endpoint wraps errors in an array
  if (!r.ok) throw new Error(failure?.error?.message || failure?.message || `upstream HTTP ${r.status}`);
  return json;
}

// opencode's service port is random and changes when it restarts; set OPENCODE_URL to the current one.
function opencodeAuth() {
  const file = path.join(homedir(), ".config/opencode/service.json");
  return "Basic " + Buffer.from(`opencode:${JSON.parse(readFileSync(file, "utf8")).password}`).toString("base64");
}

// Vertex wants a short-lived OAuth token. It is minted from the service account key with Node's crypto (no gcloud, no
// dependency) and reused until a minute before it expires.
let vertexCreds, vertexToken = { value: "", expires: 0 };
async function vertexAccessToken() {
  if (Date.now() < vertexToken.expires - 60_000) return vertexToken.value;
  vertexCreds ??= JSON.parse(readFileSync(expandHome(env.GOOGLE_APPLICATION_CREDENTIALS), "utf8"));
  const assertion = serviceAccountAssertion(vertexCreds, Date.now(), (data, key) => sign("RSA-SHA256", Buffer.from(data), key));
  const r = await fetch(vertexCreds.token_uri, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.access_token) throw new Error(json.error_description || json.error || `token HTTP ${r.status}`);
  vertexToken = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return vertexToken.value;
}

async function reply(system, messages) {
  if (BACKEND === "vertex") {
    const token = await vertexAccessToken();
    const r = await post(vertex.url(vertexCreds.project_id, env.VERTEX_LOCATION || "global"), { authorization: `Bearer ${token}` }, vertex.body(MODEL, system, messages, env.CP_REASONING_EFFORT));
    return vertex.text(r);
  }
  if (BACKEND === "anthropic") {
    const r = await post(anthropic.url(env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"), anthropic.headers(env.ANTHROPIC_API_KEY), anthropic.body(MODEL, system, messages));
    return anthropic.text(r);
  }
  if (BACKEND === "openai") {
    const r = await post(openai.url(env.OPENAI_BASE_URL || "https://api.openai.com/v1"), openai.headers(env.OPENAI_API_KEY), openai.body(MODEL, system, messages));
    return openai.text(r);
  }
  const r = await post(`${env.OPENCODE_URL || "http://127.0.0.1:49374"}/api/experimental/generate/text`, { authorization: opencodeAuth() },
    { prompt: opencodePrompt(system, messages), model: { id: MODEL, providerID: env.CP_PROVIDER || "openai" } });
  return r.data?.text;
}

async function chat(req, res) {
  const { system, messages } = JSON.parse(await readBody(req));
  let text, error;
  try {
    const full = withPersona(PERSONA, system);
    text = await reply(full, messages);
    if (leakedNotes(text)) text = await reply(full, messages);  // asking again almost always gives a clean answer
  } catch (e) {
    error = e.name === "TimeoutError" ? `the model did not answer within ${TIMEOUT_MS / 1000}s` : String(e.message || e);
  }
  const ok = Boolean(text);
  res.writeHead(ok ? 200 : 502, { "content-type": "application/json" });
  res.end(JSON.stringify(ok ? { text } : { error: error || "empty reply from the model" }));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(ROOT, rel === path.sep ? "index.html" : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") return await chat(req, res);
    if (req.method === "GET" && req.url === "/api/config") {  // the page reads the settings it needs from here
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ history: HISTORY }));
    }
    return await serveStatic(req, res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}).listen(PORT, HOST, () => console.log(`quiet-nook on http://${HOST}:${PORT} (backend ${BACKEND}, model ${MODEL})`));
