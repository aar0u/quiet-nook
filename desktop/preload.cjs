// Preload scripts run as CommonJS, so this file cannot be an ES module like the rest of the project.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("companion", {
  setHit: (hit) => ipcRenderer.send("companion-hit", hit),
  dragStart: () => ipcRenderer.send("companion-drag-start"),
  drag: (dx, dy) => ipcRenderer.send("companion-drag", dx, dy),
  focus: () => ipcRenderer.send("companion-focus"),
  menu: (poses) => ipcRenderer.send("companion-menu", poses),
  onPick: (callback) => ipcRenderer.on("companion-pick", (_event, id) => callback(id)),
});
