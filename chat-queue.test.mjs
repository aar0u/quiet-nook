import assert from "node:assert/strict";
import test from "node:test";
import { createChatQueue } from "./public/chat-queue.js";

test("chat requests run in order and continue after failure", async () => {
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const send = createChatQueue(async (text) => {
    events.push(`start ${text}`);
    if (text === "first") { await gate; throw new Error("failed"); }
    events.push(`finish ${text}`);
    return text;
  });
  const first = send("first");
  const second = send("second");
  await Promise.resolve();
  assert.deepEqual(events, ["start first"]);
  release();
  await assert.rejects(first, /failed/);
  assert.equal(await second, "second");
  assert.deepEqual(events, ["start first", "start second", "finish second"]);
});
