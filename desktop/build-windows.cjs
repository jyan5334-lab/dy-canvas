const fs = require("node:fs");
const path = require("node:path");
const { build, Platform, Arch } = require("electron-builder");

const projectDir = path.resolve(__dirname, "..");
const metadata = require(path.join(projectDir, "package.json"));
const outputDir = path.resolve(projectDir, metadata.build.directories.output);

// Read the intermediate uninstaller directly instead of executing its stub.
// This uses electron-builder's bundled reader and pinned toolchain version.
if (process.platform === "win32") {
  const { WineVmManager } = require("app-builder-lib/out/vm/WineVm");
  const { UninstallerReader } = require("app-builder-lib/out/targets/nsis/nsisUtil");
  const originalExec = WineVmManager.prototype.exec;
  WineVmManager.prototype.exec = async function (file, args, options, ...rest) {
    if (path.dirname(path.resolve(file)) === outputDir &&
        /^DYCanvas-Setup-.*\.exe$/i.test(path.basename(file)) &&
        args.length === 0 && options?.env?.__COMPAT_LAYER === "RunAsInvoker") {
      const uninstaller = path.join(outputDir, `${path.basename(file, "exe")}__uninstaller.exe`);
      await UninstallerReader.exec(file, uninstaller);
      return "";
    }
    return originalExec.call(this, file, args, options, ...rest);
  };
}

build({ projectDir, publish: "never", targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64) })
  .then(artifacts => {
    const installer = artifacts.find(file => file.endsWith(".exe"));
    if (!installer || fs.statSync(installer).size < 50 * 1024 * 1024) {
      throw new Error("The complete Windows installer was not generated");
    }
    console.log(`Windows installer: ${installer}`);
  })
  .catch(error => { console.error(error); process.exitCode = 1; });
