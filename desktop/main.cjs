const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { createUpdateController, RELEASES_URL } = require("./update-controller.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ORIGIN = "canvas://app";
const testing = process.env.CANVAS_DESKTOP_TEST === "1";
const dataDirectory = testing && process.env.CANVAS_TEST_USER_DATA
  ? path.resolve(process.env.CANVAS_TEST_USER_DATA)
  : path.join(app.getPath("appData"), "WirelessCanvas");
fs.mkdirSync(dataDirectory, { recursive: true });
app.setPath("userData", dataDirectory);
app.setName("DY画布");
app.setAppUserModelId("com.local.wirelesscanvas");
protocol.registerSchemesAsPrivileged([{ scheme: "canvas", privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true
} }]);

let mainWindow = null;
let closing = false;
let allowClose = false;
let closeTimer;
let updates;
let installAfterSave = false;
let updateTimer;
let periodicUpdateTimer;
const contentPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; frame-src 'self' blob:; connect-src 'self' data: blob:; object-src 'self' blob:; base-uri 'none'; form-action 'none'";

function isCanvasURL(value) {
  try { const url = new URL(value); return url.protocol === "canvas:" && url.hostname === "app"; }
  catch { return false; }
}

function trustedSender(event) {
  return mainWindow && event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame && isCanvasURL(event.senderFrame.url);
}

function cancelClose() {
  clearTimeout(closeTimer);
  closing = false;
  allowClose = false;
  installAfterSave = false;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("canvas:close-cancelled");
}

function prepareClose() {
  if (closing || !mainWindow) return;
  closing = true;
  mainWindow.webContents.send("canvas:prepare-close");
  waitForClose();
}

function waitForClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed() || !closing) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question", title: "DY画布", message: "画布仍在保存",
      detail: "可以继续等待，或返回画布。直接退出可能丢失尚未保存的内容。",
      buttons: installAfterSave ? ["继续等待", "返回画布"] : ["继续等待", "返回画布", "直接退出"], defaultId: 0, cancelId: 1
    });
    if (allowClose || !mainWindow || mainWindow.isDestroyed()) return;
    if (response === 0) waitForClose();
    else if (response === 2) { allowClose = true; mainWindow.close(); }
    else { updates?.cancelInstall(); cancelClose(); }
  }, 12000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "DY画布", width: 1440, height: 940, minWidth: 760, minHeight: 560,
    show: false, backgroundColor: "#eff0f2", autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, plugins: true, spellcheck: false
    }
  });
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => { if (!isCanvasURL(url)) event.preventDefault(); });
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => callback(
    webContents === contents && isCanvasURL(webContents.getURL()) && permission === "fullscreen"
  ));
  contents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_details, callback) => callback({ cancel: true }));
  contents.session.on("will-download", (_event, item) => {
    const name = path.basename(item.getFilename());
    if (testing && process.env.CANVAS_TEST_DOWNLOADS) {
      fs.mkdirSync(process.env.CANVAS_TEST_DOWNLOADS, { recursive: true });
      item.setSavePath(path.join(process.env.CANVAS_TEST_DOWNLOADS, name));
    } else {
      const extension = path.extname(name).slice(1);
      item.setSaveDialogOptions({
        title: "保存文件", defaultPath: path.join(app.getPath("downloads"), name),
        filters: extension ? [{ name: `${extension.toUpperCase()} 文件`, extensions: [extension] }] : []
      });
    }
    item.on("done", (_event, state) => {
      if (state === "interrupted" && mainWindow && !mainWindow.isDestroyed()) dialog.showMessageBox(mainWindow, {
        type: "error", title: "保存文件失败", message: "文件未能保存，请重新导出或选择其他保存位置。"
      });
    });
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", event => {
    if (allowClose) return;
    event.preventDefault();
    prepareClose();
  });
  mainWindow.on("closed", () => { clearTimeout(closeTimer); mainWindow = null; });
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    dialog.showErrorBox("DY画布未能打开", `${description}\n${url}`);
  });
  mainWindow.loadURL(`${ORIGIN}/index.html`);
}

ipcMain.on("canvas:close-ready", async (event, saved) => {
  if (!trustedSender(event) || !closing) return;
  clearTimeout(closeTimer);
  if (saved === true) {
    mainWindow.webContents.session.flushStorageData();
    allowClose = true;
    if (installAfterSave) {
      if (!await updates.installSaved()) cancelClose();
    } else mainWindow.close();
  } else {
    updates?.cancelInstall("画布保存失败，安装已暂停。请备份后重试。");
    cancelClose();
    await dialog.showMessageBox(mainWindow, {
      type: "error", title: "尚未退出", message: "画布保存失败，已保留当前窗口。",
      detail: "请先导出 JSON 备份，再重试保存。", buttons: ["返回画布"]
    });
  }
});

for (const action of ["state", "check", "download", "cancel", "install", "releases"]) {
  ipcMain.handle(`canvas:update-${action}`, async event => {
    if (!trustedSender(event) || !updates) throw new Error("Untrusted update request");
    if (action === "releases") await shell.openExternal(RELEASES_URL);
    else if (action === "check" || action === "download") void updates[action]();
    else if (action !== "state") updates[action]();
    return updates.snapshot();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(() => {
    const root = app.getAppPath();
    protocol.handle("canvas", async request => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== "app") return new Response("Not found", { status: 404 });
        const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
        const filename = path.resolve(root, `.${relative}`);
        const inside = path.relative(root, filename);
        if (inside.startsWith("..") || path.isAbsolute(inside) || !/\.(html|js|css|png|jpe?g|webp|svg|ico|mp4|webm|woff2?)$/i.test(filename)) return new Response("Forbidden", { status: 403 });
        const response = await net.fetch(pathToFileURL(filename).toString());
        const headers = new Headers(response.headers);
        headers.set("Content-Security-Policy", contentPolicy);
        headers.set("X-Content-Type-Options", "nosniff");
        return new Response(response.body, { status: response.status, headers });
      } catch { return new Response("Not found", { status: 404 }); }
    });
    Menu.setApplicationMenu(null);
    updates = createUpdateController({
      updater: autoUpdater, currentVersion: app.getVersion(), enabled: app.isPackaged && process.platform === "win32",
      onState: state => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("canvas:update-state", state);
          mainWindow.setProgressBar(state.phase === "downloading" ? state.percent / 100 : -1);
        }
        if (installAfterSave && state.phase === "error") cancelClose();
      },
      requestInstall: () => {
        if (closing) { updates.cancelInstall("正在退出，请重新打开后安装。"); return; }
        installAfterSave = true;
        prepareClose();
      }
    });
    createWindow();
    if (!testing && app.isPackaged) {
      updateTimer = setTimeout(() => updates.check(), 12000);
      periodicUpdateTimer = setInterval(() => updates.check(), 6 * 60 * 60 * 1000);
    }
  }).catch(error => { dialog.showErrorBox("DY画布启动失败", error.message); app.quit(); });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => { clearTimeout(updateTimer); clearInterval(periodicUpdateTimer); updates?.dispose(); });
}
