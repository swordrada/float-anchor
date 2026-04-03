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
  <img src="https://img.shields.io/badge/data-100%25%20local-orange.svg" alt="Local Storage">
</p>

---

## 为什么选择 FloatAnchor？

> **完全开源** — 代码在 GitHub 公开，任何人都可以审查、修改、分发。  
> **永久免费** — 没有付费墙、没有订阅、没有增值收费，所有功能开箱即用。  
> **数据属于你** — 笔记 100% 存储在你的电脑本地，不经过任何服务器，没有账号体系，没有云同步，你的数据只有你自己能看到。  
> **无商业化** — 这是一个纯粹的个人项目，不含广告、不采集数据、不追踪用户行为。

---

## 功能特色

- **多画布管理** — 左侧导航栏创建、重命名、删除不同专题的画布
- **卡片笔记** — 在画布上自由创建卡片，支持标题 + 富文本正文
- **所见即所得编辑** — 内置 WYSIWYG 编辑器，支持标题、加粗、斜体、删除线、列表、引用、代码、链接等格式
- **自由拖拽** — 卡片可拖动到画布任意位置，右下角手柄可缩放卡片大小
- **画布导航** — 双指滑动（macOS）/ 右键拖拽（Windows）平移画布；捏合缩放（macOS）/ Ctrl+滚轮（Windows）缩放画布
- **纯本地存储** — 所有数据保存在本地，不上传任何云端，不需要注册账号

## 下载安装

前往 [Releases](https://github.com/swordrada/float-anchor/releases) 页面下载最新版本，或直接使用仓库 `release/` 目录中的安装包：

| 文件 | 平台 | 适用设备 |
|------|------|----------|
| `FloatAnchor-1.0.1-mac-arm64.dmg` | macOS | Apple Silicon (M1/M2/M3/M4) |
| `FloatAnchor-1.0.1-mac-x64.dmg` | macOS | Intel Mac |
| `FloatAnchor-1.0.1-win-setup.exe` | Windows | 64 位 Windows |

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
- **退出编辑** — 点击卡片外部区域，或按 `Esc` 键

### 画布导航

| 操作 | macOS | Windows |
|------|-------|---------|
| 平移画布 | 双指滑动触控板 | 右键按住拖拽 |
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

### 数据存储

所有笔记数据保存在本地：

- **macOS** — `~/Library/Application Support/FloatAnchor/data/`
- **Windows** — `%APPDATA%/FloatAnchor/data/`

## 从 Heptabase 迁移

如果你之前使用 Heptabase，可以一键将所有白板和卡片笔记迁移到 FloatAnchor。

### 步骤

1. 在 Heptabase 中导出备份数据（Settings → Export → Backup）
2. 解压导出的备份文件夹
3. 确保已安装 Python 3，然后运行迁移脚本：

```bash
python3 scripts/migrate-heptabase.py <备份文件夹路径>
```

例如：

```bash
python3 scripts/migrate-heptabase.py ~/Downloads/heptabase-backup
```

脚本会自动将数据写入 FloatAnchor 的本地存储路径。如果需要指定输出位置，可加 `--output` 参数：

```bash
python3 scripts/migrate-heptabase.py ~/Downloads/heptabase-backup --output ./my-data.json
```

### 迁移内容

| 项目 | 说明 |
|------|------|
| 白板（Whiteboard → Canvas） | 所有未删除的白板，保留名称 |
| 卡片笔记 | 标题、正文（Markdown 格式）、位置坐标、卡片宽高 |
| 卡片布局 | 保留原始 x/y 坐标，迁移后的画布布局与 Heptabase 中一致 |

> **注意**：迁移前请先关闭 FloatAnchor 应用，迁移完成后再打开，否则应用可能会覆盖迁移数据。

## 技术栈

Electron + React + TypeScript + Vite + TipTap + Zustand

## License

[MIT License](LICENSE) — 完全开源，自由使用、修改和分发。
