export const EXPRESSIONS = ["neutral", "happy", "shy", "sleepy", "think", "cheer"];
export const ROOMS = [{ id: "floor", name: "地毯" }, { id: "desk", name: "书桌" }];
const PANES = [[964, 165, 266, 365], [1267, 145, 270, 385]];
export const SCENES = [
  { id: "day4", room: "floor", name: "午后", src: "art/afternoon.png", look: { tint: [1.0, 0.98, 0.94], shadow: [-10, 12] }, clock: [161, 825, 23, 85, 780, 230, 870] },
  { id: "day", room: "desk", name: "午后", noSteam: true, fx: "dust", dust: "255,240,200", look: { tint: [1.0, 0.98, 0.94], shadow: [-10, 12] } },
  { id: "dusk", room: "desk", name: "黄昏", fx: "dust", dust: "255,205,150", lamp: { pos: [150, 560], rgb: [1.0, 0.66, 0.3], k: 0.14 }, look: { tint: [1.0, 0.86, 0.74], shadow: [-8, 12] } },
  { id: "rain", room: "desk", name: "雨夜", fx: "rain", glass: PANES, lamp: { pos: [150, 560], rgb: [1.0, 0.72, 0.4], k: 0.16 }, look: { tint: [0.9, 0.9, 0.97], shadow: [10, 12] } },
  { id: "snow", room: "desk", name: "雪夜", fx: "snow", glass: PANES, lamp: { pos: [150, 560], rgb: [1.0, 0.74, 0.44], k: 0.15 }, look: { tint: [0.92, 0.92, 0.98], shadow: [10, 12] } },
];
const CLOCK_LIGHTS = {
  day: { shade: 0, rgb: [255, 210, 155], glow: 0.04 },
  dusk: { shade: 0.08, rgb: [255, 150, 75], glow: 0.16 },
  rain: { shade: 0.14, rgb: [255, 165, 100], glow: 0.14 },
  snow: { shade: 0.12, rgb: [255, 185, 125], glow: 0.12 },
};
export const LOOKS = [
  { id: "default", room: "floor", name: "托腮", src: "art/cheek.webp", fit: [0.72, 600, 700, -120] },
  { id: "wrist2", room: "floor", name: "轻搭", src: "art/rest.webp", fit: [0.72, 600, 700, -120] },
  { id: "desk-default", room: "desk", name: "居家", src: "looks/default/neutral.webp", faces: "looks/default", fullFaces: true, fit: [0.82, 0, 520, 52] },
  { id: "desk-rose", room: "desk", name: "外出", src: "looks/rose/neutral.webp", faces: "looks/rose", fullFaces: true, fit: [0.95, 0, 120, 158] },
  { id: "desk-sleep", room: "desk", name: "睡前", src: "looks/sleep/neutral.webp", faces: "looks/sleep", fullFaces: true, fit: [0.7, 0, 686, 191], when: "break" },
];
const FACE_LAYOUTS = {
  "looks/default": {
    blinkOrigin: [430, 220], blinkRects: [[430, 245, 105, 80], [548, 220, 105, 83]],
    blinkPolygons: [
      [[445, 245], [535, 245], [535, 325], [440, 325], [430, 300], [430, 280], [440, 260]],
      [[548, 220], [620, 220], [640, 235], [649, 250], [653, 265], [645, 280], [630, 303], [548, 303]],
    ],
  },
  "looks/rose": { blinkOrigin: [300, 285], blinkRects: [[300, 300, 75, 55], [400, 285, 85, 60]] },
  "looks/sleep": {
    blinkOrigin: [350, 370], blinkRects: [[350, 425, 100, 65], [475, 370, 105, 70]],
    blinkPolygons: [
      [[365, 438], [390, 429], [425, 432], [437, 440], [438, 466], [425, 478], [395, 486], [370, 481], [355, 472], [355, 452]],
      [[490, 382], [515, 371], [550, 374], [565, 385], [568, 401], [558, 416], [535, 426], [510, 429], [488, 421], [481, 410], [482, 395]],
    ],
  },
};
// Some generated frames need alignment to the neutral sprite before cross-fading.
const FULL_FRAME_FITS = {
  "looks/rose": { happy: [0.7809, -263.1, 114.6], think: [0.9363, 17.5, 16.3] },
  "looks/sleep": { sleepy: [0.8002, -178.5, 123.2] },
};
const FADE_MS = 250;
const NO_LINE_START = "，。！？、；：）」』”…～,.!?;:)";
const BUBBLE = { x: 24, y: 70, w: 340, pad: 20, line: 34, font: "23px system-ui, 'PingFang SC', 'Noto Sans CJK SC', sans-serif" };

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

let scene = SCENES[0], expr = "neutral", loadToken = 0, lookToken = 0;
let gl, loc, ctx2d;
let look = LOOKS[0], looks = {};  // looks[id] = her frames {face: {img, tex}}, loaded on first use
let her = null;   // the current look's frames
let room = null;  // the current scene's plate {plate, plateTex}
let A = null, B = null, mixStart = 0, mixMs = FADE_MS, dirty = true;
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
let fx, fxc, last = 0, parts = [];
const clock = { time: "25:00", mode: "专注", running: false, ringUntil: 0 };
let onClick = () => {};
const bubble = { text: "", lines: null, wrapW: 0, t0: 0 };
const view = { x0: 0, x1: 1672 };

// ---------------- scene (WebGL) ----------------
const VS = `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;
// Displacements are in world pixels; uv is the frame, y down. Her frames are premultiplied RGBA, so mixing two of
// them is a correct cross-fade and "over" is simply her + room * (1 - her.a).
// highp: the shader takes seconds since the page opened as a phase, and in mediump (16-bit on some GPUs) that loses
// precision as the page stays open, so the motion gets steppy after a long session.
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uA, uB, uPlate; uniform float uMix, uT; uniform vec2 uMouse, uShadow;
uniform vec3 uTint, uLampRgb; uniform vec4 uFit, uLamp;  // uLamp: x, y, k (strength, 0 = off), unused
varying vec2 uv;
vec4 her(vec2 p){
  // uFit places the look in the room: scale about an anchor point (px), then shift right by dx px
  vec2 size = vec2(1672., 941.);
  vec2 q = (uFit.yz + (p * size - uFit.yz - vec2(uFit.w, 0.)) / uFit.x) / size;
  return mix(texture2D(uA, q), texture2D(uB, q), uMix);
}
void main(){
  vec2 px = uv * vec2(1672., 941.);
  vec2 inv = 1. / vec2(1672., 941.);
  vec4 h0 = her(uv);
  float rest = 1. - smoothstep(700., 780., px.y);
  float body = smoothstep(380., 520., px.y) * (1. - smoothstep(620., 760., px.y));
  float head = 1. - smoothstep(380., 520., px.y);
  vec2 d = vec2(0., -sin(uT * 1.2) * (1.2 + 2.2 * body) * rest);  // breathing, strongest at the shoulders
  d += vec2(uMouse.x * 2.6 + sin(uT * .45), uMouse.y * 1.1) * head; // head leans toward the cursor
  float lum = dot(h0.rgb, vec3(.299, .587, .114)) / max(h0.a, .001);
  float hair = h0.a * smoothstep(.40, .16, lum) * smoothstep(300., 700., px.y) * rest;
  d.x += hair * sin(uT * .9 + px.y * .012 + px.x * .004) * 1.2;     // long hair sways below the chin
  vec2 p = uv - d * inv;
  vec4 g = her(p);
  vec3 room = texture2D(uPlate, uv).rgb;
  // Lamp glow belongs to the room, so it is added before she is drawn over it: her own colours never change with it.
  vec2 q = (px - uLamp.xy) / vec2(190., 240.);
  q.y -= .35;                                                        // the light falls below the shade
  room += uLampRgb * uLamp.z * exp(-dot(q, q) * 2.2);
  float s = 0.;                                                      // her shadow on the room: her alpha, offset
  for (int i = 0; i < 5; i++) s += her(p - uShadow * (.4 + .35 * float(i)) * inv).a;  // and softened by 5 taps
  room *= 1. - .3 * s / 5.;
  vec3 col = g.rgb * uTint + room * (1. - g.a);
  gl_FragColor = vec4(col, 1.);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function initGL(canvas) {
  gl = canvas.getContext("webgl");
  if (!gl) { ctx2d = canvas.getContext("2d"); return; }  // fallback: static frame swap, no motion
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
  loc = Object.fromEntries(["uA", "uB", "uPlate", "uMix", "uT", "uMouse", "uShadow", "uTint", "uFit", "uLamp", "uLampRgb"].map((n) => [n, gl.getUniformLocation(prog, n)]));
  gl.uniform1i(loc.uA, 0);
  gl.uniform1i(loc.uB, 1);
  gl.uniform1i(loc.uPlate, 2);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function upload(img, premultiply) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);  // so linear filtering never blends in dark fringes
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t;
}

async function decode(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

async function loadLook(l) {
  if (looks[l.id]) return looks[l.id];
  const frame = (img) => ({ img, tex: gl ? upload(img, true) : null });
  const img = await decode(l.src);
  const set = { neutral: frame(img) };
  if (l.fullFaces) {
    const names = EXPRESSIONS.filter((name) => name !== "neutral");
    const variants = await Promise.all(names.map((name) => decode(`${l.faces}/${name}.webp`)));
    names.forEach((name, i) => {
      const fit = FULL_FRAME_FITS[l.faces]?.[name];
      if (!fit) { set[name] = frame(variants[i]); return; }
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const [scale, x, y] = fit;
      canvas.getContext("2d").drawImage(variants[i], x, y, variants[i].width * scale, variants[i].height * scale);
      set[name] = frame(canvas);
    });
  }
  if (l.faces) {
    const layout = FACE_LAYOUTS[l.faces], variant = await decode(`${l.faces}/blink.webp`);
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    for (const [index, [x, y, w, h]] of layout.blinkRects.entries()) {
      const patch = document.createElement("canvas");
      patch.width = w; patch.height = h;
      const pc = patch.getContext("2d");
      const [sourceX, sourceY] = layout.blinkOrigin;
      pc.drawImage(variant, x - sourceX, y - sourceY, w, h, 0, 0, w, h);
      pc.globalCompositeOperation = "destination-in";
      for (const [dx, dy, size] of [[w, 0, w], [0, h, h]]) {
        const gradient = pc.createLinearGradient(0, 0, dx, dy);
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(6 / size, "black");
        gradient.addColorStop(1 - 6 / size, "black");
        gradient.addColorStop(1, "transparent");
        pc.fillStyle = gradient;
        pc.fillRect(0, 0, w, h);
      }
      if (layout.blinkPolygons) {
        const points = layout.blinkPolygons[index];
        pc.beginPath();
        points.forEach(([px, py], i) => i ? pc.lineTo(px - x, py - y) : pc.moveTo(px - x, py - y));
        pc.closePath();
        pc.fillStyle = "black";
        pc.fill();
      }
      ctx.drawImage(patch, x, y);
    }
    set.blink = frame(canvas);
  }
  return (looks[l.id] = set);
}

export async function setLook(id) {
  const token = ++lookToken;
  const next = LOOKS.find((l) => l.id === id) || LOOKS[0];
  const set = await loadLook(next);
  if (token !== lookToken) return look.id;
  if (next === look && her) return next.id;
  look = next;
  her = set;
  B = her[expr] || her.neutral;
  A = B;
  mixStart = performance.now();
  mixMs = 700;
  dirty = true;
  return next.id;
}

function lightClock(img, light) {
  if (!light) return img;
  const canvas = document.createElement("canvas");
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = `rgba(0,0,0,${light.shade})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createRadialGradient(canvas.width * 0.55, 0, 0, canvas.width * 0.55, 0, canvas.width * 0.75);
  const [r, g, b] = light.rgb;
  gradient.addColorStop(0, `rgba(${r},${g},${b},${light.glow})`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

async function loadScene() {
  const token = ++loadToken;
  const selected = scene;
  const [plate, clockImg] = await Promise.all([
    decode(selected.src || `scene/${selected.id}/plate.webp`),
    selected.room === "desk" ? decode("props/clock.png") : null,
  ]);
  if (token !== loadToken) return;  // a newer scene was picked while loading
  if (gl && room) gl.deleteTexture(room.plateTex);
  room = { id: selected.id, plate, plateTex: gl ? upload(plate, false) : null, clockImg: clockImg && lightClock(clockImg, CLOCK_LIGHTS[selected.id]) };
  dirty = true;
}

function drawScene(now, t) {
  const mix = Math.min(1, (now - mixStart) / mixMs);
  if (mix >= 1) A = B;
  if (!gl) {
    ctx2d.drawImage(room.plate, 0, 0);
    const [scale, x, y, shift] = look.fit;
    ctx2d.drawImage(B.img, x * (1 - scale) + shift, y * (1 - scale), B.img.width * scale, B.img.height * scale);
    return;
  }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B.tex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, room.plateTex);
  gl.uniform3f(loc.uTint, ...scene.look.tint);
  gl.uniform4f(loc.uFit, ...look.fit);
  gl.uniform2f(loc.uShadow, ...scene.look.shadow);
  const lamp = scene.lamp, flick = still ? 1 : 1 + 0.04 * Math.sin(t * 1.7) + 0.025 * Math.sin(t * 5.3 + 1);
  gl.uniform4f(loc.uLamp, lamp ? lamp.pos[0] : 0, lamp ? lamp.pos[1] : 0, lamp ? lamp.k * flick : 0, 0);
  gl.uniform3f(loc.uLampRgb, ...(lamp ? lamp.rgb : [0, 0, 0]));
  gl.uniform1f(loc.uMix, mix);
  gl.uniform1f(loc.uT, still || scene.room === "floor" ? 0 : t);
  gl.uniform2f(loc.uMouse, still || scene.room === "floor" ? 0 : mouse.x, still || scene.room === "floor" ? 0 : mouse.y);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function spawn(rects) {
  const total = rects.reduce((sum, r) => sum + r[2] * r[3], 0);
  let k = Math.random() * total, rect = rects[0];
  for (const r of rects) { k -= r[2] * r[3]; if (k <= 0) { rect = r; break; } }
  return [rect[0] + rand(0, rect[2]), rect[1] + rand(0, rect[3])];
}

function makeParts() {
  parts = [];
  if (scene.fx === "rain") for (let i = 0; i < 80; i++) {
    const [x, y] = spawn(scene.glass);
    parts.push({ x, y, len: rand(14, 30), v: rand(650, 1100), a: rand(0.12, 0.3) });
  }
  if (scene.fx === "snow") for (let i = 0; i < 90; i++) {
    const [x, y] = spawn(scene.glass);
    parts.push({ x, y, r: rand(1, 2.7), v: rand(25, 70), ph: rand(0, 6.3), amp: rand(8, 22), a: rand(0.55, 0.95) });
  }
  if (scene.fx === "dust") for (let i = 0; i < 30; i++) {
    parts.push({ x: rand(380, 1450), y: rand(180, 820), r: rand(1, 2.6), vx: rand(-6, 6), vy: rand(-12, -3), ph: rand(0, 6.3) });
  }
}

function drawFx(dt, t) {
  if (scene.room !== "desk") return;
  if (scene.fx === "rain" || scene.fx === "snow") {
    const bottom = Math.max(...scene.glass.map((r) => r[1] + r[3]));
    fx.save();
    fx.beginPath();
    for (const r of scene.glass) fx.rect(...r);
    fx.clip();
    for (const p of parts) {
      p.y += p.v * dt;
      if (scene.fx === "rain") {
        if (p.y > bottom) [p.x, p.y] = spawn(scene.glass), p.y = -p.len;
        fx.strokeStyle = `rgba(190,210,255,${p.a})`;
        fx.lineWidth = 1.2;
        fx.beginPath(); fx.moveTo(p.x, p.y); fx.lineTo(p.x - p.len * 0.12, p.y + p.len); fx.stroke();
      } else {
        p.x += Math.sin(t * 0.8 + p.ph) * p.amp * dt;
        if (p.y > bottom) [p.x, p.y] = spawn(scene.glass), p.y = -4;
        fx.fillStyle = `rgba(255,255,255,${p.a})`;
        fx.beginPath(); fx.arc(p.x, p.y, p.r, 0, 6.283); fx.fill();
      }
    }
    fx.restore();
  } else if (scene.fx === "dust") {
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < 160) { p.y = 820; p.x = rand(380, 1450); }
      fx.fillStyle = `rgba(${scene.dust},${0.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 + p.ph))})`;
      fx.beginPath(); fx.arc(p.x, p.y, p.r, 0, 6.283); fx.fill();
    }
  }
  if (!scene.noSteam) for (let i = 0; i < 5; i++) {
    const age = (t / 3.2 + i / 5) % 1;
    const x = 1325 + Math.sin(age * 5 + i * 2) * 9, y = 715 - age * 85, r = 7 + age * 17;
    const alpha = 0.13 * (1 - age) * Math.min(1, age * 8);
    const g = fx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    fx.fillStyle = g;
    fx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function drawClock(t, now) {
  if (scene.room === "desk") return drawDeskClock(t, now);
  const c = clock;
  fx.save();
  fx.fillStyle = "#f4d5a2";
  fx.textAlign = "center";
  fx.textBaseline = "middle";
  const [x, y, size] = scene.clock;
  fx.transform(1, -0.13, 0, 0.9, x, y);
  fx.font = `600 ${size}px ui-monospace, monospace`;
  fx.fillText(c.time, 0, 0);
  fx.restore();
}

function softEllipse(rx, ry, rgb, alpha) {
  fx.save();
  fx.scale(1, ry / rx);
  const g = fx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  fx.fillStyle = g;
  fx.fillRect(-rx, -rx, rx * 2, rx * 2);
  fx.restore();
}

const DESK_CLOCK = { x: 56, y: 910, width: 175 };

function drawDeskClock(t, now) {
  if (!room.clockImg) return;
  const w = DESK_CLOCK.width, h = w * room.clockImg.height / room.clockImg.width;
  const ring = now < clock.ringUntil && !still;
  fx.save();
  fx.translate(DESK_CLOCK.x + w / 2, DESK_CLOCK.y);
  fx.rotate(ring ? Math.sin(t * 50) * 2.5 * Math.PI / 180 : 0);
  softEllipse(w * 0.85, 18, "0,0,0", 0.28);
  softEllipse(w * 0.5, 8, "0,0,0", 0.3);
  fx.drawImage(room.clockImg, -w / 2, -h + 1, w, h);
  fx.fillStyle = "#141313";
  fx.beginPath();
  fx.roundRect(-w * 0.44, -h * 0.785 + 1, w * 0.87, h * 0.625, h * 0.1);
  fx.fill();
  const lit = clock.running || (ring && Math.floor(t * 5) % 2 === 0);
  fx.fillStyle = "#ffb561";
  fx.shadowColor = "rgba(255,154,60,0.7)";
  fx.shadowBlur = lit ? 6 : 0;
  fx.textAlign = "center";
  fx.textBaseline = "middle";
  fx.globalAlpha = lit ? 1 : 0.55;
  fx.font = "600 30px ui-monospace, 'DejaVu Sans Mono', monospace";
  fx.fillText(clock.time, -w * 0.005, -h * 0.435 + 1);
  fx.restore();
}

function hitClock(x, y) {
  if (scene.room === "desk") {
    const w = DESK_CLOCK.width, h = w * (room?.clockImg ? room.clockImg.height / room.clockImg.width : 2 / 3);
    return x >= DESK_CLOCK.x && x <= DESK_CLOCK.x + w && y > DESK_CLOCK.y - h && y < DESK_CLOCK.y + 4;
  }
  const [, , , left, top, right, bottom] = scene.clock;
  return x >= left && x <= right && y >= top && y <= bottom;
}

function worldPoint(e) {
  const r = fxc.getBoundingClientRect();
  return [(e.clientX - r.left) * fxc.width / r.width, (e.clientY - r.top) * fxc.height / r.height];
}

export function setClock(s) { Object.assign(clock, s); dirty = true; }
export function ringClock(ms) { clock.ringUntil = performance.now() + ms; dirty = true; }
export function onClockClick(cb) { onClick = cb; }

// ---------------- speech bubble (also on the canvas, so the side panel is the only DOM) ----------------
export function say(text) { bubble.text = text; bubble.lines = null; bubble.t0 = performance.now(); dirty = true; }
// The part of the world (x range, world pixels) that is on screen; app.js sets it whenever the layout changes.
export function setView(x0, x1) { view.x0 = x0; view.x1 = x1; dirty = true; }

function wrap(text, width) {
  fx.font = BUBBLE.font;
  const lines = [];
  let cur = "";
  for (const ch of text) {
    // a line may not start with closing punctuation, so it hangs over the right edge instead
    if (fx.measureText(cur + ch).width > width - 2 * BUBBLE.pad && !NO_LINE_START.includes(ch)) { lines.push(cur); cur = ch; } else cur += ch;
  }
  return cur ? [...lines, cur] : lines;
}

function drawBubble(now) {
  if (!bubble.text) return;
  const { pad, line } = BUBBLE;
  // Normally the bubble sits left of her head with its tail pointing at her. When the window is narrow and the
  // room is cropped (view is the part of the world on screen), it moves to the top centre of what is visible.
  const vw = view.x1 - view.x0;
  const roomy = view.x0 <= BUBBLE.x - 12 && vw >= 760;
  const w = roomy ? BUBBLE.w : Math.min(BUBBLE.w, vw - 48);
  const x = roomy ? BUBBLE.x : view.x0 + (vw - w) / 2;
  const y = roomy ? BUBBLE.y : 24;
  if (!bubble.lines || bubble.wrapW !== w) { bubble.wrapW = w; bubble.lines = wrap(bubble.text, w); }
  const h = bubble.lines.length * line + pad * 1.4;
  fx.save();
  fx.globalAlpha = Math.min(1, (now - bubble.t0) / 200);
  // Body and tail are one path. The outline is stroked first and the opaque fill then covers the inner half of
  // the stroke, so no line is left across the joint between the body and the tail.
  fx.beginPath();
  fx.roundRect(x, y, w, h, 20);
  if (roomy) {                               // tail towards her head
    fx.moveTo(x + w - 4, y + h * 0.55);
    fx.lineTo(x + w + 30, y + h * 0.55 + 24);
    fx.lineTo(x + w - 4, y + h * 0.55 + 22);
  } else {                                   // tail pointing down at her
    fx.moveTo(x + w / 2 - 14, y + h - 4);
    fx.lineTo(x + w / 2, y + h + 22);
    fx.lineTo(x + w / 2 + 14, y + h - 4);
  }
  fx.closePath();
  fx.strokeStyle = "rgba(255,255,255,0.28)";
  fx.lineWidth = 4;
  fx.lineJoin = "round";
  fx.stroke();
  fx.fillStyle = "#1e1b34";
  fx.fill();
  fx.fillStyle = "#f1ecfa";
  fx.font = BUBBLE.font;
  fx.textBaseline = "top";
  bubble.lines.forEach((l, i) => fx.fillText(l, x + pad, y + pad * 0.7 + i * line));
  fx.restore();
}

// ---------------- state ----------------
function setFrame(name, ms = FADE_MS) {
  if (!her) return;
  const f = her[name] || her.neutral;
  if (f === B) return;
  A = B;
  B = f;
  mixStart = performance.now() - (still ? ms : 0);
  mixMs = ms;
  dirty = true;
}

export function setScene(id) {
  scene = SCENES.find((s) => s.id === id) || SCENES[0];
  makeParts();
  loadScene();
  return scene.id;
}

export function setExpression(e) {
  expr = EXPRESSIONS.includes(e) ? e : "neutral";
  setFrame(expr, look.fullFaces ? 100 : FADE_MS);
}

function scheduleBlink() {
  setTimeout(() => {
    if (look.room === "desk" && expr === "neutral" && !document.hidden) {
      const patched = Boolean(look.faces);
      setFrame("blink", patched ? 90 : 60);
      setTimeout(() => { if (look.room === "desk" && expr === "neutral") setFrame("neutral", patched ? 130 : 90); }, patched ? 200 : 140);
    }
    scheduleBlink();
  }, rand(2500, 6000));
}

function tick(now) {
  requestAnimationFrame(tick);
  if (!her || !room || room.id !== scene.id || look.room !== scene.room || now - last < 8) return;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (still && !dirty) return;
  mouse.x += (mouse.tx - mouse.x) * 0.06;
  mouse.y += (mouse.ty - mouse.y) * 0.06;
  const t0 = performance.now();
  drawScene(now, now / 1000);
  if (perf.on && gl) gl.finish();  // wait for the GPU so the number below is its real cost; only while measuring
  const t1 = performance.now();
  fx.clearRect(0, 0, fxc.width, fxc.height);
  drawFx(still ? 0 : dt, now / 1000);
  drawClock(now / 1000, now);
  drawBubble(now);
  if (perf.on) drawPerf(now, t1 - t0, performance.now() - t1);
  dirty = false;
}

// Open the page with ?perf to see frame cost.
const perf = { on: /[?&]perf\b/.test(location.search), gpu: 0, cpu: 0, frames: 0, t0: 0, fps: 0 };
function drawPerf(now, gpu, cpu) {
  perf.gpu += (gpu - perf.gpu) * 0.05;
  perf.cpu += (cpu - perf.cpu) * 0.05;
  perf.frames++;
  if (now - perf.t0 > 1000) { perf.fps = perf.frames * 1000 / (now - perf.t0); perf.frames = 0; perf.t0 = now; }
  fx.save();
  fx.font = "20px monospace";
  fx.fillStyle = "#000a";
  fx.fillRect(view.x0 + 10, 10, 420, 36);
  fx.fillStyle = "#9f9";
  fx.fillText(`${perf.fps.toFixed(0)} fps  scene ${perf.gpu.toFixed(1)} ms  2d ${perf.cpu.toFixed(1)} ms`, view.x0 + 20, 36);
  fx.restore();
}
export function togglePerf() { perf.on = !perf.on; dirty = true; }

export function mountScene(id, lookId = LOOKS[0].id) {
  fxc = $("fx");
  fx = fxc.getContext("2d");
  fx.imageSmoothingQuality = "high";
  initGL($("scene"));
  setLook(lookId);
  setScene(id);
  addEventListener("pointermove", (e) => {
    mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  });
  fxc.addEventListener("pointermove", (e) => { fxc.style.cursor = hitClock(...worldPoint(e)) ? "pointer" : ""; });
  fxc.addEventListener("click", (e) => { if (hitClock(...worldPoint(e))) onClick(); });
  scheduleBlink();
  requestAnimationFrame(tick);
}
