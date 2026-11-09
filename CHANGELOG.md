# 版本公告

## v1.0.26

发布日期：2026-11-09。

本次更新采用确认后的「纯白底 · 微光海蓝 F」品牌图标，保留 1.0.25 的分区外观与最佳大小整理功能。

### 更新内容

- **更明亮的品牌配色**：浅色图标从米白底调整为纯白底，F 使用更清透、鲜亮的海蓝色。
- **柔和的海面水光**：在双层海浪 F 内加入顺着海浪方向展开的深浅渐变与微光，保留清晰轮廓和两层之间的留白。
- **完整适配明暗主题**：深色界面使用深海蓝底板，保留同样的海蓝水光；侧栏、即刻窗口和 favicon 同步更新。
- **更新桌面图标**：macOS、Windows 安装包及各尺寸应用图标均使用同一套新设计。

### 下载与升级

| 平台 | 安装包 |
|------|--------|
| macOS · Apple Silicon（M 系列） | [FloatAnchor-1.0.26-mac-arm64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.26/FloatAnchor-1.0.26-mac-arm64.dmg) |
| macOS · Intel | [FloatAnchor-1.0.26-mac-x64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.26/FloatAnchor-1.0.26-mac-x64.dmg) |
| Windows · 64 位（x64） | [FloatAnchor-1.0.26-win-setup.exe](https://github.com/swordrada/float-anchor/releases/download/v1.0.26/FloatAnchor-1.0.26-win-setup.exe) |

已安装的用户可前往 **设置 → 应用 → 软件更新** 检查更新，也可退出应用后下载对应安装包覆盖安装。笔记保留在原来的本地数据目录，无需重新导入。

[GitHub Release](https://github.com/swordrada/float-anchor/releases/tag/v1.0.26) · [与 v1.0.25 的代码差异](https://github.com/swordrada/float-anchor/compare/v1.0.25...v1.0.26)

## v1.0.25

发布日期：2026-11-09。

本次更新带来全新海浪 F 标志、分区外观设置和完整的分区最佳大小整理流程，并包含 1.0.23、1.0.24 的全部改进。

### 更新内容

- **全新海浪 F 标志**：以两层海浪组成 F，浅色主题使用米白与海蓝，深色主题使用深海蓝与雾蓝；侧栏、即刻窗口和 favicon 随主题切换，桌面安装图标同步更新。
- **恢复分区颜色与外观设置**：点击分区标题即可修改背景色、边框颜色和实线/虚线；支持八种预设色、自定义十六进制色值，以及 Shift / ⌘ / Ctrl 多选后批量应用。设置会保存，兼容已有分区。
- **分区最佳大小一次整理到位**：先按内容调整所有成员卡片的高度（保留宽度），再保持原有列与阅读顺序，以 12px 磁吸间距紧凑排布，最后收紧分区边界。支持工具栏、右键菜单和快捷键 `F`。
- **完整处理屏幕外与带连线卡片**：整理时加载并测量屏幕外卡片及图片，连线跟随新位置；测量未完成时不提交部分布局，重复整理不漂移。

### 下载与升级

| 平台 | 安装包 |
|------|--------|
| macOS · Apple Silicon（M 系列） | [FloatAnchor-1.0.25-mac-arm64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.25/FloatAnchor-1.0.25-mac-arm64.dmg) |
| macOS · Intel | [FloatAnchor-1.0.25-mac-x64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.25/FloatAnchor-1.0.25-mac-x64.dmg) |
| Windows · 64 位（x64） | [FloatAnchor-1.0.25-win-setup.exe](https://github.com/swordrada/float-anchor/releases/download/v1.0.25/FloatAnchor-1.0.25-win-setup.exe) |

已安装的用户可前往 **设置 → 应用 → 软件更新** 检查更新，也可退出应用后下载对应安装包覆盖安装。笔记保留在原来的本地数据目录，无需重新导入。使用多设备同步时，建议各设备一起升级。

[GitHub Release](https://github.com/swordrada/float-anchor/releases/tag/v1.0.25) · [与 v1.0.24 的代码差异](https://github.com/swordrada/float-anchor/compare/v1.0.24...v1.0.25)

## v1.0.24

发布日期：2026-11-08；同日补齐连线功能后重新构建。已安装同版本的用户请重新下载安装包覆盖安装。

### 更新内容

- **继承完整的 1.0.23 功能**：补入 11 月 7 日的自适应最短路径连线与 YouTube 视频预览，保留以下本地保存和批量同步优化。

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

本次更新包含自适应卡片连线、YouTube 视频预览和软件更新检测改进，并提供 macOS（Apple Silicon / Intel）和 Windows 64 位安装包。

### 更新内容

- **自适应最短路径连线**：根据卡片位置与尺寸，从四边锚点组合中选择最短有效曲线；支持上下左右连接，移动或调整卡片大小时自动重算，预览与最终连线一致。
- **YouTube 视频预览**：卡片内的视频链接显示响应式封面，支持内嵌播放、放大观看和起播时间。

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

2026-11-08 重新构建：补入 11 月 7 日的自适应连线提交。已安装同版本的用户请重新下载安装包覆盖安装。
