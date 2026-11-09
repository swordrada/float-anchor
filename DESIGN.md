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
  brandBlue: "#159ed3"
  brandWhite: "#ffffff"
  brandMarine: "#263746"
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
白板沿用灰白工作空间；即刻窗口像桌边的一页便签。品牌以两层海浪组成 F，表达自由流动的思考；以用户补充的 FloatAnchor / Let thoughts flow. 参考图为轮廓依据。浅色 Logo 使用纯白底与微光海蓝 F；深色保留相同海蓝图形，底板切换为深海蓝。即刻窗口保留宋体标题、纸色、绿色动作及纸飞机按钮。

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

品牌浅色底板为纯白 #ffffff，F 的海蓝渐变依次使用 #22addb / #159ed3 / #168fc8 / #168bc5。沿两层海浪方向叠加低透明度柔和水光，并裁切在原有 F 轮廓内；不增加动画。以上定义由 `public/float-anchor-logo.svg` 持有。深色派生图标仅将底板切换为深海蓝 #263746，延续既有深色背景适配。品牌色不替代交互状态色。即刻窗口浅色 Logo 投影使用主海蓝的 16% 透明度，深色使用低透明度黑色。

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

### Sections
点击分区标题显示外观工具栏；Shift / ⌘ / Ctrl 点击标题可多选。背景、边框颜色、实线/虚线分别调整，提供八个预设色与自定义三位/六位十六进制色值；多选不同值显示“混合”。无效颜色禁用应用，Esc 关闭色板并返回触发按钮。老分区默认沿用原背景色、同色虚线边框；改背景时保留原边框色。修改仅保存到选中分区。

分区最佳大小可通过工具栏、右键菜单或 F 触发。先挂载并测量所有成员（含屏幕外卡片），等待图片加载，沿用单卡规则保留宽度、按内容调整高度；再保持原有列与上下顺序，以共用的 12px 磁吸间距紧凑排布；最后按四周 24px、顶部另留 36px 标题空间收紧分区。卡片与分区在同一次状态更新中提交。带连线的卡片参与整理，连线随坐标更新；测量失败不提交部分布局并显示可重试提示。手动整理结束后清除成员的即刻自动排布标记，重复执行不漂移。

### Forms and overlays
RichEditor 为共用富文本编辑器。已有白板/分区选择器继续使用原生 select：桌面系统负责展开菜单与键盘交互，当前需求无自定义弹层几何要求。新增状态提示为非模态区域。新建命名表单使用 trim 校验和禁用提交，不弹出浏览器校验气泡。

### Embedded video
视频在阅读与编辑中共用 `YouTubePreview`，仅显示 16:9 画面，去掉链接文字、外框和底部操作栏。播放入口位于画面中央；放大、停止和编辑时的删除位于画面内，悬停、键盘焦点或触摸设备上可见。播放器不足 200 × 200 时使用应用内放大弹窗，保留画面比例，不通过黑色补边撑高卡片。媒体选中与焦点沿用 `--accent`，失败文案沿用 `--text-secondary`。

`RichEditor` 使用 `YouTubeEmbed` 独立块承载视频，沿用 Markdown 链接保存原地址、标签和起播时间，兼容已有笔记与同步。视频下方行首按 Backspace、上方行尾按 Delete 或选择视频后删除，均只移除视频并保留周围文字；删除是独立的撤销步骤，⌘Z / Ctrl+Z 恢复完整视频，重做可再次删除。末尾视频保留可继续输入的段落；输入法组合期间不触发删除。以上为白板、每日记与即刻窗口的共用行为。

### Iconography
Logo 的轮廓源文件为 `public/float-anchor-logo.svg`。两层海浪组成 F，由用户提供的参考图自动描摹为两块矢量轮廓。1.0.26 使用用户确认的纯白底、微光海蓝版本，深浅渐变与柔和反光沿海浪方向展开。1024 × 1024 画布的图标底板四边留白 64，底板圆角 210；保留两层海浪间的留白，确保 16px / 24px 下可区分。主题切换保留几何形状与水光，仅切换底板配色。

侧栏与即刻窗口共用 `BrandLogo`，根据主题切换 SVG 并同步 favicon。README 与桌面安装图标使用纯白底微光海蓝版本。运行 `python3 scripts/gen-icon.py` 从同一源文件派生 `public/float-anchor-logo-dark.svg`，并生成 `build/icon.png`、macOS `build/icon.icns` 与 Windows `build/icon.ico`，以及各尺寸 iconset；不要单独修改派生资源。应用已有闪电路径继续复用。新增 icon-only 动作必须有中文 accessible name。

### Motion
沿用短 hover 反馈与白板定位动画；新增即刻反馈遵循 prefers-reduced-motion，不为保存状态增加装饰动画。

### Content and data visualization
用“继续补充”“最近笔记”“已保存到本机”说明动作及结果。不把本地保存描述为云端同步。侧栏“已保存·待同步”表示本地落盘、等待五分钟批量同步；只有双方内容核对完成后显示“已同步”。同步冲突沿用设置中的决策入口。正常关闭前暂时停止输入，先确认本地保存，再限时尝试远端同步；本地保存失败恢复编辑并说明原因。时间按 zh-CN 展示。

## Do's and Don'ts
- Do: 复用原笔记 ID，保留卡片坐标、尺寸、分区和连线。
- Do: 新建草稿独立暂存；跨窗口保存合并不同卡片的改动。
- Don't: 把继续编辑做成迁移或复制；不要修改归属来进入即刻模式。
- Don't: 保存失败后清空输入、关窗或悄悄覆盖冲突版本。
