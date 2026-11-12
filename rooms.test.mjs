import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

globalThis.matchMedia = () => ({ matches: false });
globalThis.location = { search: "" };
const { ROOMS, SCENES, LOOKS } = await import("./public/char.js");
const publicDir = path.resolve("public");

test("each room exposes its own scenes, looks, and assets", async () => {
  assert.deepEqual(ROOMS.map((room) => room.id), ["floor", "desk"]);
  assert.deepEqual(SCENES.filter((scene) => scene.room === "floor").map((scene) => scene.name), ["午后"]);
  assert.deepEqual(SCENES.filter((scene) => scene.room === "desk").map((scene) => scene.name), ["午后", "黄昏", "雨夜", "雪夜"]);
  assert.deepEqual(LOOKS.filter((look) => look.room === "floor").map((look) => look.name), ["托腮", "轻搭"]);
  assert.deepEqual(LOOKS.filter((look) => look.room === "desk").map((look) => look.name), ["居家", "睡前", "成熟"]);
  assert.equal(new Set(SCENES.map((scene) => scene.id)).size, SCENES.length);
  assert.equal(new Set(LOOKS.map((look) => look.id)).size, LOOKS.length);

  const clock = JSON.parse(await readFile(path.join(publicDir, "props", "clock.json"), "utf8"));
  for (const scene of SCENES) {
    await access(path.join(publicDir, scene.src || `scene/${scene.id}/plate.webp`));
    if (scene.room === "desk") {
      assert.ok(clock[scene.id]);
      await access(path.join(publicDir, "props", `clock_${scene.id}.webp`));
    }
  }
  for (const look of LOOKS) {
    if (look.src) {
      await access(path.join(publicDir, look.src));
      continue;
    }
    const dir = path.join(publicDir, "looks", look.dir);
    await access(path.join(dir, "neutral.webp"));
    const faces = JSON.parse(await readFile(path.join(dir, "faces.json"), "utf8"));
    for (const face of Object.keys(faces)) await access(path.join(dir, `${face}.webp`));
  }
});
