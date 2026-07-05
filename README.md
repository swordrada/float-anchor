<p align="center">
  <img src="build/icon.png" width="120" alt="FloatAnchor Logo">
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

- **多画布管理** — 左侧导航栏创建、重命名、删除不同专题的画布
- **卡片笔记** — 在画布上自由创建卡片，支持标题 + 富文本正文
- **文本框** — 在画布上直接放置自由文本块（区别于卡片，无边框），适合做批注、说明或分组标签
- **所见即所得编辑** — 内置 WYSIWYG 编辑器，支持标题、加粗、斜体、删除线、列表、引用、代码、链接等格式
- **图片粘贴** — 直接粘贴或拖入图片，自动保存为本地文件并以引用方式插入（不再以 base64 内嵌，笔记数据保持精简、云同步只在图片变化时传输）
- **自由拖拽** — 卡片可拖动到画布任意位置，右下角手柄可缩放卡片大小
- **磁吸对齐** — 拖拽卡片时自动吸附对齐相邻卡片，保持统一间距
- **框选自动排布** — 框选多个卡片/文本后，一键将其整齐排列对齐
- **卡片连线** — 在卡片之间创建带箭头的连接线，可视化知识关联
- **卡片链接** — 复制卡片链接并粘贴到其他卡片正文中，点击即可飞行导航到目标卡片（支持跨画布跳转）
- **移动卡片** — 将卡片移动到其他画布
- **最佳大小** — 一键将卡片调整为内容紧凑的最佳尺寸
- **画布标题** — 在画布上创建横幅式标题，支持 Markdown 语法设置标题级别
- **分区容器** — 将一组卡片框选在彩色分区中统一管理，拖动分区即可带动所有内含卡片
- **画布导航** — 双指滑动（macOS）/ 鼠标中键拖拽（Windows）平移画布；捏合缩放（macOS）/ Ctrl+滚轮（Windows）缩放画布
- **键盘快捷键** — 建卡片 / 文本 / 分区、自动排布、缩放、微移等常用操作全键盘可达；设置内附速查表，右键菜单也会显示对应快捷键
- **Light / Dark 主题** — 支持亮色和暗黑两种主题，在设置中一键切换
- **云同步（坚果云 / GitHub）** — 可选坚果云 WebDAV 或 GitHub 仓库作为同步后端：本地优先展示，保存后快速上传，后台定期检查同步；如果云端数据会覆盖大量本地内容，会暂停自动同步并要求你确认。同步状态常驻左侧菜单底部，失败时显示精简原因
- **应用内更新** — 检测到新版本时侧栏提示更新，支持一键下载安装，可随时停止并继续下载
- **纯本地存储** — 所有数据保存在本地，不上传任何云端（除非主动配置云同步）

## 下载安装

前往 [Releases](https://github.com/swordrada/float-anchor/releases) 页面下载最新版本：

| 文件 | 平台 | 适用设备 |
|------|------|----------|
| `FloatAnchor-1.0.11-mac-arm64.dmg` | macOS | Apple Silicon (M1/M2/M3/M4) |
| `FloatAnchor-1.0.11-mac-x64.dmg` | macOS | Intel Mac |
| `FloatAnchor-1.0.11-win-setup.exe` | Windows | 64 位 Windows |

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

- **新建画布** — 点击左侧导航栏底部的 **＋ 新建画布** 按钮，输入名称后回车
- **切换画布** — 点击左侧导航栏中的画布名称
- **重命名画布** — 双击画布名称，或点击 hover 时出现的铅笔图标
- **删除画布** — hover 画布名称时，点击右侧的 ✕ 按钮（至少保留一个画布）

### 卡片操作

- **创建卡片** — 在画布空白处 **双击** 即可在点击位置创建新卡片，或点击右上角的 **新建卡片** 按钮
- **编辑卡片** — **双击** 卡片进入编辑模式，或 hover 卡片顶部灰色条时点击铅笔图标
- **移动卡片** — hover 卡片顶部出现灰色拖拽条，按住拖动到任意位置；靠近其他卡片时自动磁吸对齐，保持统一间距
- **缩放卡片** — hover 卡片右下角出现缩放手柄（↗↙ 箭头光标），拖拽调整大小
- **删除卡片** — hover 卡片顶部灰色条时，点击右侧垃圾桶图标
- **右键菜单** — 在卡片上右键（macOS 双指点击），可进行最佳大小调整、拷贝链接、移动到其他画布、连接卡片、编辑和删除；菜单项右侧会标注对应快捷键
- **画布右键菜单** — 在画布空白处右键，可创建空白卡片、创建文本、创建标题、创建分区
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
- **软件更新** — 下载更新时可在侧栏或设置中手动停止，之后继续下载会自动从已完成进度恢复

### 云同步

应用**始终优先展示本地数据**；配置同步后端后，保存会快速上传本地改动，后台每隔一段时间检查远端更新。如果云端数据会覆盖大量本地内容，会**暂停自动同步并要求你确认**后再继续。同步状态（待同步 / 同步中 / 已同步 / 失败）常驻左侧菜单底部。

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
