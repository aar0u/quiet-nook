import { mountScene, setScene, setExpression, EXPRESSIONS, SCENES } from "./char.js";

const $ = (id) => document.getElementById(id);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

// ---------- timer ----------
const timer = { mode: "focus", left: 25 * 60, running: false, tick: null, endAt: 0 };
const minutes = () => ({ focus: +$("focusMin").value || 25, break: +$("breakMin").value || 5 });

function renderClock() {
  const s = Math.max(0, Math.round(timer.left));
  const text = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  $("lcdTime").textContent = text;
  $("lcdMode").textContent = timer.mode === "focus" ? "专注" : "休息";
  $("clockProp").classList.toggle("running", timer.running);
  $("start").textContent = timer.running ? "暂停" : "开始";
  document.title = timer.running ? `${text} 念念的小屋` : "念念的小屋";
}

// The alarm clock on the desk rings when a phase ends: it shakes and beeps three times.
function ring() {
  const el = $("clockProp");
  el.classList.add("ringing");
  setTimeout(() => el.classList.remove("ringing"), 2400);
  startAudioIfNeeded();
  for (let i = 0; i < 3; i++) {
    const t = ctx.currentTime + i * 0.7;
    for (const [k, f] of [[0, 1760], [0.18, 1760]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + k);
      g.gain.exponentialRampToValueAtTime(0.08, t + k + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(t + k); o.stop(t + k + 0.14);
    }
  }
}

function setMode(mode) {
  timer.mode = mode;
  timer.left = minutes()[mode] * 60;
  timer.running = false;
  clearInterval(timer.tick);
  renderClock();
}

function onPhaseEnd() {
  const finished = timer.mode;
  setMode(finished === "focus" ? "break" : "focus");
  ring();
  try { new Notification("念念的小屋", { body: finished === "focus" ? "专注结束，休息一下" : "休息结束" }); } catch { /* no permission */ }
  speak(finished === "focus"
    ? "[系统事件] 一个专注时段刚结束，进入休息。请简短问候并问一句刚才做得怎么样。"
    : "[系统事件] 休息结束，新的专注时段即将开始。请简短鼓励一句。", true);
}

function toggleTimer() {
  if (timer.running) {
    timer.running = false;
    clearInterval(timer.tick);
  } else {
    timer.running = true;
    timer.endAt = Date.now() + timer.left * 1000;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    startAudioIfNeeded();
    timer.tick = setInterval(() => {
      timer.left = (timer.endAt - Date.now()) / 1000;
      if (timer.left <= 0) onPhaseEnd(); else renderClock();
    }, 250);
  }
  renderClock();
}

$("start").onclick = toggleTimer;
$("clockProp").onclick = toggleTimer;
$("skip").onclick = () => setMode(timer.mode === "focus" ? "break" : "focus");
$("reset").onclick = () => setMode(timer.mode);
for (const id of ["focusMin", "breakMin"]) $(id).onchange = () => { save("mins", minutes()); if (!timer.running) setMode(timer.mode); };
{ const m = load("mins", null); if (m) { $("focusMin").value = m.focus; $("breakMin").value = m.break; } }
setMode("focus");

// ---------- todo ----------
let todos = load("todos", []);
function renderTodos() {
  const ul = $("todoList");
  ul.replaceChildren(...todos.map((t, i) => {
    const li = document.createElement("li");
    li.className = t.done ? "done" : "";
    const span = document.createElement("span");
    span.textContent = t.text;
    span.onclick = () => { t.done = !t.done; save("todos", todos); renderTodos(); };
    const del = document.createElement("button");
    del.textContent = "×";
    del.onclick = () => { todos.splice(i, 1); save("todos", todos); renderTodos(); };
    li.append(span, del);
    return li;
  }));
}
$("todoForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("todoInput").value.trim();
  if (!text) return;
  todos.push({ text, done: false });
  $("todoInput").value = "";
  save("todos", todos);
  renderTodos();
};
renderTodos();

// ---------- ambient sound (synthesized, no asset files) ----------
let ctx, gains = {};
function noiseBuffer(brown) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}
function startAudioIfNeeded() {
  if (!ctx) {
    ctx = new AudioContext();
    const mk = (name, brown, filterType, freq) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(brown);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(ctx.destination);
      src.start();
      gains[name] = g;
    };
    mk("rain", false, "bandpass", 3200);
    mk("brown", true, "lowpass", 600);
    for (const name of SOUNDS) applyVolume(name);
  }
  if (ctx.state === "suspended") ctx.resume();
}
const SOUNDS = ["rain", "brown"];
function applyVolume(name) {
  const v = +$(name).value / 100;
  if (gains[name]) gains[name].gain.value = v * v * (name === "rain" ? 0.5 : 0.8);
  save(`vol_${name}`, +$(name).value);
}
for (const name of SOUNDS) {
  $(name).value = load(`vol_${name}`, 0);
  $(name).oninput = () => { startAudioIfNeeded(); applyVolume(name); };
}

// ---------- scene, panel visibility ----------
const SCENE_SOUND = { rain: { rain: 60, brown: 20 }, day: { rain: 0, brown: 15 }, dusk: { rain: 0, brown: 10 }, snow: { rain: 0, brown: 35 } };
$("autoSound").checked = load("autoSound", true);
$("autoSound").onchange = () => save("autoSound", $("autoSound").checked);

// Each scene has its own clock sprite, drawn in that scene's perspective and light. The LCD text is warped
// onto the sprite's glass: a homography from a flat box to the four corners stored in props/clock.json.
const clockMeta = fetch("props/clock.json").then((r) => r.json());
const CLOCK_W = 175, LCD_W = 120, LCD_H = 44;
function homography(q) {
  const s = [[0, 0], [LCD_W, 0], [LCD_W, LCD_H], [0, LCD_H]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = s[i], [u, v] = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let i = 0; i < 8; i++) {  // Gaussian elimination with partial pivoting
    let p = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < 8; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const h = Array(8);
  for (let i = 7; i >= 0; i--) {
    let sum = b[i];
    for (let c = i + 1; c < 8; c++) sum -= A[i][c] * h[c];
    h[i] = sum / A[i][i];
  }
  return `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`;
}
async function setClock(id) {
  const m = (await clockMeta)[id];
  const hpx = CLOCK_W / m.aspect;
  $("clockImg").src = `props/clock_${id}.webp`;
  $("lcd").style.transform = homography(m.quad.map(([x, y]) => [x * CLOCK_W, y * hpx]));
}

function pickScene(id) {
  id = setScene(id);
  setClock(id);
  save("scene", id);
  for (const b of $("scenes").children) b.classList.toggle("active", b.dataset.id === id);
  if ($("autoSound").checked) {
    for (const name of SOUNDS) { $(name).value = SCENE_SOUND[id][name]; applyVolume(name); }
  }
}
function setPanel(open) {
  $("panel").hidden = !open;
  $("show").hidden = open;
  save("panelOpen", open);
  layoutWorld();
}
$("hide").onclick = () => setPanel(false);
$("show").onclick = () => setPanel(true);
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "h" && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) setPanel($("panel").hidden);
});

// ---------- character + chat ----------
const SYSTEM = `你是「念念」，是用户的女朋友，坐在书桌旁陪用户专注工作和学习。
性格：温柔、体贴、有点害羞，偶尔小小地撒娇或调侃，不说教，不啰嗦。
称呼：直接说"你"，不要猜测或使用用户的性别和昵称，除非用户自己说过。
规则：
- 每次回复 1 到 3 句中文，口语化，除非用户明确要求详细。
- 回复第一个词必须是情绪标签，从 [neutral] [happy] [shy] [sleepy] [think] [cheer] 里选一个，之后接正文。大多数时候用 [neutral]，只有情绪明显时才用别的，不要总是 [happy]；被夸、被撒娇或有点不好意思时用 [shy]。
- 桌上的闹钟由你操作。用户说要开始专注、学习、工作时，在回复末尾加 [start]；说要休息时加 [break]；说要暂停加 [pause]；说要重来加 [reset]。只在用户明确表达时才加，不要自己决定，也不要重复加。标签放在情绪标签之后、正文末尾，不要解释它。
- 用户在专注时不要主动打扰；用户正在休息或主动开口时才多聊。
- 关心用户的状态，该休息就提醒休息，鼓励用户照顾好自己和现实中的生活，不要黏人，也不要让用户觉得离不开你。
- 你不是医生或心理咨询师。用户提到自伤或严重情绪困扰时，温和地表示关心，并建议联系身边的人或当地的心理援助热线，不要给诊断。
- 不要编造你看不到的信息。你只知道下面的"当前状态"。`;

// She can operate the desk clock; the model asks for it with an action tag in its reply.
function doAction(a) {
  if (a === "reset") return setMode(timer.mode);
  if (a === "pause") return timer.running && toggleTimer();
  const want = a === "break" ? "break" : "focus";
  if (timer.mode !== want) setMode(want);
  if (!timer.running) toggleTimer();
}

function context() {
  const left = Math.round(timer.left / 60);
  const open = todos.filter((t) => !t.done).map((t) => t.text);
  return `\n\n当前状态：${timer.mode === "focus" ? "专注" : "休息"}${timer.running ? "中" : "（已暂停）"}，剩余约 ${left} 分钟。` +
    `待办：${open.length ? open.join("；") : "无"}。`;
}

let history = load("history2", []);
const log = $("log");
const scrollLog = () => { log.scrollTop = log.scrollHeight; };
function addMsg(cls, text) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  log.append(div);
  scrollLog();
  return div;
}
for (const m of history) if (m.display !== undefined) addMsg(m.role === "user" ? "user" : "bot", m.display);

let bubbleTimer;
function showBubble(text) {
  const b = $("bubble");
  b.textContent = text;
  b.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { b.hidden = true; setExpression("neutral"); }, 10000);
}

async function speak(text, silentUser = false) {
  const el = silentUser ? null : addMsg("user", text);
  history.push({ role: "user", content: text, display: silentUser ? undefined : text });
  const botEl = addMsg("bot", "…");
  let full = "";
  try {
    const messages = history.slice(-20).map(({ role, content }) => ({ role, content }));
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system: SYSTEM + context(), messages }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    full = data.text;
    const tag = full.match(/^\s*\[(\w+)\]/)?.[1];
    const ACTION = /\[(start|pause|break|reset)\]/g;
    const actions = [...full.matchAll(ACTION)].map((m) => m[1]);
    const clean = full.replace(ACTION, "").replace(/^\s*\[\w+\]\s*/, "").trim();
    for (const a of actions) doAction(a);
    setExpression(EXPRESSIONS.includes(tag) ? tag : "neutral");
    botEl.textContent = clean;
    scrollLog();
    showBubble(clean);
    history.push({ role: "assistant", content: full, display: clean });
  } catch (e) {
    botEl.className = "msg err";
    botEl.textContent = `出错了：${e.message}`;
    scrollLog();
    history.pop();
    if (silentUser === false && el) el.classList.add("err");
  }
  history = history.slice(-60);
  save("history2", history);
}

$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;
  $("chatInput").value = "";
  speak(text);
};

mountScene(load("scene", SCENES[0].id));

// Scale #world to cover the window and slide it so she (world x = 560) sits in the space the panel leaves free.
function layoutWorld() {
  const w = $("stage").clientWidth, h = $("stage").clientHeight;
  const s = Math.max(w / 1672, h / 941);
  const narrow = matchMedia("(max-width: 760px)").matches;
  const free = $("panel").hidden || narrow ? w : w - 364;
  const ox = Math.min(0, Math.max(w - 1672 * s, free / 2 - 560 * s));
  $("world").style.transform = `translate(${ox}px, ${(h - 941 * s) / 2}px) scale(${s})`;
}
addEventListener("resize", layoutWorld);
for (const s of SCENES) {
  const b = document.createElement("button");
  b.textContent = s.name;
  b.dataset.id = s.id;
  b.onclick = () => pickScene(s.id);
  $("scenes").append(b);
}
for (const b of $("scenes").children) b.classList.toggle("active", b.dataset.id === load("scene", SCENES[0].id));
setClock(load("scene", SCENES[0].id));
setPanel(load("panelOpen", true));
requestAnimationFrame(() => $("world").classList.add("ready"));
