import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

globalThis.matchMedia = () => ({ matches: false });
globalThis.location = { search: "" };
const { ROOMS, SCENES, LOOKS, EXPRESSIONS } = await import("./public/char.js");
const publicDir = path.resolve("public");

test("each room exposes its own scenes, looks, and assets", async () => {
  assert.deepEqual(ROOMS.map((room) => room.id), ["floor", "desk"]);
  assert.deepEqual(SCENES.filter((scene) => scene.room === "floor").map((scene) => scene.name), ["午后"]);
  assert.deepEqual(SCENES.filter((scene) => scene.room === "desk").map((scene) => scene.name), ["午后", "黄昏", "雨夜", "雪夜"]);
  assert.deepEqual(LOOKS.filter((look) => look.room === "floor").map((look) => look.name), ["托腮", "轻搭"]);
  assert.deepEqual(LOOKS.filter((look) => look.room === "desk").map((look) => look.name), ["居家", "外出", "睡前"]);
  assert.equal(new Set(SCENES.map((scene) => scene.id)).size, SCENES.length);
  assert.equal(new Set(LOOKS.map((look) => look.id)).size, LOOKS.length);

  await access(path.join(publicDir, "props", "clock.png"));
  for (const scene of SCENES) {
    await access(path.join(publicDir, scene.src || `scene/${scene.id}/plate.webp`));
  }
  for (const look of LOOKS) {
    await access(path.join(publicDir, look.src));
    if (!look.faces) continue;
    assert.equal(look.fullFaces, true);
    for (const face of [...EXPRESSIONS.filter((name) => name !== "neutral"), "blink"]) {
      await access(path.join(publicDir, look.faces, `${face}.webp`));
    }
  }
});
