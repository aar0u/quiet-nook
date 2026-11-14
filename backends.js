// Pure request builders and reply extractors for each chat backend, so they can be tested without a network.

// Providers want the first turn from the user and alternating roles; the app can store neither.
export function normalize(messages) {
  const out = [];
  for (const m of messages) {
    if (!out.length && m.role !== "user") out.push({ role: "user", content: "[Earlier user message is no longer available.]" });
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

// The reply length is steered by the system prompt, not by a cap: a low cap would cut a reply off mid-sentence.
// Anthropic requires the field, and some OpenAI-compatible servers default to a tiny limit when it is missing.
const MAX_TOKENS = 4096;

export const anthropic = {
  url: (base) => `${base}/v1/messages`,
  headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  body: (model, system, messages) => ({ model, max_tokens: MAX_TOKENS, system, messages: normalize(messages) }),
  text: (r) => r.content?.map((c) => c.text ?? "").join(""),
};

export const openai = {
  url: (base) => `${base}/chat/completions`,
  headers: (key) => ({ authorization: `Bearer ${key}` }),
  body: (model, system, messages) => ({ model, max_tokens: MAX_TOKENS, messages: [{ role: "system", content: system }, ...normalize(messages)] }),
  text: (r) => r.choices?.[0]?.message?.content,
};

// Vertex AI serves Gemini through an OpenAI-compatible chat endpoint, so the openai request builders apply as they are.
// Gemini spends max_tokens on its hidden thinking too, so it gets twice the budget.
export const vertex = {
  url: (project, location = "global") =>
    `https://${location === "global" ? "" : location + "-"}aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`,
  body: (model, system, messages) => ({ ...openai.body(model, system, messages), max_tokens: 2 * MAX_TOKENS }),
  text: openai.text,
};

// Signed assertion for Google's OAuth token endpoint (service account flow, RS256). `sign` is crypto.sign-like so this stays pure.
export function serviceAccountAssertion(creds, now, sign) {
  const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({ iss: creds.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: creds.token_uri, iat, exp: iat + 3600 });
  return `${head}.${claims}.${sign(`${head}.${claims}`, creds.private_key).toString("base64url")}`;
}

// opencode's stateless text endpoint takes a single prompt string, so the history is flattened into it.
export function opencodePrompt(system, messages) {
  const transcript = normalize(messages).map((m) => `${m.role === "user" ? "用户" : "你"}：${m.content}`).join("\n");
  return `${system}\n\n以下是对话记录，请只写"你"的下一条回复（不要带"你："前缀）。\n${transcript}\n你：`;
}
