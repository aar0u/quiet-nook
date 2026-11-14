import assert from "node:assert/strict";
import test from "node:test";
import { anthropic, openai, normalize, opencodePrompt } from "./backends.js";

const msgs = [
  { role: "assistant", content: "stale" },
  { role: "user", content: "a" },
  { role: "user", content: "b" },
  { role: "assistant", content: "c" },
];

test("normalize retains a leading assistant turn and merges same-role neighbours", () => {
  assert.deepEqual(normalize(msgs), [{ role: "user", content: "[Earlier user message is no longer available.]" }, { role: "assistant", content: "stale" }, { role: "user", content: "a\nb" }, { role: "assistant", content: "c" }]);
});

test("request bodies and reply extraction", () => {
  assert.equal(anthropic.body("m", "sys", msgs).system, "sys");
  assert.equal(openai.body("m", "sys", msgs).messages[0].role, "system");
  assert.equal(anthropic.text({ content: [{ text: "hi" }, { text: "!" }] }), "hi!");
  assert.equal(openai.text({ choices: [{ message: { content: "hi" } }] }), "hi");
  assert.match(opencodePrompt("sys", msgs), /用户：a\nb\n你：c\n你：$/);
});
