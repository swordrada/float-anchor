---
version: alpha
name: FloatAnchor
description: 自由白板与纸感即刻记录窗口，帮助用户随时记录和继续思考。
colors:
  primary: "#2c2c2c"
  background: "#f2f2f2"
  card: "#ffffff"
  capture: "#3b8f78"
  captureSoft: "#e2f1ea"
  paper: "#f8f7f2"
  danger: "#e55c5c"
typography:
  sans:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, Helvetica Neue, Arial, sans-serif"
  mono:
    fontFamily: "SF Mono, Fira Code, Cascadia Code, Menlo, monospace"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  instant-padding: "17px 22px 18px"
components:
  card: {}
  button: {}
  editor: {}
  recentNotes: {}
---

# FloatAnchor Design System

## Overview

### Creative North Star
白板沿用灰白工作空间；即刻窗口像桌边的一页便签。沿用既有 logo、宋体标题、纸色、绿色动作及纸飞机按钮。

### Product context and register
- Audience and primary job: 个人笔记用户，快速记录、组织卡片、重新打开原笔记继续补充。
- Target market evidence: 未定义地域市场；本次依据用户反馈和当前应用设计。
- Locale: 当前产品界面为中文，保留 FloatAnchor 品牌和 Markdown 技术名。
- Usage: macOS / Windows 桌面白板，以及默认 430 × 560 的可调整即刻窗口。
- Register: 功能产品；保留既有低干扰布局。
- Signature: 卡片右上角的闪电把白板连接到纸感即刻窗口。
- Restraint: 不改变白板卡片布局；状态文字明确区分本地保存和云同步。
- Anti-references: 营销落地页、宽大仪表盘、大面积高饱和背景均不适合本次增量功能。
- Token owner: `src/index.css` 是实际来源。本文件记录既有 tokens，不生成 CSS。`--capture-accent/soft` 供即刻窗口和编辑状态使用；卡片闪电复用 `.card-banner-btn` 中性样式。

## Colors
白板使用 --bg / --card-bg / --text-primary。即时操作使用 capture / captureSoft；不可复用为普通白板蓝色选中态。深色分别使用 #66b69c / #203b34；即刻纸色为 #1b1c20。错误使用 --danger；焦点有可见 outline。

## Typography
正文和控件使用 --font 中文系统字体；快捷键使用 --mono。即刻卡片标题沿用 Songti SC / STSong / Noto Serif CJK SC 回退。保留既有控件密度，不为新增操作扩大整卡。

## Layout
卡片右上角的闪电、编辑、删除统一使用 20px 按钮、12px 图标、2px 描边并垂直居中。三个按钮默认一同隐藏，卡片悬停或操作组获得键盘焦点时一同显示；闪电沿用中性灰色和通用 hover，提示方式与另两个按钮一致。即刻窗口沿用顶部系统动作、品牌、编辑区与底部提交。新增笔记切换行；编辑已有笔记时以只读位置替代新笔记的目标选择器。小窗口允许内容区纵向滚动，编辑器内部负责正文滚动。

## Elevation & Depth
沿用卡片阴影和即刻窗口既有边框、纸面背景、柔和投影。最近笔记替换编辑区，不增加遮挡正文的悬浮层。

## Shapes
共用既有 6 / 10 / 14px 圆角。即刻窗口延续 15px 外框和 13px 编辑器圆角；新控件沿用同级控件的形状。

## Components

### Foundational visual states
闪电包含 hover、键盘焦点、打开中与失败提示。编辑器包含已保存到本机、保存中、待保存、保存失败。切换时暂时只读，失败保留输入并提供重试或另存。

### Buttons and actions
闪电标签为“在即刻模式中编辑：标题”；完成编辑保存并回到新建草稿。新建提交仍为“投入白板”，已有笔记不重复创建卡片。删除保留既有行为；原卡片删除后续写会转为可恢复的失败状态。

### Navigation and data display
最近笔记按最近打开排序，按 cardId 去重，最多 10 条；标题、摘要和所在白板/分区帮助识别。“在白板中查看”恢复主窗口并定位原卡片。

### Forms and overlays
RichEditor 为共用富文本编辑器。已有白板/分区选择器继续使用原生 select：桌面系统负责展开菜单与键盘交互，当前需求无自定义弹层几何要求。新增状态提示为非模态区域。新建命名表单使用 trim 校验和禁用提交，不弹出浏览器校验气泡。

### Iconography
复用应用已有闪电 SVG 路径和 logo 资产。新增 icon-only 动作必须有中文 accessible name。既有富文本工具栏图标不在本次替换范围。

### Motion
沿用短 hover 反馈与白板定位动画；新增即刻反馈遵循 prefers-reduced-motion，不为保存状态增加装饰动画。

### Content and data visualization
用“继续补充”“最近笔记”“已保存到本机”说明动作及结果。不把本地保存描述为云端同步。侧栏“已保存·待同步”表示本地落盘、等待五分钟批量同步；只有双方内容核对完成后显示“已同步”。同步冲突沿用设置中的决策入口。正常关闭前暂时停止输入，先确认本地保存，再限时尝试远端同步；本地保存失败恢复编辑并说明原因。时间按 zh-CN 展示。

## Do's and Don'ts
- Do: 复用原笔记 ID，保留卡片坐标、尺寸、分区和连线。
- Do: 新建草稿独立暂存；跨窗口保存合并不同卡片的改动。
- Don't: 把继续编辑做成迁移或复制；不要修改归属来进入即刻模式。
- Don't: 保存失败后清空输入、关窗或悄悄覆盖冲突版本。
