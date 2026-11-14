export function remainingSeconds(timer, now = Date.now()) {
  return timer.running ? Math.max(0, (timer.endAt - now) / 1000) : timer.left;
}

export function restoreTimer(saved, durations, now = Date.now()) {
  if (!saved || !["focus", "break"].includes(saved.mode) || typeof saved.running !== "boolean" ||
      !Number.isFinite(saved.left) || saved.left < 0 || saved.left > 120 * 60 ||
      (saved.running && (!Number.isFinite(saved.endAt) || saved.endAt <= 0))) return null;
  if (saved.running && saved.endAt <= now) {
    const mode = saved.mode === "focus" ? "break" : "focus";
    return { mode, left: durations[mode] * 60, running: false, endAt: 0, finished: saved.mode };
  }
  return { mode: saved.mode, left: remainingSeconds(saved, now), running: saved.running,
    endAt: saved.running ? saved.endAt : 0, finished: null };
}
