import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

globalThis.matchMedia = () => ({ matches: false });
globalThis.location = { search: "" };
const { ROOMS, SCENES, LOOKS, EXPRESSIONS, headBounds, cropFit, coverFit } = await import("./public/char.js");
const publicDir = path.resolve("public");

test("a companion crop is centred in the window and keeps its aspect", () => {
  const crop = [270, 0, 980, 934];
  for (const [w, h] of [[400, 526], [800, 526], [400, 1000]]) {
    const { s, ox, oy } = cropFit(crop, w, h);
    const left = crop[0] * s + ox, right = crop[2] * s + ox, top = crop[1] * s + oy, bottom = crop[3] * s + oy;
    assert.ok(left >= -1e-9 && top >= -1e-9 && right <= w + 1e-9 && bottom <= h + 1e-9);
    assert.ok(Math.abs(left - (w - right)) < 1e-9 && Math.abs(top - (h - bottom)) < 1e-9);
  }
});

test("the cover fit fills the window and starts right of the desk clock", () => {
  for (const [w, h] of [[430, 526], [1440, 900], [300, 900]]) {
    const { s, ox, oy } = coverFit(w, h);
    assert.ok(oy <= 1e-9 && 1672 * s + ox >= w - 1e-9 && 941 * s + oy >= h - 1e-9);
    if (w < 1000) assert.ok(Math.abs(232 * s + ox) < 1e-9);  // the window's left edge is world x 232
  }
});

test("every look with a companion crop has a patch inside it", () => {
  for (const look of LOOKS.filter((l) => l.companion)) {
    const [x0, y0, x1, y1] = look.companion.crop, [cx, cy, rx, ry] = look.companion.patch;
    assert.ok(cx - rx >= x0 && cx + rx <= x1 && cy - ry >= y0 && cy + ry <= y1, look.id);
  }
});

test("head bounds use the upper part of the visible silhouette", () => {
  const width = 10, height = 10, pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 2; y <= 8; y++) for (let x = y < 5 ? 3 : 1; x <= (y < 5 ? 6 : 8); x++) pixels[(y * width + x) * 4 + 3] = 255;
  assert.deepEqual(headBounds(pixels, width, height), { left: 0.3, right: 0.7, top: 0.2, bottom: 0.5 });
  assert.equal(headBounds(new Uint8ClampedArray(4), 1, 1), null);
});

test("each room exposes its own scenes, looks, and assets", async () => {
  assert.deepEqual(ROOMS.map((room) => room.id), ["floor", "desk"]);
  assert.deepEqual(SCENES.filter((scene) => scene.room === "floor").map((scene) => scene.name), ["地毯"]);
  assert.deepEqual(SCENES.filter((scene) => scene.room === "desk").map((scene) => scene.name), ["午后", "黄昏", "雨夜", "雪夜"]);
  assert.deepEqual(LOOKS.filter((look) => look.room === "floor").map((look) => look.name), ["托腮", "轻搭"]);
  assert.deepEqual(LOOKS.filter((look) => look.room === "floor").map((look) => look.id), ["floor-cheek", "floor-rest"]);
  assert.deepEqual(LOOKS.filter((look) => look.room === "desk").map((look) => look.name), ["居家", "外出", "睡前"]);
  assert.equal(new Set(SCENES.map((scene) => scene.id)).size, SCENES.length);
  assert.equal(new Set(LOOKS.map((look) => look.id)).size, LOOKS.length);

  await access(path.join(publicDir, "props", "clock.png"));
  for (const scene of SCENES) {
    await access(path.join(publicDir, "scene", scene.id, "plate.webp"));
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
