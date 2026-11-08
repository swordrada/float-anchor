# 版本公告

## v1.0.24

发布日期：2026-11-08。

### 更新内容

- **减少坚果云更新通知**：编辑先快速保存到本机，WebDAV / GitHub 改为每 5 分钟批量同步，取消每次编辑后的实时上传；手动同步仍立即执行。
- **视图只在本机保存**：平移、缩放、切换白板或页面不再被当作内容变更，不会因此上传整份 `float-anchor.json`。
- **正常退出时补同步**：先保存主窗口和即刻窗口的未完成编辑，再限时尝试同步；离线时保留本地内容，下次启动自动核对并重试。
- **避免新旧内容互相覆盖**：持久保存上次共同版本，自动同步单边改动；双方都修改过或大量内容将被覆盖时继续要求确认。外部恢复的旧本地备份不会自动覆盖较新的共同版本。
- **完善数据保护**：每日记纳入同步比较；修复上传期间的新编辑可能被旧快照覆盖的问题；远端写入增加版本校验，遇到并发修改停止覆盖。

### 下载与升级

| 平台 | 安装包 |
|------|--------|
| macOS · Apple Silicon（M 系列） | [FloatAnchor-1.0.24-mac-arm64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.24/FloatAnchor-1.0.24-mac-arm64.dmg) |
| macOS · Intel | [FloatAnchor-1.0.24-mac-x64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.24/FloatAnchor-1.0.24-mac-x64.dmg) |
| Windows · 64 位（x64） | [FloatAnchor-1.0.24-win-setup.exe](https://github.com/swordrada/float-anchor/releases/download/v1.0.24/FloatAnchor-1.0.24-win-setup.exe) |

建议各设备一起升级。首次升级若发现无法确定来源的历史差异，仍会提示确认；不会仅凭电脑时间自动覆盖。强制结束进程时，刚输入且尚未落盘的最后约一秒内容仍可能丢失，正常关闭会主动等待保存完成。

[GitHub Release](https://github.com/swordrada/float-anchor/releases/tag/v1.0.24) · [同步机制](https://github.com/swordrada/float-anchor/blob/main/SYNC.md)

## v1.0.23

首次发布：2026-11-07；macOS / Windows 完整发布：2026-11-08。

本次更新聚焦软件更新的发现与错误反馈，提升检查更新的可靠性，并补齐 macOS（Apple Silicon / Intel）和 Windows 64 位安装包。

### 更新内容

- **更可靠地发现新版本**：优先读取 GitHub Release 的公开更新元数据，读取失败时自动尝试 GitHub API，减少对 API 请求额度的依赖；检查时禁用缓存，降低旧缓存造成的遗漏。
- **检查失败时显示具体原因**：网络请求失败、请求超时、发布文件缺失或元数据异常时，在设置中明确显示错误，避免误报“已是最新版本”，并可手动重试。
- **准确匹配平台安装包**：分别识别 Apple Silicon Mac、Intel Mac 和 Windows x64 安装包，校验正式版本号、文件名及官方下载地址；缺少对应安装包时明确提示。
- **减少重复请求**：后台检查间隔调整为 15 分钟，同时发起的检查共用一次请求；检查设置 20 秒超时，避免长时间停留在检查状态。

### 下载与升级

| 平台 | 安装包 |
|------|--------|
| macOS · Apple Silicon（M 系列） | [FloatAnchor-1.0.23-mac-arm64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.23/FloatAnchor-1.0.23-mac-arm64.dmg) |
| macOS · Intel | [FloatAnchor-1.0.23-mac-x64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.23/FloatAnchor-1.0.23-mac-x64.dmg) |
| Windows · 64 位（x64） | [FloatAnchor-1.0.23-win-setup.exe](https://github.com/swordrada/float-anchor/releases/download/v1.0.23/FloatAnchor-1.0.23-win-setup.exe) |

已安装的用户可前往 **设置 → 应用 → 软件更新** 检查更新。如果旧版本未能发现新版本，请直接下载对应平台的安装包，退出应用后覆盖安装。笔记保留在原来的本地数据目录，无需重新导入。

本次发布同时提供 `latest-mac.yml`、`latest.yml` 和各安装包对应的 `.blockmap` 文件，供更新流程使用；手动安装只需下载 `.dmg` 或 `.exe`。

[GitHub Release](https://github.com/swordrada/float-anchor/releases/tag/v1.0.23) · [与 v1.0.22 的代码差异](https://github.com/swordrada/float-anchor/compare/v1.0.22...v1.0.23)
