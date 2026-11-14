// Desktop companion mode (?companion): only she and a patch of floor are drawn, the window around her is transparent.
// window.companion is an optional bridge to the window host (desktop/preload.cjs): move, mouse pass-through, menu.
// In a plain browser it is missing and the page still renders.
// Click her to open a one-line chat box, drag to move the window. Her replies show in the canvas speech bubble.
import { companionHit, layoutCompanion } from "./char.js";

addEventListener("resize", layoutCompanion);
layoutCompanion();

const bridge = window.companion;
const DRAG_PX = 4;

// The chat box reuses the hidden panel's form, so sending, history and actions work as in the normal page.
const box = document.createElement("form");
box.id = "companionChat";
box.hidden = true;
box.innerHTML = '<input autocomplete="off" placeholder="和她说点什么">';
document.body.append(box);
const field = box.firstElementChild;
const chatOpen = () => !box.hidden;
const overBox = (x, y) => {
  if (!chatOpen()) return false;
  const r = box.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};

function setChat(open) {
  box.hidden = !open;
  if (open) { bridge?.focus(); field.focus(); } else field.blur();
}

box.onsubmit = (e) => {
  e.preventDefault();
  const text = field.value.trim();
  if (!text) return;
  field.value = "";
  document.getElementById("chatInput").value = text;
  document.getElementById("chatForm").requestSubmit();
};

let hit = false, down = null;  // hit: the mouse is over her or the chat box, so the window catches it

// Space toggles the chat box too, but not while a message is being typed (a space is then part of the text).
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && chatOpen()) setChat(false);
  else if (e.code === "Space" && !e.repeat && !e.isComposing && (!chatOpen() || field.value === "")) {
    e.preventDefault();
    setChat(!chatOpen());
  }
});

// The pose choices come from the hidden panel's buttons, and picking one clicks that button, so the companion view goes
// through the same code (saving, look change) as the panel.
const poses = () => [...document.getElementById("looks").children].map((b) => ({ id: b.dataset.id, name: b.textContent, checked: b.classList.contains("active") }));
addEventListener("contextmenu", (e) => { e.preventDefault(); if (hit) bridge?.menu(poses()); });
bridge?.onPick((id) => document.querySelector(`#looks button[data-id="${id}"]`)?.click());

addEventListener("mousemove", (e) => {
  const now = down ? true : overBox(e.clientX, e.clientY) || companionHit(e.clientX, e.clientY);
  if (now !== hit) { hit = now; bridge?.setHit(hit); }
  if (!down) return;
  const dx = e.screenX - down.x, dy = e.screenY - down.y;
  if (!down.moved && Math.hypot(dx, dy) > DRAG_PX) down.moved = true;
  if (down.moved) bridge?.drag(dx, dy);
});

addEventListener("mousedown", (e) => {
  if (!hit || e.button !== 0 || box.contains(e.target)) return;
  down = { x: e.screenX, y: e.screenY, moved: false };
  bridge?.dragStart();
});

addEventListener("mouseup", () => {
  if (down && !down.moved) setChat(!chatOpen());
  down = null;
});
