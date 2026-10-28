const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canvasDesktop", {
  isDesktop: true,
  onBeforeClose: callback => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("canvas:prepare-close", () => callback());
  },
  completeClose: saved => ipcRenderer.send("canvas:close-ready", saved === true),
  onCloseCancelled: callback => {
    if (typeof callback === "function") ipcRenderer.on("canvas:close-cancelled", () => callback());
  },
  updates: {
    state: () => ipcRenderer.invoke("canvas:update-state"),
    check: () => ipcRenderer.invoke("canvas:update-check"),
    download: () => ipcRenderer.invoke("canvas:update-download"),
    cancel: () => ipcRenderer.invoke("canvas:update-cancel"),
    install: () => ipcRenderer.invoke("canvas:update-install"),
    releases: () => ipcRenderer.invoke("canvas:update-releases"),
    subscribe: callback => {
      if (typeof callback !== "function") return;
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("canvas:update-state", listener);
      return () => ipcRenderer.removeListener("canvas:update-state", listener);
    }
  }
});
