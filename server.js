// Static file server plus a small /api/chat proxy. The browser never sees an API key.
// Backend is picked from the environment: ANTHROPIC_API_KEY, OPENAI_API_KEY (any OpenAI-compatible
// endpoint), or a local opencode service. Override with CP_BACKEND=anthropic|openai|opencode.
import http from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anthropic, openai, opencodePrompt } from "./backends.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const PORT = Number(process.env.PORT || 7777);
const HOST = process.env.HOST || "127.0.0.1"; // set HOST=0.0.0.0 to reach it from outside a container
const env = process.env;
const BACKEND = env.CP_BACKEND || (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : "opencode");
const DEFAULT_MODEL = { anthropic: "claude-sonnet-5-5", openai: "gpt-4o-mini", opencode: "gpt-6.1-sol" }[BACKEND];
const MODEL = env.CP_MODEL || DEFAULT_MODEL;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".webp": "image/webp", ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
};

async function readBody(req, limit = 256 * 1024) {
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
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error?.message || json.message || `upstream HTTP ${r.status}`);
  return json;
}

// opencode's service port is random and changes when it restarts; set OPENCODE_URL to the current one.
function opencodeAuth() {
  const file = path.join(homedir(), ".config/opencode/service.json");
  return "Basic " + Buffer.from(`opencode:${JSON.parse(readFileSync(file, "utf8")).password}`).toString("base64");
}

async function reply(system, messages) {
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
  try { text = await reply(system, messages); } catch (e) { error = String(e.message || e); }
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
    return await serveStatic(req, res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}).listen(PORT, HOST, () => console.log(`quiet-nook on http://${HOST}:${PORT} (backend ${BACKEND}, model ${MODEL})`));
