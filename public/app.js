import { mountScene, setScene, setLook, LOOKS, ROOMS, setExpression as showExpression, setClock, ringClock, onClockClick, say, setView, EXPRESSIONS, SCENES } from "./char.js";
import { bubblePages, bubbleDuration } from "./bubble-text.js";
import { createChatQueue } from "./chat-queue.js";
import { remainingSeconds, restoreTimer } from "./timer-state.js";

const $ = (id) => document.getElementById(id);
const APP_TITLE = "Quiet Nook";
let currentExpression = "neutral";
function setExpression(expression) {
  currentExpression = EXPRESSIONS.includes(expression) ? expression : "neutral";
  showExpression(currentExpression);
}
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let storageWarned = false;
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {
    if (storageWarned) return;
    storageWarned = true;
    // Deferred: `log` is created further down this module, after the first saves run.
    setTimeout(() => addMsg("err", "无法保存到浏览器存储，刷新或关闭后聊天记录和计时会丢失。"), 0);
  }
};

// ---------- timer ----------
const timer = { mode: "focus", left: 25 * 60, running: false, tick: null, endAt: 0 };
let lookReady = false;  // set once the scene is mounted; before that a mode change has no look to apply
const clampMin = (id, fallback) => Math.min(+$(id).max, Math.max(+$(id).min, +$(id).value || fallback));
const minutes = () => ({ focus: clampMin("focusMin", 25), break: clampMin("breakMin", 5) });
const saveTimer = () => save("timer", { mode: timer.mode, left: timer.left, running: timer.running, endAt: timer.endAt });

function renderClock() {
  const s = Math.max(0, Math.round(timer.left));
  const text = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  setClock({ time: text, mode: timer.mode === "focus" ? "专注" : "休息", running: timer.running });
  $("start").textContent = timer.running ? "暂停" : "开始";
  document.title = timer.running ? `${text} ${APP_TITLE}` : APP_TITLE;
}

// The alarm clock on the desk rings when a phase ends: it shakes and beeps three times.
function ring() {
  ringClock(2400);
  try { startAudioIfNeeded(); } catch { return; }
  if (!ctx) return;
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
  timer.endAt = 0;
  saveTimer();
  renderClock();
  if (lookReady) applyLook();
}

function announcePhaseEnd(finished) {
  try { new Notification(APP_TITLE, { body: finished === "focus" ? "专注结束，休息一下" : "休息结束" }); } catch { /* no permission */ }
  speak(finished === "focus"
    ? "[系统事件] 一个专注时段刚结束，进入休息。请自然简短地提醒用户休息。"
    : "[系统事件] 休息结束，新的专注时段即将开始。请简短鼓励一句。", true);
}

function onPhaseEnd() {
  const finished = timer.mode;
  setMode(finished === "focus" ? "break" : "focus");
  ring();
  announcePhaseEnd(finished);
}

function updateTimer() {
  if (!timer.running) return;
  timer.left = remainingSeconds(timer);
  if (timer.left <= 0) onPhaseEnd(); else renderClock();
}

function toggleTimer() {
  if (timer.running) {
    timer.left = remainingSeconds(timer);
    if (timer.left <= 0) return onPhaseEnd();
    timer.running = false;
    clearInterval(timer.tick);
    timer.endAt = 0;
  } else {
    timer.running = true;
    timer.endAt = Date.now() + timer.left * 1000;
    saveTimer();
    timer.tick = setInterval(updateTimer, 250);
    renderClock();
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    try { startAudioIfNeeded(); } catch { /* Timer must keep running without audio. */ }
  }
  saveTimer();
  renderClock();
}

$("start").onclick = toggleTimer;
onClockClick(toggleTimer);
$("skip").onclick = () => setMode(timer.mode === "focus" ? "break" : "focus");
$("reset").onclick = () => setMode(timer.mode);
for (const id of ["focusMin", "breakMin"]) $(id).onchange = () => { save("mins", minutes()); if (!timer.running) setMode(timer.mode); };
{ const m = load("mins", null); if (m) { $("focusMin").value = m.focus; $("breakMin").value = m.break; } }
const restoredTimer = restoreTimer(load("timer", null), minutes());
if (restoredTimer) {
  Object.assign(timer, restoredTimer);
  if (timer.running) timer.tick = setInterval(updateTimer, 250);
  saveTimer();
  renderClock();
} else setMode("focus");
addEventListener("pageshow", updateTimer);
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateTimer(); });

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
const SCENE_SOUND = { "floor-afternoon": { rain: 0, brown: 15 }, day: { rain: 0, brown: 15 }, dusk: { rain: 0, brown: 10 }, rain: { rain: 60, brown: 20 }, snow: { rain: 0, brown: 35 } };
let activeRoom = ROOMS.some((r) => r.id === load("room", "floor")) ? load("room", "floor") : "floor";
$("autoSound").checked = load("autoSound", true);
$("autoSound").onchange = () => save("autoSound", $("autoSound").checked);

function pickScene(id) {
  id = setScene(id);
  save("scene", id);
  save(`scene:${activeRoom}`, id);
  for (const b of $("scenes").children) b.classList.toggle("active", b.dataset.id === id);
  if ($("autoSound").checked) {
    for (const name of SOUNDS) { $(name).value = SCENE_SOUND[id][name]; applyVolume(name); }
  }
}
// The side panel is the only DOM over the scene. Collapsing it leaves just the toggle button.
const panelOpen = () => !$("panel").classList.contains("collapsed");
function setPanel(open) {
  $("panel").classList.toggle("collapsed", !open);
  $("hide").textContent = open ? "✕" : "☰";
  $("hide").title = open ? "收起面板" : "展开面板";
  save("panelOpen", open);
  layoutWorld();
}
$("hide").onclick = () => setPanel(!panelOpen());
addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key.toLowerCase() === "c") setPanel(!panelOpen());
  if (e.key === "1") setExpression(EXPRESSIONS[(EXPRESSIONS.indexOf(currentExpression) + 1) % EXPRESSIONS.length]);
  if (e.key === "2") {
    const index = SCENES.findIndex((s) => s.id === load("scene", SCENES[0].id));
    selectScene(SCENES[(index + 1) % SCENES.length]);
  }
  if (e.key === "3") {
    const options = LOOKS.filter((l) => l.room === activeRoom);
    const index = options.findIndex((l) => l.id === chosenLook);
    chosenLook = options[(index + 1) % options.length].id;
    save("look", chosenLook);
    save(`look:${activeRoom}`, chosenLook);
    applyLook();
  }
});

// ---------- character + chat ----------
const SYSTEM = `你是「阿宁」，是用户的女朋友，在房间里陪用户专注工作和学习。
性格：温柔、体贴、有点害羞，偶尔小小地撒娇或调侃，不说教，不啰嗦。
称呼：直接说"你"，不要猜测或使用用户的性别和昵称，除非用户自己说过。
规则：
- 用自然的中文口语回复，长度随内容变化：简单回应可以一句，需要展开时可以说一小段，通常不超过 80 字；用户要求详细时不受此限。
- 回复第一个词必须是情绪标签，从 [neutral] [happy] [shy] [sleepy] [think] [cheer] 里选一个，之后接正文。大多数时候用 [neutral]，只有情绪明显时才用别的，不要总是 [happy]；被夸、被撒娇或有点不好意思时用 [shy]。
- 闹钟由你操作。用户说要开始专注、学习、工作时，在回复末尾加 [start]；说要休息时加 [break]；说要暂停加 [pause]；说要重来加 [reset]。只在用户明确表达时才加，不要自己决定，也不要重复加。标签放在情绪标签之后、正文末尾，不要解释它。
- 关心用户的状态。
- 先回应用户实际说的内容，分享具体想法或感受，不要为了延续对话而每次提问，也不要习惯性地总结话题或提供 A/B 选项。
- 留意最近对话，避免反复使用相同的问候、措辞或提问，例如反复询问是否想慢慢待着。亲近自然，不要套用固定的安慰或撒娇句式。
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
  return `\n\n当前状态：${timer.mode === "focus" ? "专注" : "休息"}${timer.running ? "中" : "（已暂停）"}，剩余约 ${left} 分钟。`;
}

let history = load("history2", []);
if (!Array.isArray(history)) history = [];
if (history.length > 60) {
  history = history.slice(-60);
  save("history2", history);
}
const log = $("log");
const scrollLog = () => { log.scrollTop = log.scrollHeight; };
// The log shrinks when the panel above it gets taller (scene buttons are added after the history is replayed, the window
// is resized), so keep it at the bottom whenever it was there, unless the reader scrolled up.
// A scroll event is delivered after layout, so only trust it when the reader just used the wheel, touch or scrollbar.
let pinned = true, lastInput = -Infinity;
for (const type of ["wheel", "touchmove", "pointerdown"]) log.addEventListener(type, () => { lastInput = performance.now(); }, { passive: true });
log.addEventListener("scroll", () => {
  if (performance.now() - lastInput < 600) pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
});
new ResizeObserver(() => { if (pinned) scrollLog(); }).observe(log);
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
  clearTimeout(bubbleTimer);
  const pages = bubblePages(text);
  let index = 0;
  function showNext() {
    if (index === pages.length) { say(""); setExpression("neutral"); return; }
    const page = pages[index++];
    say(page);
    bubbleTimer = setTimeout(showNext, bubbleDuration(page));
  }
  showNext();
}

async function sendMessage(text, silentUser = false) {
  const message = { role: "user", content: text, display: silentUser ? undefined : text };
  const botEl = addMsg("bot", "…");
  let full = "", displaced = [];
  try {
    if (history.length >= 60) displaced = history.splice(0, history.length - 59);
    history.push(message);
    const messages = history.map(({ role, content }) => ({ role, content }));
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system: SYSTEM + context(), messages }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    full = data.text;
    if (typeof full !== "string" || !full.trim()) throw new Error("empty reply from the model");
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
    botEl.textContent = `出错了：${e instanceof TypeError ? "无法连接到服务器" : e.message}`;
    scrollLog();
    const index = history.indexOf(message);
    if (index !== -1) history.splice(index, 1);
    history.unshift(...displaced);
  }
  if (history.length > 60) history.splice(0, history.length - 60);
  save("history2", history);
}
const enqueueMessage = createChatQueue(sendMessage);
function speak(text, silentUser = false) {
  if (!silentUser) addMsg("user", text);
  return enqueueMessage(text, silentUser);
}
if (restoredTimer?.finished) announcePhaseEnd(restoredTimer.finished);

$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;
  $("chatInput").value = "";
  speak(text);
};

function savedOption(items, key, room) {
  const options = items.filter((item) => item.room === room);
  const value = load(`${key}:${room}`, load(key, ""));
  return options.some((item) => item.id === value) ? value : options[0].id;
}
let chosenLook = savedOption(LOOKS, "look", activeRoom);
$("autoLook").checked = load("autoLook", true);
$("autoLook").onchange = () => { save("autoLook", $("autoLook").checked); applyLook(); };
const lookNow = () => activeRoom === "desk" && $("autoLook").checked && timer.mode === "break" ? "desk-sleep" : chosenLook;
function applyLook() {
  const id = lookNow();
  setLook(id).then((shown) => { for (const b of $("looks").children) b.classList.toggle("active", b.dataset.id === chosenLook); return shown; });
}
function renderRoomOptions(sceneId) {
  $("autoLookRow").hidden = activeRoom !== "desk";
  $("scenes").replaceChildren(...SCENES.map((s) => {
    const b = document.createElement("button");
    b.textContent = s.name; b.dataset.id = s.id;
    b.classList.toggle("active", s.id === sceneId);
    b.onclick = () => selectScene(s);
    return b;
  }));
  $("looks").replaceChildren(...LOOKS.filter((l) => l.room === activeRoom).map((l) => {
    const b = document.createElement("button");
    b.textContent = l.name; b.dataset.id = l.id;
    b.classList.toggle("active", l.id === chosenLook);
    b.onclick = () => { chosenLook = l.id; save("look", l.id); save(`look:${activeRoom}`, l.id); applyLook(); };
    return b;
  }));
}

function selectScene(selected) {
  if (selected.room === activeRoom) pickScene(selected.id);
  else pickRoom(selected.room, selected.id);
}

function pickRoom(id, selectedScene) {
  if (id === activeRoom || !ROOMS.some((r) => r.id === id)) return;
  save(`look:${activeRoom}`, chosenLook);
  save(`scene:${activeRoom}`, load("scene", ""));
  activeRoom = id;
  save("room", id);
  chosenLook = savedOption(LOOKS, "look", id);
  save("look", chosenLook);
  const sceneId = selectedScene || savedOption(SCENES, "scene", id);
  renderRoomOptions(sceneId);
  applyLook();
  pickScene(sceneId);
}

const initialScene = savedOption(SCENES, "scene", activeRoom);
save("scene", initialScene);
mountScene(initialScene, lookNow());
renderRoomOptions(initialScene);
lookReady = true;

// Scale #world to cover the window and slide it so she (world x = 560) sits in the space the panel leaves free.
function layoutWorld() {
  const w = $("stage").clientWidth, h = $("stage").clientHeight;
  const s = Math.max(w / 1672, h / 941);
  const narrow = matchMedia("(max-width: 760px)").matches;
  const free = !panelOpen() || narrow ? w : w - 364;
  const ox = Math.min(0, Math.max(w - 1672 * s, free / 2 - 560 * s));
  const oy = (h - 941 * s) / 2;
  $("world").style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
  const freeHeight = panelOpen() && narrow ? Math.max(0, $("panel").getBoundingClientRect().top) : h;
  setView(-ox / s, (free - ox) / s, -oy / s, (freeHeight - oy) / s);
}
addEventListener("resize", layoutWorld);
setPanel(load("panelOpen", true));
requestAnimationFrame(() => $("world").classList.add("ready"));
