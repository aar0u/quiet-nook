// Pure request builders and reply extractors for each chat backend, so they can be tested without a network.

// Providers want the first turn from the user and alternating roles; the app can store neither.
export function normalize(messages) {
  const out = [];
  for (const m of messages) {
    if (!out.length && m.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

export const anthropic = {
  url: (base) => `${base}/v1/messages`,
  headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  body: (model, system, messages) => ({ model, max_tokens: 400, system, messages: normalize(messages) }),
  text: (r) => r.content?.map((c) => c.text ?? "").join(""),
};

export const openai = {
  url: (base) => `${base}/chat/completions`,
  headers: (key) => ({ authorization: `Bearer ${key}` }),
  body: (model, system, messages) => ({ model, max_tokens: 400, messages: [{ role: "system", content: system }, ...normalize(messages)] }),
  text: (r) => r.choices?.[0]?.message?.content,
};

// opencode's stateless text endpoint takes a single prompt string, so the history is flattened into it.
export function opencodePrompt(system, messages) {
  const transcript = normalize(messages).map((m) => `${m.role === "user" ? "用户" : "你"}：${m.content}`).join("\n");
  return `${system}\n\n以下是对话记录，请只写"你"的下一条回复（不要带"你："前缀）。\n${transcript}\n你：`;
}
