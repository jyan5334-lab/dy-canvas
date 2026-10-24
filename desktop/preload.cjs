const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canvasDesktop", {
  isDesktop: true,
  onBeforeClose: callback => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("canvas:prepare-close", () => callback());
  },
  completeClose: saved => ipcRenderer.send("canvas:close-ready", saved === true)
});
