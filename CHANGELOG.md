# 版本公告

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
