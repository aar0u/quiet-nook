// The room is one WebGL canvas in a fixed 1672x941 "world" (app.js scales it to the window).
// Each scene has full frames that differ only in her face, plus a mask of her body. The shader draws the
// current frame, then draws her again from the same frame, displaced a few pixels (breathing, hair sway,
// head lean), through the mask. The fx canvas (rain, snow, dust, lamp glow, steam) and DOM props sit above.
export const EXPRESSIONS = ["neutral", "happy", "shy", "sleepy", "think", "cheer"];
const PANES = [[773, 0, 127, 480], [947, 0, 320, 493]];
export const SCENES = [
  { id: "rain", name: "雨夜", fx: "rain", glass: PANES, lamp: [220, 456] },
  { id: "day", name: "午后", fx: "dust", dust: "255,240,200" },
  { id: "dusk", name: "黄昏", fx: "dust", dust: "255,205,150", lamp: [220, 456] },
  { id: "snow", name: "雪夜", fx: "snow", glass: PANES, lamp: [220, 456] },
];
const FRAMES = [...EXPRESSIONS, "blink"];
const MUG = [1267, 652];
const FADE_MS = 250;
// The desk clock sits at the left front of the desk, parallel to its front edge (which rises 3.7 degrees to the right).
const CLOCK = { left: 56, bottom: 905, width: 175, tilt: -3.7, lcdW: 120, lcdH: 44 };
const BUBBLE = { x: 24, y: 70, w: 340, pad: 20, line: 40, font: "28px system-ui, 'PingFang SC', 'Noto Sans CJK SC', sans-serif" };

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

let scene = SCENES[0], expr = "neutral", loadToken = 0;
let gl, loc, ctx2d, tex = null, images = null;
let A = "neutral", B = "neutral", mixStart = 0, mixMs = FADE_MS, dirty = true;
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
let fx, fxc, parts = [], last = 0, blinkTimer;
const clock = { time: "25:00", mode: "专注", running: false, ringUntil: 0, img: null, meta: null };
const clockMeta = fetch("props/clock.json").then((r) => r.json());
let clockToken = 0, onClick = () => {};
const bubble = { text: "", lines: null, t0: 0 };

// ---------------- scene (WebGL) ----------------
const VS = `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;
// Displacements are in world pixels; uv is the frame, y down.
const FS = `precision mediump float;
uniform sampler2D uA, uB, uMask; uniform float uMix, uT; uniform vec2 uMouse;
varying vec2 uv;
void main(){
  vec2 px = uv * vec2(1672., 941.);
  vec4 base = mix(texture2D(uA, uv), texture2D(uB, uv), uMix);
  float rest = 1. - smoothstep(700., 780., px.y);                 // forearms on the desk stay put
  float body = smoothstep(380., 520., px.y) * (1. - smoothstep(620., 760., px.y));
  float head = 1. - smoothstep(380., 520., px.y);
  vec2 d = vec2(0., -sin(uT * 1.2) * (1.2 + 2.2 * body) * rest);  // breathing, strongest at the shoulders
  d += vec2(uMouse.x * 2.6 + sin(uT * .45), uMouse.y * 1.1) * head; // head leans toward the cursor
  float hair = texture2D(uMask, uv).g * smoothstep(300., 700., px.y) * rest;
  d.x += hair * sin(uT * .9 + px.y * .012 + px.x * .004) * 2.4;     // long hair sways below the chin
  vec2 p = uv - d / vec2(1672., 941.);
  float m = texture2D(uMask, p).r;
  vec4 girl = mix(texture2D(uA, p), texture2D(uB, p), uMix);
  gl_FragColor = vec4(mix(base.rgb, girl.rgb, m), 1.);
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
  loc = Object.fromEntries(["uA", "uB", "uMask", "uMix", "uT", "uMouse"].map((n) => [n, gl.getUniformLocation(prog, n)]));
  gl.uniform1i(loc.uA, 0);
  gl.uniform1i(loc.uB, 1);
  gl.uniform1i(loc.uMask, 2);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function upload(img) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t;
}

async function loadScene() {
  const token = ++loadToken, id = scene.id;
  const names = [...FRAMES, "mask"];
  const imgs = await Promise.all(names.map(async (n) => {
    const img = new Image();
    img.src = `scene/${id}/${n}.${n === "mask" ? "png" : "webp"}`;
    await img.decode();
    return img;
  }));
  if (token !== loadToken) return;  // a newer scene was picked while loading
  if (gl) {
    if (tex) for (const t of Object.values(tex)) gl.deleteTexture(t);
    tex = Object.fromEntries(names.map((n, i) => [n, upload(imgs[i])]));
  }
  images = Object.fromEntries(names.map((n, i) => [n, imgs[i]]));
  dirty = true;
}

function drawScene(now, t) {
  const mix = Math.min(1, (now - mixStart) / mixMs);
  if (mix >= 1) A = B;
  if (!gl) { ctx2d.drawImage(images[B], 0, 0); return; }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[A]);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[B]);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.mask);
  gl.uniform1f(loc.uMix, mix);
  gl.uniform1f(loc.uT, still ? 0 : t);
  gl.uniform2f(loc.uMouse, still ? 0 : mouse.x, still ? 0 : mouse.y);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------------- fx (2D canvas, world pixels) ----------------
function spawn(rects) {
  const total = rects.reduce((s, r) => s + r[2] * r[3], 0);
  let k = Math.random() * total, r = rects[0];
  for (const c of rects) { k -= c[2] * c[3]; if (k <= 0) { r = c; break; } }
  return [r[0] + rand(0, r[2]), r[1] + rand(0, r[3])];
}

function makeParts() {
  parts = [];
  const g = scene.glass;
  if (scene.fx === "rain") for (let i = 0; i < 80; i++) { const [x, y] = spawn(g); parts.push({ x, y, len: rand(14, 30), v: rand(650, 1100), a: rand(0.12, 0.3) }); }
  if (scene.fx === "snow") for (let i = 0; i < 90; i++) { const [x, y] = spawn(g); parts.push({ x, y, r: rand(1, 2.7), v: rand(25, 70), ph: rand(0, 6.3), amp: rand(8, 22), a: rand(0.55, 0.95) }); }
  if (scene.fx === "dust") for (let i = 0; i < 30; i++) parts.push({ x: rand(380, 1450), y: rand(180, 820), r: rand(1, 2.6), vx: rand(-6, 6), vy: rand(-12, -3), ph: rand(0, 6.3) });
}

function radial(x, y, r, rgb, a) {
  const g = fx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  fx.fillStyle = g;
  fx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawFx(dt, t) {
  fx.clearRect(0, 0, fxc.width, fxc.height);
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
        fx.beginPath();
        fx.moveTo(p.x, p.y);
        fx.lineTo(p.x - p.len * 0.12, p.y + p.len);
        fx.stroke();
      } else {
        p.x += Math.sin(t * 0.8 + p.ph) * p.amp * dt;
        if (p.y > bottom) [p.x, p.y] = spawn(scene.glass), p.y = -4;
        fx.fillStyle = `rgba(255,255,255,${p.a})`;
        fx.beginPath();
        fx.arc(p.x, p.y, p.r, 0, 6.283);
        fx.fill();
      }
    }
    fx.restore();
  } else if (scene.fx === "dust") {
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < 160) { p.y = 820; p.x = rand(380, 1450); }
      fx.fillStyle = `rgba(${scene.dust},${0.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 + p.ph))})`;
      fx.beginPath();
      fx.arc(p.x, p.y, p.r, 0, 6.283);
      fx.fill();
    }
  }
  if (scene.lamp) {
    fx.globalCompositeOperation = "lighter";
    radial(scene.lamp[0], scene.lamp[1], 200, "255,190,110", 0.07 + 0.035 * Math.sin(t * 2.1 + Math.sin(t * 7) * 0.6));
    fx.globalCompositeOperation = "source-over";
  }
  for (let i = 0; i < 5; i++) {
    const age = ((t / 3.2) + i / 5) % 1;
    radial(MUG[0] + Math.sin(age * 5 + i * 2) * 9, MUG[1] - age * 85, 7 + age * 17, "255,255,255", 0.13 * (1 - age) * Math.min(1, age * 8));
  }
}

// ---------------- desk clock (drawn on the fx canvas) ----------------
async function loadClock(id) {
  const token = ++clockToken;
  const img = new Image();
  img.src = `props/clock_${id}.webp`;
  const [meta] = await Promise.all([clockMeta, img.decode()]);
  if (token !== clockToken) return;
  Object.assign(clock, { img, meta: meta[id] });
  dirty = true;
}

function softEllipse(rx, ry, rgb, a) {
  fx.save();
  fx.scale(1, ry / rx);
  radial(0, 0, rx, rgb, a);
  fx.restore();
}

function drawClock(t, now) {
  const c = clock;
  if (!c.img) return;
  const w = CLOCK.width, h = w / c.meta.aspect;
  const ring = now < c.ringUntil && !still;
  fx.save();
  fx.translate(CLOCK.left + w / 2, CLOCK.bottom);
  // The sprite's feet already slope a little; subtract that so the line through the feet follows the desk edge.
  fx.rotate((CLOCK.tilt - c.meta.slope + (ring ? Math.sin(t * 50) * 2.5 : 0)) * Math.PI / 180);
  softEllipse(w * 0.85, 18, "0,0,0", 0.28);   // wide soft shadow
  softEllipse(w * 0.5, 8, "0,0,0", 0.3);
  for (const [fxn, fyn] of c.meta.feet) {     // a dark contact patch right under each foot
    fx.save();
    fx.translate(fxn * w - w / 2, fyn * h - h);
    softEllipse(w * 0.09, 4.5, "0,0,0", 0.85);
    fx.restore();
  }
  if (c.running || ring) {                    // the lit display glows on the desk in front of it
    fx.globalCompositeOperation = "lighter";
    fx.translate(0, 8);
    softEllipse(w * 0.8, 22, "255,160,70", 0.1);
    fx.translate(0, -8);
    fx.globalCompositeOperation = "source-over";
  }
  fx.drawImage(c.img, -w / 2, -h + 1, w, h);  // one pixel down so the feet overlap their shadows
  // The LCD text is drawn in a flat box and mapped onto the glass with an affine transform from three of the
  // four glass corners (props/clock.json); the fourth is within a pixel or two at this size.
  const [tl, tr, , bl] = c.meta.quad.map(([x, y]) => [x * w - w / 2, y * h - h]);
  const { lcdW: LW, lcdH: LH } = CLOCK;
  fx.transform((tr[0] - tl[0]) / LW, (tr[1] - tl[1]) / LW, (bl[0] - tl[0]) / LH, (bl[1] - tl[1]) / LH, tl[0], tl[1]);
  const lit = c.running || (ring && Math.floor(t * 5) % 2 === 0);
  fx.fillStyle = "#ffb561";
  fx.shadowColor = "rgba(255,154,60,0.7)";
  fx.shadowBlur = lit ? 6 : 0;
  fx.textAlign = "center";
  fx.textBaseline = "middle";
  fx.globalAlpha = lit ? 0.8 : 0.45;
  fx.font = "9px ui-monospace, 'DejaVu Sans Mono', monospace";
  fx.fillText(c.mode.split("").join(" "), LW / 2, 8);
  fx.globalAlpha = lit ? 1 : 0.55;
  fx.font = "600 27px ui-monospace, 'DejaVu Sans Mono', monospace";
  fx.fillText(c.time, LW / 2, 28);
  fx.restore();
}

function hitClock(x, y) {
  const w = CLOCK.width, h = w / (clock.meta?.aspect || 1.7), a = CLOCK.tilt * Math.PI / 180;
  const dx = x - (CLOCK.left + w / 2), dy = y - CLOCK.bottom;
  const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) < w / 2 && ly > -h && ly < 4;
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

function wrap(text) {
  fx.font = BUBBLE.font;
  const lines = [];
  let cur = "";
  for (const ch of text) {
    if (fx.measureText(cur + ch).width > BUBBLE.w - 2 * BUBBLE.pad) { lines.push(cur); cur = ch; } else cur += ch;
  }
  return cur ? [...lines, cur] : lines;
}

function drawBubble(now) {
  if (!bubble.text) return;
  bubble.lines ??= wrap(bubble.text);
  const { x, y, w, pad, line } = BUBBLE;
  const h = bubble.lines.length * line + pad * 1.4;
  fx.save();
  fx.globalAlpha = Math.min(1, (now - bubble.t0) / 200);
  fx.beginPath();
  fx.roundRect(x, y, w, h, 22);
  fx.moveTo(x + w - 2, y + h * 0.55);        // tail towards her head
  fx.lineTo(x + w + 34, y + h * 0.55 + 26);
  fx.lineTo(x + w - 2, y + h * 0.55 + 22);
  fx.fillStyle = "rgba(27,24,48,0.86)";
  fx.fill();
  fx.strokeStyle = "rgba(255,255,255,0.18)";
  fx.lineWidth = 2;
  fx.stroke();
  fx.fillStyle = "#f1ecfa";
  fx.font = BUBBLE.font;
  fx.textBaseline = "top";
  bubble.lines.forEach((l, i) => fx.fillText(l, x + pad, y + pad * 0.7 + i * line));
  fx.restore();
}

// ---------------- state ----------------
function setFrame(name, ms = FADE_MS) {
  if (name === B) return;
  A = B;
  B = name;
  mixStart = performance.now();
  mixMs = ms;
  dirty = true;
}

export function setScene(id) {
  scene = SCENES.find((s) => s.id === id) || SCENES[0];
  makeParts();
  loadScene();
  loadClock(scene.id);
  return scene.id;
}

export function setExpression(e) {
  expr = EXPRESSIONS.includes(e) ? e : "neutral";
  setFrame(expr);
}

// She blinks only from the neutral face; the blink frame is neutral with closed eyes.
function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    if (expr === "neutral" && !document.hidden) {
      setFrame("blink", 60);
      setTimeout(() => expr === "neutral" && setFrame("neutral", 90), 140);
    }
    scheduleBlink();
  }, rand(2500, 6000));
}

function tick(now) {
  requestAnimationFrame(tick);
  if (!images || now - last < 30) return;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (still && !dirty) return;
  mouse.x += (mouse.tx - mouse.x) * 0.06;
  mouse.y += (mouse.ty - mouse.y) * 0.06;
  drawScene(now, now / 1000);
  drawFx(still ? 0 : dt, now / 1000);
  drawClock(now / 1000, now);
  drawBubble(now);
  dirty = false;
}

export function mountScene(id) {
  fxc = $("fx");
  fx = fxc.getContext("2d");
  fx.imageSmoothingQuality = "high";
  initGL($("scene"));
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
