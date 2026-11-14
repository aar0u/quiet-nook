// Desktop companion: a transparent, frameless, always-on-top window that shows /?companion from the bundled server.
// Run it from this folder with `pnpm install` once, then `pnpm start`. Everything Electron-related lives here.
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A separate port, so it can run next to `pnpm start` in the project root. Always loopback: this server also holds the
// chat API key.
process.env.PORT ??= "7790";
process.env.HOST = "127.0.0.1";
await import("../server.js");

const WIDTH = 430, HEIGHT = 526;  // same aspect as the crop in public/char.js (FLOOR_COMPANION.crop)

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: WIDTH, height: HEIGHT, transparent: true, frame: false, hasShadow: false,
    alwaysOnTop: true, resizable: false, skipTaskbar: true,
    enableLargerThanScreen: true,  // on macOS this also lifts the rule that keeps a window below the menu bar
    webPreferences: { preload: path.join(path.dirname(fileURLToPath(import.meta.url)), "preload.cjs") },
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Clicks pass through the transparent parts. The page reports when the mouse is over her (companion-hit).
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadURL(`http://127.0.0.1:${process.env.PORT}/?companion`);
  if (process.env.DEVTOOLS) win.webContents.openDevTools({ mode: "detach" });  // DEVTOOLS=1 pnpm start

  ipcMain.on("companion-hit", (_event, hit) => win.setIgnoreMouseEvents(!hit, { forward: true }));
  ipcMain.on("companion-focus", () => win.focus());
  // The page sends its pose choices; picking one is sent back and the page applies it.
  ipcMain.on("companion-menu", (_event, poses = []) => {
    Menu.buildFromTemplate([
      ...poses.map(({ id, name, checked }) => ({ label: name, type: "radio", checked, click: () => win.webContents.send("companion-pick", id) })),
      { type: "separator" },
      { label: "退出", role: "quit" },
    ]).popup({ window: win });
  });
  let origin = [0, 0];
  ipcMain.on("companion-drag-start", () => { origin = win.getPosition(); });
  ipcMain.on("companion-drag", (_event, dx, dy) => win.setPosition(Math.round(origin[0] + dx), Math.round(origin[1] + dy)));
});

app.on("window-all-closed", () => app.quit());
// A crashed GPU or renderer leaves a blank transparent window with no other sign, so say so in the terminal.
app.on("child-process-gone", (_event, details) => console.error(`[electron] ${details.type} process gone: ${details.reason}`));
