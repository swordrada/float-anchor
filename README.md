<p align="center">
  <img src="public/float-anchor-logo.svg" width="120" alt="FloatAnchor Logo">
</p>

<h1 align="center">FloatAnchor</h1>

<p align="center">
  <b>开源 · 免费 · 本地优先</b><br>
  一款简洁的白板卡片笔记软件，支持 macOS 和 Windows。<br>
  灵感来自 <a href="https://heptabase.com">Heptabase</a>，专注于自由画布 + 卡片笔记的核心体验。
</p>

<p align="center">
  <a href="https://github.com/swordrada/float-anchor/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License">
  </a>
  <img src="https://img.shields.io/badge/price-free-brightgreen.svg" alt="Free">
  <img src="https://img.shields.io/badge/data-local%20first-orange.svg" alt="Local First">
</p>

---

## 为什么选择 FloatAnchor？

> **完全开源** — 代码在 GitHub 公开，任何人都可以审查、修改、分发。  
> **永久免费** — 没有付费墙、没有订阅、没有增值收费，所有功能开箱即用。  
> **本地优先** — 笔记 100% 存储在你的电脑本地，不需要注册账号。可选配置坚果云 WebDAV 或 GitHub 进行云端同步。  
> **无商业化** — 这是一个纯粹的个人项目，不含广告、不采集数据、不追踪用户行为。

---

## 功能特色

### 知识画布与内容组织

以画布为单位管理不同主题，左侧导航可创建、重命名和切换画布，白板总览则帮助你快速判断每张画布的内容规模。画布中可自由放置卡片、无边框文本、横幅标题与彩色分区；卡片支持拖拽、缩放、磁吸对齐、框选自动排布、移动到其他画布，以及用连线和可跳转链接把相关想法串起来。

新建连线默认沿列间通道走折线，同列使用上下连接，并避开中间卡片。点击或右键连线可调整走线类型、固定起终边及通道位置；移动和缩放卡片时实时更新，设置随笔记保存和同步。已有曲线保持兼容。标题也支持与卡片、分区及其他标题磁吸对齐，框选拖动仍保持整组相对位置。

### 每日记录与回顾

每日记为当天留出一块安静的写作空间：月历会用短标记显示已经记录的日子，点击任意日期即可补写或回顾。你可以快速切换前后日期，为记录添加标题和正文，并在回顾视图中按时间浏览过往内容的标题与摘要。

### 全局搜索

点击侧栏搜索框或放大镜，或按 `⌘K` / `Ctrl+K`，即可跨白板搜索白板、卡片、标题、文本、分区和每日记。输入时自动更新结果，通过 Type 筛选某一种内容；保留 Type 则搜索所有类型。结果按所属白板分组，匹配文字会高亮，单击或用上下方向键切换预览，双击、按回车或点击「打开」即可跳转到原内容。

### 即刻模式

需要先把想法记下来时，可从侧栏切换到独立的「即刻模式」窗口。它会置顶显示一个专注的记录空间，支持 Markdown，按 `⌘ + Enter` / `Ctrl + Enter` 即可投入所选白板和分区；关闭窗口后会自动回到主界面。

### 富文本写作与素材

卡片和每日记共用所见即所得编辑器，支持一级至四级标题、加粗、斜体、删除线、列表、引用、行内代码、链接、文字颜色和高亮等常用格式。图片可直接粘贴或拖入，应用会保存为本地文件并以引用插入，避免把大型 base64 数据塞进笔记，同时让同步更轻量。

卡片中的 YouTube 视频链接会自动显示封面预览，宽度跟随卡片，只保留视频画面，不显示额外链接与底部操作栏。点击即可在卡片内播放，也可以在应用内放大观看；窄卡片会自动使用放大播放器。编辑时粘贴视频地址即可嵌入，在视频下方行首按退格可删除，按 `⌘Z` / `Ctrl+Z` 可恢复；也支持画面内的删除按钮与重做。支持普通链接、短链接、Shorts、直播链接和起播时间。

### 流畅操作与个性化

画布可通过双指滑动或鼠标中键平移，通过捏合或 `Ctrl + 滚轮` 缩放；创建卡片、文本、标题和分区，以及自动排布、缩放和微移等高频操作均可使用快捷键完成。应用提供 Light / Dark 主题与设置内快捷键速查表，让长时间整理也保持舒适。

### 本地优先与可靠同步

所有数据默认保存在本地；如有跨设备需求，可选择坚果云 WebDAV 或 GitHub 仓库同步。编辑先保存到本机，云端每 5 分钟批量同步，正常关闭时也会尝试同步；启动时自动核对双方内容。画布平移、缩放和页面切换仅在本机保存，双方同时修改或远端可能覆盖大量本地数据时会暂停并要求确认。同步状态常驻侧栏，应用内更新支持检测、下载、暂停与继续。

## 下载安装

当前稳定版为 **[`v1.0.29`](https://github.com/swordrada/float-anchor/releases/tag/v1.0.29)**，将分区填充与边框合并为统一颜色设置，保留线型和批量改色，兼容已有分区颜色，保留视频预览和批量同步功能，提供 macOS（Apple Silicon / Intel）和 Windows 64 位安装包。完整变更见 [版本公告](CHANGELOG.md#v1029)。

| 文件 | 平台 | 适用设备 |
|------|------|----------|
| [FloatAnchor-1.0.29-mac-arm64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.29/FloatAnchor-1.0.29-mac-arm64.dmg) | macOS | Apple Silicon（M 系列） |
| [FloatAnchor-1.0.29-mac-x64.dmg](https://github.com/swordrada/float-anchor/releases/download/v1.0.29/FloatAnchor-1.0.29-mac-x64.dmg) | macOS | Intel Mac |
| [FloatAnchor-1.0.29-win-setup.exe](https://github.com/swordrada/float-anchor/releases/download/v1.0.29/FloatAnchor-1.0.29-win-setup.exe) | Windows | 64 位 Windows（x64） |

已安装的用户可在 **设置 → 应用 → 软件更新** 中检查更新。如果旧版本无法发现更新，可直接下载对应平台安装包，退出应用后覆盖安装；笔记仍保存在原来的本地数据目录。

Windows 版下载更新后会先保存当前编辑，在原安装目录静默升级，再自动打开新版，无需操作安装向导。下载仍可暂停和继续；若保存或启动更新失败，应用会保留当前窗口并显示错误。安装在需要管理员权限的目录时，Windows 可能仍会要求系统授权。旧版需要先完成一次原有方式的升级，之后才能使用新的静默更新流程。

### macOS 安装

1. 双击下载的 `.dmg` 文件
2. 将 **FloatAnchor** 拖入 **Applications** 文件夹
3. 首次打开如果提示"无法验证开发者"，右键点击应用 → 选择 **打开** 即可

### Windows 安装

1. 双击 `.exe` 安装程序
2. 选择安装目录，点击安装
3. 安装完成后，桌面和开始菜单会自动创建 FloatAnchor 快捷方式

## 使用指南

### 画布管理

- **白板总览** — 点击左侧的 **白板总览**，按白板名称和内容规模快速找到要继续整理的内容
- **新建画布** — 点击左侧导航栏底部的 **＋ 新建画布** 按钮，输入名称后回车
- **切换画布** — 点击左侧导航栏中的画布名称
- **重命名画布** — 双击画布名称，或点击 hover 时出现的铅笔图标
- **删除画布** — hover 画布名称时，点击右侧的 ✕ 按钮（至少保留一个画布）

### 每日记

- **打开每日记** — 点击左侧的 **每日记** 进入当天记录
- **查看记录状态** — 月历中带有短标记的日期表示已有记录；点击任意日期即可开始补写或回顾
- **切换日期** — 用编辑页右上角的前一天 / 后一天切换日期
- **回顾记录** — 点击 **历史** 查看已写过的日期、标题与正文预览

### 即刻模式

- **打开** — 点击侧栏的 **切换即刻模式**；主窗口会最小化，独立窗口始终置顶
- **快速记录** — 输入想法后按 `⌘ + Enter` / `Ctrl + Enter`，内容会创建为所选白板和分区中的卡片
- **继续编辑卡片** — 点击白板卡片右上角的闪电（悬停卡片时显示），在即刻模式中打开原笔记；修改自动保存，不改变原位置或分区。
- **最近笔记** — 展示最近在即刻模式中使用的 10 篇笔记，打开后排到最前并去重；新建草稿单独保留。
- **返回主界面** — 关闭即刻模式窗口前先保存；也可点击“在白板中查看”定位原卡片。
- **交互预览** — 开发时运行 `npm run dev:preview`，打开 `http://127.0.0.1:5177/`。使用浏览器独立示例数据，可重置或模拟保存失败；系统级窗口行为需要在 Electron 中测试。

### 卡片操作

- **创建卡片** — 在画布空白处 **双击** 即可在点击位置创建新卡片，或点击右上角的 **新建卡片** 按钮
- **编辑卡片** — **双击** 卡片进入编辑模式，或 hover 卡片顶部灰色条时点击铅笔图标
- **移动卡片** — hover 卡片顶部出现灰色拖拽条，按住拖动到任意位置；靠近其他卡片时自动磁吸对齐，保持统一间距
- **缩放卡片** — hover 卡片右下角出现缩放手柄（↗↙ 箭头光标），拖拽调整大小
- **调整标题宽度** — 鼠标靠近标题右侧边缘显示左右箭头，拖动可拉长或缩短；Tab 聚焦手柄后，可用左右方向键微调，按住 Shift 加速。
- **删除卡片** — hover 卡片顶部灰色条时，点击右侧垃圾桶图标
- **右键菜单** — 在卡片上右键（macOS 双指点击），可进行最佳大小调整、拷贝链接、移动到其他画布、连接卡片、编辑和删除；菜单项右侧会标注对应快捷键
- **画布右键菜单** — 在画布空白处右键，可创建空白卡片、创建文本、创建标题、创建分区
- **分区颜色** — 点击分区标题，在浮动工具栏中统一修改填充与边框颜色，并调整线型，支持预设色与自定义色值；按住 Shift / ⌘ / Ctrl 点击可多选并批量修改。
- **分区最佳大小** — 选中分区后按 `F`、点击工具栏「最佳大小」或使用右键菜单。先按内容调整所有成员卡片的高度（保持宽度），再以 12px 磁吸间距收紧排布，最后调整分区边界；屏幕外卡片和带连线卡片也会一起整理。
- **插入图片** — 在编辑卡片时直接 **粘贴**（⌘V / Ctrl+V）或 **拖入** 图片；图片会自动存为本地文件并以引用插入
- **退出编辑** — 点击卡片外部区域，或按 `Esc` 键

### 文本框

- **创建文本** — 在画布空白处右键 → **创建文本**，或按快捷键 `T`，在画布上放置一个自由文本块
- **编辑文本** — 双击文本框进入编辑，输入内容后点击外部或按 `Esc` 退出
- **移动 / 排布** — 文本框与卡片一样可拖动、可框选、可参与自动排布

### 画布导航

| 操作 | macOS | Windows |
|------|-------|---------|
| 平移画布 | 双指滑动触控板 | 鼠标中键拖拽 |
| 缩放画布 | 双指捏合 | Ctrl + 鼠标滚轮 |

### 文本格式

编辑卡片时，工具栏提供以下格式选项：

- **H2 / H3 / H4** — 二级、三级、四级标题
- **B** — 加粗（快捷键 `⌘B` / `Ctrl+B`）
- **I** — 斜体（快捷键 `⌘I` / `Ctrl+I`）
- **S** — 删除线
- **</>** — 行内代码
- **•** — 无序列表
- **1.** — 有序列表
- **>** — 引用块
- **🔗** — 插入链接

也支持直接输入 Markdown 语法，编辑器会实时渲染为对应样式。

### 键盘快捷键

画布上（非编辑状态）支持以下快捷键，完整列表也可在 **设置 → 键盘快捷键** 中查看：

| 操作 | macOS | Windows |
|------|-------|---------|
| 全局搜索 | `⌘K` | `Ctrl+K` |
| 新建卡片 | `C` | `C` |
| 新建文本 | `T` | `T` |
| 新建分区 | `R` | `R` |
| 自动排布选中 | `L` | `L` |
| 分区最佳大小（选中分区后） | `F` | `F` |
| 全选 | `⌘A` | `Ctrl+A` |
| 编辑选中（单选时） | `⏎` | `Enter` |
| 删除选中 | `⌫` | `Del` |
| 微移选中（`⇧` 大步） | 方向键 | 方向键 |
| 放大 / 缩小 / 复位 | `⌘+` / `⌘-` / `⌘0` | `Ctrl +` / `Ctrl -` / `Ctrl 0` |
| 取消选择 / 退出连线 | `Esc` | `Esc` |

> 右键菜单中的相关项也会在右侧标注对应快捷键，方便随手查看。

### 设置

点击侧栏左上角的齿轮按钮打开设置面板：

- **主题切换** — 在 Light 和 Dark 之间切换
- **云同步** — 选择同步后端：**坚果云 WebDAV**、**GitHub** 或 **关闭**。配置方式见下方 [云同步](#云同步) 小节
- **提取内嵌图片为文件** — 在「数据管理」中，把历史笔记里以 base64 内嵌的图片一键抽取为本地文件、替换为引用，显著减小数据体积（操作前自动备份）
- **软件更新** — 在「应用」中手动检查更新；检查失败会显示具体原因，可再次点击重试。下载更新时可在侧栏或设置中手动停止，之后继续下载会自动从已完成进度恢复

### 云同步

应用**始终优先保存和展示本地数据**。配置同步后端后，启动时自动核对，之后**每 5 分钟批量同步一次**，也可在设置中手动同步；正常关闭会先保存本地，再限时尝试同步，离线时保留本地内容并在下次启动重试。画布平移、缩放、页面切换属于本机视图，不会因此上传整份笔记。

同步会比较实际内容与上次共同版本：只有本地修改时上传，只有远端修改时备份后下载；双方都修改过或远端覆盖风险较高时，**保留本地并要求你确认**。侧栏用“已保存·待同步”区分本地保存与云端完成。多设备建议一起升级，以避免旧客户端继续频繁上传视图变化。详见 [同步机制](SYNC.md)。

在 **设置 → 同步** 中选择后端：

**坚果云 WebDAV**

填入坚果云 WebDAV 服务器地址、账号邮箱和**应用密码**（在坚果云网页后台「账户信息 → 安全选项 → 添加应用」生成），点击测试 / 保存后自动开启同步。

**GitHub**

用一个 GitHub 仓库作为同步后端，提交历史即版本历史，可在仓库网页直接查看、回看任意版本。

1. 在 GitHub 新建一个仓库（建议**私有**）用于存放同步数据
2. 前往 **GitHub → Settings → Developer settings → Fine-grained tokens** 生成访问令牌（PAT），**仅授予该仓库的 Contents 读写权限**
3. 回到 FloatAnchor **设置 → 同步 → GitHub**，填入：
   - **仓库** — `owner/repo` 形式（如 `yourname/float-anchor-data`）
   - **访问令牌 (PAT)** — 上一步生成的 fine-grained token
   - **分支** — 默认 `main`
4. 点击测试 / 保存，连接成功后即开启同步

> 访问令牌通过系统安全存储（macOS Keychain / Windows 凭据管理器）加密保存，不写入明文配置。

### 数据存储

所有笔记数据保存在本地：

- **macOS** — `~/Library/Application Support/float-anchor/data/`
- **Windows** — `%APPDATA%/float-anchor/data/`

## 从 Heptabase 迁移

如果你之前使用 Heptabase，可以将所有白板、卡片笔记和图片迁移到 FloatAnchor。

### 前置准备

1. 在 Heptabase 中导出备份数据（Settings → Export → Backup）
2. 解压导出的备份文件夹
3. 确保电脑已安装 [Python 3](https://www.python.org/downloads/)
4. 打开本项目目录，也就是包含 `scripts/migrate-heptabase.py` 的目录
5. **关闭 FloatAnchor 应用**（避免迁移数据被覆盖）

### macOS 迁移

打开终端（Terminal），运行：

```bash
python3 scripts/migrate-heptabase.py "$HOME/Downloads/heptabase-backup"
```

如果卡片中有图片，需要带上 Token（获取方式见下方）：

```bash
python3 scripts/migrate-heptabase.py "$HOME/Downloads/heptabase-backup" --token '你的Token'
```

### Windows 迁移

打开 PowerShell，运行：

```powershell
python .\scripts\migrate-heptabase.py "C:\Users\你的用户名\Downloads\heptabase-backup"
```

如果卡片中有图片，需要带上 Token（获取方式见下方）：

```powershell
python .\scripts\migrate-heptabase.py "C:\Users\你的用户名\Downloads\heptabase-backup" --token "你的Token"
```

实际路径示例：

```powershell
python .\scripts\migrate-heptabase.py "E:\heptabase-backup" --token "你的Token"
```

> **注意**：Windows 下 Python 命令可能是 `python`、`py` 或 `python3`，取决于安装方式。如果提示找不到命令，尝试换用另一个。

### 迁移图片 — 如何获取 Token

Heptabase 的备份不包含图片文件，需要通过 Token 从 Heptabase 服务器下载。

1. 在浏览器中打开 [Heptabase 网页版](https://app.heptabase.com) 并登录
2. 按 `F12`（macOS 下 Safari 需先在偏好设置中启用开发者菜单）打开开发者工具
3. 切换到 **Network**（网络）面板
4. 在 Heptabase 中随意操作（如打开一张卡片），在 Network 面板中找到任意请求
5. 点击该请求，在 **Headers**（标头）中找到 `Authorization` 字段，只复制 `Bearer ` 后面的完整字符串，不要包含 `Bearer `

> **注意**：Token 有效期约 1 小时，请在获取后尽快运行迁移脚本。图片会下载到本地，后续使用无需再提供 Token。

### 重新导入（补充图片）

如果第一次导入时忘记带 `--token`，图片没有下载，可以加上 `--force` 重新导入：

```bash
# macOS
python3 scripts/migrate-heptabase.py "$HOME/Downloads/heptabase-backup" --token '你的Token' --force
```

```powershell
# Windows
python .\scripts\migrate-heptabase.py "C:\Users\你的用户名\Downloads\heptabase-backup" --token "你的Token" --force
```

`--force` 会智能合并同名画布：更新从 Heptabase 导入的卡片（如补充图片），同时保留你在 FloatAnchor 中手动创建的卡片、标签和分区。导入前会自动备份已有数据（`float-anchor.json.bak`）。

默认会写入 FloatAnchor 的本地数据文件：

- macOS：`~/Library/Application Support/float-anchor/data/float-anchor.json`
- Windows：`%APPDATA%\float-anchor\data\float-anchor.json`

迁移成功后，脚本会把图片缓存到同级 `images` 目录，并刷新同步时间戳，方便后续 WebDAV/坚果云同步把本地迁移结果上传到云端。

### 迁移内容

| 项目 | 说明 |
|------|------|
| 白板（Whiteboard → Canvas） | 所有未删除的白板，保留名称 |
| 卡片笔记 | 标题、正文（Markdown 格式）、位置坐标、卡片宽高 |
| 图片 | 通过 `--token` 参数下载到本地，支持 PNG / JPEG / GIF / WebP / TIFF |
| 卡片布局 | 保留相对位置，自动紧凑排列 |

## 技术栈

Electron + React + TypeScript + Vite + TipTap + Zustand

## License

[MIT License](LICENSE) — 完全开源，自由使用、修改和分发。


Heptabase 迁移会保留卡片、标题与分区间的连线、原始列间通道、固定连接边及手动转折点。连线默认使用清晰的灰蓝色，线宽随白板缩放补偿；可右键卡片、标题或分区选择“连接”。

对于已导入的旧数据，可用只读 Heptabase 数据库生成布局修复候选（不改正文、不重新创建已删除笔记）：

```bash
python3 scripts/repair-heptabase-layout.py --all --database /path/to/hepta.db --data /path/to/float-anchor.json --output /path/to/repaired.json --report /path/to/report.json
```

修复保留每张 FloatAnchor 卡片当前宽度（默认 373px 或手动设置的宽度），不使用 Heptabase 的宽度覆盖它，也不随布局比例拉宽。如已在当前 FloatAnchor 卡片宽度下测量正文高度，可用 `--measured-heights /path/to/heights.json` 传入卡片 ID 到高度的映射。修复会同步拉开纵向间距与连线转折点，保留列布局并容纳正文。

先检查报告并备份原数据，再正常保存、退出 FloatAnchor 后替换数据文件。支持用 `--canvas '章节名'` 代替 `--all`；遇到无法明确匹配的对象或连线端点会中止。
