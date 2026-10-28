# 发布 Windows 更新

桌面版固定从 `jyan5334-lab/dy-canvas` 的公开 GitHub Releases 获取正式更新。发布源码或只推送 Git 标签不会触发桌面更新。

1. 用 `npm version 新版本 --no-git-tag-version` 同时更新 `package.json` 和锁文件，并更新 `CHANGELOG.md`。
2. 在 Windows 上执行 `npm ci`、`npm test`、`npm run dist:win`。
3. 验证安装包与桌面运行，确认旧版数据可以保留。
4. 提交源码，创建与版本一致的 `v版本` 标签并推送。
5. 在该标签的 Release 中一起上传 `release/DYCanvas-Setup-版本-x64.exe`、同名 `.exe.blockmap` 及 `release/latest.yml`。额外提供 `SHA256SUMS.txt` 便于手动核对下载。
6. 确认 `latest.yml` 中版本、文件名、文件大小和 SHA512 与上传的安装包一致；正式发布为公开、非草稿、非预发布版本，并标记为最新版本。

本项目的本地构建入口设置 `publish: never`，不会在构建时自动上传。不要手动改动清单里的版本或校验值来伪造更新，必须上传同一次构建的产物。

涉及品牌或快捷方式变更时，在 Windows PowerShell 7 中执行 `npm run test:shortcuts`，检查重命名、图标刷新、已删除快捷方式、同名冲突与重复链接。测试只在 `release/shortcut-test-*` 创建样本，不改系统桌面或安装注册表。安装包中的 `resources/DYcanvas-版本.ico` 必须与该版 `desktop/icon.ico` 一致。

更新由 Electron 主进程的 `electron-updater` 执行；网页画布仍限制外部网络请求。客户端不携带 GitHub 访问令牌。只检查正式新版本，不自动降级，不自动下载，不在退出时自动安装。安装前保存本地数据，下载时和启动安装前校验安装文件。当前未提供 Windows 代码签名，校验值用于验证下载完整性，不替代发布者数字签名。
