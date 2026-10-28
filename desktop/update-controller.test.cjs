const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createUpdateController } = require("./update-controller.cjs");

function fixture(overrides = {}) {
  const updater = new EventEmitter();
  let checks = 0, installs = 0, saves = 0;
  updater.checkForUpdates = async () => {
    checks++;
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "1.2.0", releaseNotes: "New release" });
  };
  updater.quitAndInstall = () => installs++;
  Object.assign(updater, overrides);
  const controller = createUpdateController({ updater, currentVersion: "1.1.0", enabled: true, onState() {}, requestInstall() { saves++; } });
  return { controller, updater, counts: () => ({ checks, installs, saves }) };
}

test("checks never download automatically; duplicate checks and newer prereleases are disabled", async () => {
  let finish;
  const { controller, updater, counts } = fixture();
  const original = updater.checkForUpdates;
  updater.checkForUpdates = () => new Promise(resolve => { finish = async () => { await original(); resolve(); }; });
  const check = controller.check();
  await controller.check();
  await finish(); await check;
  assert.deepEqual(counts(), { checks: 1, saves: 0, installs: 0 });
  assert.equal(controller.snapshot().phase, "available");
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
});

test("offline and missing update metadata stay recoverable", async () => {
  const { controller, updater } = fixture({ checkForUpdates: async () => { throw new Error("network offline"); } });
  await controller.check();
  assert.equal(controller.snapshot().phase, "error");
  updater.checkForUpdates = async () => { updater.emit("update-not-available"); };
  await controller.check();
  assert.equal(controller.snapshot().phase, "current");
  updater.checkForUpdates = async () => { throw new Error("404 latest.yml"); };
  await controller.check();
  assert.match(controller.snapshot().message, /更新清单/);
});

test("cancelled download can be retried and never installs on its own", async () => {
  const { controller, updater, counts } = fixture();
  updater.downloadUpdate = token => token.createPromise(() => {});
  await controller.check();
  const pending = controller.download();
  await controller.download();
  assert.equal(controller.snapshot().phase, "downloading");
  controller.cancel(); await pending;
  assert.equal(controller.snapshot().phase, "available");
  controller.install();
  assert.equal(counts().installs, 0);
  assert.equal(counts().saves, 0);
});

test("installation waits for saved data, revalidates the cached installer, and blocks tampering", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dy-update-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "installer.exe");
  const content = Buffer.from("test installer bytes");
  await fs.writeFile(filename, content);
  const info = { version: "1.2.0", downloadedFile: filename, files: [{ url: "DYCanvas-Setup-1.2.0-x64.exe", size: content.length, sha512: crypto.createHash("sha512").update(content).digest("base64") }] };
  const { controller, updater, counts } = fixture();
  updater.downloadUpdate = async () => updater.emit("update-downloaded", info);
  await controller.check(); await controller.download();
  assert.equal(controller.snapshot().phase, "ready");
  controller.install(); controller.install();
  assert.deepEqual(counts(), { checks: 1, saves: 1, installs: 0 });
  controller.cancelInstall("save failed");
  assert.equal(controller.snapshot().phase, "ready");
  assert.equal(counts().installs, 0);
  controller.install();
  assert.equal(await controller.installSaved(), true);
  assert.equal(counts().installs, 1);

  const tampered = fixture();
  tampered.updater.emit("update-downloaded", info);
  await fs.writeFile(filename, Buffer.from("evil installer bytes"));
  tampered.controller.install();
  assert.equal(await tampered.controller.installSaved(), false);
  assert.equal(tampered.counts().installs, 0);
  assert.match(tampered.controller.snapshot().message, /校验/);
});

test("download failures report verification errors without becoming installable", async () => {
  const { controller, updater, counts } = fixture();
  updater.downloadUpdate = async () => { const error = new Error("sha512 mismatch"); updater.emit("error", error); throw error; };
  await controller.check(); await controller.download(); controller.install();
  assert.equal(controller.snapshot().phase, "error");
  assert.equal(counts().installs, 0);
  assert.match(controller.snapshot().message, /校验/);
});
