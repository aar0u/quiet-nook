import assert from "node:assert/strict";
import test from "node:test";
import { bubbleDuration, bubblePages } from "./public/bubble-text.js";

test("bubble pages preserve text and stay within the character limit", () => {
  for (const text of ["短句。接下来是一句比较长的话，可以分开显示。最后一句！", "很".repeat(100), "🙂".repeat(45), ""]) {
    const pages = bubblePages(text, 20);
    assert.equal(pages.join(""), text);
    assert.ok(pages.every((page) => Array.from(page).length <= 20));
  }
  assert.deepEqual(bubblePages("字".repeat(20) + "。", 20), ["字".repeat(19), "字。"]);
});

test("bubble pages drop paragraph breaks and edge whitespace", () => {
  assert.deepEqual(bubblePages("第一段。\n\n要是真能坐在你旁边。\n", 20), ["第一段。要是真能坐在你旁边。"]);
  assert.deepEqual(bubblePages("  \n"), []);
});

test("bubble reading time grows with length and stays bounded", () => {
  assert.equal(bubbleDuration("短句"), 3500);
  assert.ok(bubbleDuration("字".repeat(30)) > bubbleDuration("短句"));
  assert.equal(bubbleDuration("字".repeat(100)), 12000);
});
