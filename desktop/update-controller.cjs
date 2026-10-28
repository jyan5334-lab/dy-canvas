const fs = require("node:fs");
const crypto = require("node:crypto");
const { CancellationToken } = require("builder-util-runtime");

const RELEASES_URL = "https://github.com/jyan5334-lab/dy-canvas/releases/latest";

function releaseNotes(info) {
  const notes = Array.isArray(info.releaseNotes)
    ? info.releaseNotes.map(item => `${item.version || ""}\n${item.note || ""}`).join("\n\n")
    : info.releaseNotes || "";
  return String(notes).slice(0, 16000);
}

function errorMessage(error) {
  const message = String(error?.message || error);
  if (/sha512|checksum|digest|signature/i.test(message)) return "安装包校验未通过，请重新下载。";
  if (/404|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|ERR_UPDATER_LATEST_VERSION_NOT_FOUND/.test(message)) return "暂未找到更新清单，请稍后重试，或到版本页面下载安装。";
  return "无法连接更新服务或下载失败，请检查网络后重试。";
}

async function verifyInstaller(filename, info) {
  const file = info.files?.find(item => /\.exe(?:\?|$)/i.test(item.url));
  if (!file?.sha512 || !filename) throw new Error("Missing installer checksum");
  const stat = await fs.promises.stat(filename);
  if (!stat.isFile() || (file.size && stat.size !== file.size)) throw new Error("Installer checksum size mismatch");
  const hash = crypto.createHash("sha512");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  if (hash.digest("base64") !== file.sha512) throw new Error("Installer sha512 checksum mismatch");
}

function createUpdateController({ updater, currentVersion, enabled, onState, requestInstall }) {
  let state = { phase: "idle", currentVersion, version: null, notes: "", percent: 0, transferred: 0, total: 0, message: "", enabled };
  let operation = null;
  let cancellation = null;
  let downloaded = null;
  const update = patch => { state = { ...state, ...patch }; onState({ ...state }); };
  const fail = error => update({ phase: "error", message: errorMessage(error) });
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  updater.on("checking-for-update", () => update({ phase: "checking", message: "" }));
  updater.on("update-available", info => update({ phase: "available", version: info.version, notes: releaseNotes(info), percent: 0, message: "" }));
  updater.on("update-not-available", () => update({ phase: "current", version: null, notes: "", message: "" }));
  updater.on("download-progress", progress => update({
    phase: "downloading", percent: Math.max(0, Math.min(100, progress.percent)),
    transferred: progress.transferred, total: progress.total
  }));
  updater.on("update-downloaded", info => {
    downloaded = info;
    update({ phase: "ready", version: info.version, notes: releaseNotes(info), percent: 100, message: "" });
  });
  updater.on("error", error => { if (!cancellation?.cancelled) fail(error); });

  return {
    snapshot: () => ({ ...state }),
    async check() {
      if (!enabled || operation || ["ready", "installing", "saving", "downloading"].includes(state.phase)) return;
      operation = "check";
      try { await updater.checkForUpdates(); }
      catch (error) { fail(error); }
      finally { operation = null; }
    },
    async download() {
      if (!enabled || operation || state.phase !== "available") return;
      operation = "download";
      cancellation = new CancellationToken();
      update({ phase: "downloading", percent: 0, transferred: 0, total: 0, message: "" });
      try { await updater.downloadUpdate(cancellation); }
      catch (error) {
        if (cancellation.cancelled) update({ phase: "available", percent: 0, message: "下载已取消，可以稍后继续。" });
        else fail(error);
      } finally { cancellation = null; operation = null; }
    },
    cancel() { if (operation === "download") cancellation?.cancel(); },
    install() {
      if (state.phase !== "ready" || operation) return;
      update({ phase: "saving", message: "正在保存画布…" });
      requestInstall();
    },
    cancelInstall(message = "已取消安装，可以稍后再试。") {
      if (["saving", "installing"].includes(state.phase)) update({ phase: "ready", message });
    },
    async installSaved() {
      if (state.phase !== "saving" || !downloaded) return false;
      try {
        // Verify again after saving: the cached installer may have changed since download.
        await verifyInstaller(downloaded.downloadedFile, downloaded);
        update({ phase: "installing", message: "正在启动安装程序…" });
        updater.quitAndInstall(false, true);
        return state.phase === "installing";
      } catch (error) {
        downloaded = null;
        // Recreate the helper so its in-memory fast path cannot reuse a corrupt file.
        updater.downloadedUpdateHelper = null;
        fail(error);
        return false;
      }
    },
    dispose() { cancellation?.cancel(); }
  };
}

module.exports = { createUpdateController, verifyInstaller, RELEASES_URL };
