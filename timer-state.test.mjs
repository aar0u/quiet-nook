import assert from "node:assert/strict";
import test from "node:test";
import { remainingSeconds, restoreTimer } from "./public/timer-state.js";

const durations = { focus: 25, break: 5 };

test("running timer uses elapsed wall time", () => {
  const timer = { mode: "focus", left: 60, running: true, endAt: 160000 };
  assert.equal(remainingSeconds(timer, 130000), 30);
  assert.equal(remainingSeconds(timer, 200000), 0);
  assert.equal(restoreTimer(timer, durations, 130000).left, 30);
});

test("expired timer advances once and pauses the next phase", () => {
  assert.deepEqual(restoreTimer({ mode: "focus", left: 60, running: true, endAt: 1000 }, durations, 10000000),
    { mode: "break", left: 300, running: false, endAt: 0, finished: "focus" });
  assert.deepEqual(restoreTimer({ mode: "break", left: 20, running: true, endAt: 1000 }, durations, 2000),
    { mode: "focus", left: 1500, running: false, endAt: 0, finished: "break" });
});

test("paused and invalid saved timers do not run", () => {
  assert.equal(restoreTimer({ mode: "focus", left: 42, running: false }, durations, 999999).left, 42);
  assert.equal(restoreTimer({ mode: "focus", left: -1, running: false }, durations), null);
  assert.equal(restoreTimer({ mode: "focus", left: 42, running: true, endAt: null }, durations), null);
});
