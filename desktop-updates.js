(() => {
  const api = window.canvasDesktop?.updates;
  if (!api) return;
  const element = id => document.getElementById(id);
  const dialog = element("desktopUpdateDialog");
  const toggle = element("desktopUpdateButton");
  let state = null;
  toggle.hidden = false;
  const mb = value => `${(Math.max(0, Number(value) || 0) / 1048576).toFixed(1)} MB`;

  function render(next) {
    state = next;
    const busy = ["checking", "downloading", "saving", "installing"].includes(state.phase);
    const available = ["available", "downloading", "ready", "saving", "installing"].includes(state.phase);
    const titles = {
      idle: "检查新版本", checking: "正在检查更新…", current: "当前已是最新版本",
      available: `发现新版本 ${state.version}`, downloading: `正在下载 ${state.version}`,
      ready: `${state.version} 已准备好安装`, saving: "正在保存画布…",
      installing: "正在启动安装程序…", error: "更新暂时未完成"
    };
    element("updateCurrentVersion").textContent = `当前版本 ${state.currentVersion}`;
    element("updateStatus").textContent = state.enabled ? titles[state.phase] || titles.idle : "开发模式";
    element("updateMessage").textContent = !state.enabled ? "请在已安装的 Windows 桌面版中检查更新。" : state.message ||
      (state.phase === "ready" ? "安装前会保存画布。安装完成后重新打开应用，本地画布与附件继续保留。" :
      state.phase === "available" ? "新版本已发布，下载后可直接安装。" :
      state.phase === "current" ? "暂时没有新的正式版本。" :
      state.phase === "downloading" ? "可以关闭此窗口，下载将在后台继续。" : "从 DYcanvas GitHub 仓库获取正式版本。");
    element("updateProgressSection").hidden = state.phase !== "downloading";
    element("updateProgress").value = state.percent || 0;
    element("updateProgressText").textContent = `${Math.floor(state.percent || 0)}% · ${mb(state.transferred)} / ${mb(state.total)}`;
    element("updateNotesSection").hidden = !state.notes;
    // Never insert release content into the live document as HTML.
    element("updateNotes").textContent = new DOMParser().parseFromString(state.notes || "", "text/html").body.textContent;
    element("updateCheckButton").hidden = ["downloading", "ready", "saving", "installing"].includes(state.phase);
    element("updateCheckButton").disabled = busy || !state.enabled;
    element("updateCheckButton").textContent = state.phase === "checking" ? "检查中…" : state.phase === "error" ? "重新检查" : "检查更新";
    element("updateDownloadButton").hidden = state.phase !== "available";
    element("updateCancelButton").hidden = state.phase !== "downloading";
    element("updateInstallButton").hidden = !["ready", "saving", "installing"].includes(state.phase);
    element("updateInstallButton").disabled = state.phase !== "ready";
    toggle.querySelector(".update-indicator").hidden = !available;
    toggle.title = available ? `软件更新 · ${state.version}` : "检查更新";
    toggle.setAttribute("aria-label", toggle.title);
  }

  async function action(name) {
    try { render(await api[name]()); }
    catch { if (state) render({ ...state, phase: "error", message: "更新操作未能完成，请重试。" }); }
  }
  toggle.addEventListener("click", () => {
    dialog.showModal();
    if (state?.enabled && ["idle", "current", "error"].includes(state.phase)) action("check");
  });
  element("closeUpdateDialog").addEventListener("click", () => dialog.close());
  element("updateCheckButton").addEventListener("click", () => action("check"));
  element("updateDownloadButton").addEventListener("click", () => action("download"));
  element("updateCancelButton").addEventListener("click", () => action("cancel"));
  element("updateInstallButton").addEventListener("click", () => action("install"));
  element("updateReleasesButton").addEventListener("click", () => action("releases"));
  api.subscribe(render);
  action("state");
})();
