# Studio 设计系统

Studio 采用内容优先的紧凑工作台：连续剧本区、按对象组织的属性区、可辨选区和可信保存反馈。视觉顺序为当前内容与选区、文档主动作、属性和上下文、导航、技术元信息。名称先于 ID、路径和贡献键，技术信息在详情中完整查看与复制。

## 字体、密度与尺度

Studio 使用 Geist Variable，Windows 中文依次回退到 Segoe UI、Microsoft YaHei、sans-serif；Monaco 保持等宽字体。正文和输入保留可读尺度，复杂属性通过分组与渐进展开安排。

| 内容 | 字号/行高 | 字重 |
|---|---|---|
| 作品中心标题 | 22/30px | 600 |
| 文档标题 | 18/26px | 600 |
| 分区标题 | 16/24px | 600 |
| 正文、对白、输入 | 14/22px | 400 |
| 工具、字段标签 | 13/20px | 标签 500，值 400 |
| 路径、时间、快捷键 | 12/18px | 400 |

设计使用一个专业桌面密度。间距采用 4、8、12、16、24、32px；组内 4–8px、组间 12px、面板内 12px、分区间 16px。长正文、错误和保存影响自然换行；长对象名可省略，并通过 Tooltip 或详情提供全文。placeholder 提供格式或示例，Field 提供真实标签。

| 元素 | 尺寸 |
|---|---|
| 紧凑/普通/主要提交控件 | 28/32/36px 高 |
| 常用图标与行内按钮命中区 | 16px 图标；至少 28×28px 命中区 |
| 活动栏 | 宽 48px，入口 36×36px |
| 标题栏 | 高 44px |
| 文档 Tabs | 高 36px，宽 112–200px，超出横向浏览 |
| 主工具栏 | 高 40px，可加 32px 上下文行 |
| 面板标题/底部标签/状态栏 | 36/32/24px 高 |
| 树/菜单/表格行 | 最小 28/32/32px；多行自然增高 |
| Explorer/Inspector | 默认 240/320px；范围 190–360/240–480px |
| 分隔条 | 8px 命中轨道，中心 1px 线，位于自身网格轨道 |
| 圆角 | 紧凑标记 4px，控件/素材框 6px，浮层 8px，对话框 12px |

工作区拼接边采用直边。连续列表、Inspector 和工具组通过留白、表面和细分隔分层；脱离文档平面的浮层使用边框与阴影。Lucide 图标保持同一描边。舞台沿作品视觉呈现。

## 语义色与主题

`apps/studio/renderer/styles/studio-theme.css` 是 Studio 语义色唯一源，组件消费令牌。浅蓝浅色和暮蓝紫深色保持各自成对颜色。`muted-foreground` 映射到 secondary；状态通过文字、标记和图标共同表达。

| 语义 | 浅色 | 深色 |
|---|---|---|
| activity | `#F2F2F9` | `#171A2D` |
| explorer | `#FAFBFD` | `#1B2438` |
| editor/background | `#FFFFFF` | `#171E30` |
| inspector | `#F6F8FC` | `#1F283E` |
| card | `#FFFFFF` | `#202940` |
| popover | `#FFFFFF` | `#263149` |
| input | `#F1F4F8` | `#141C2D` |
| foreground | `#24364B` | `#E7EAF3` |
| foreground-secondary | `#4B6078` | `#BCC6DA` |
| foreground-tertiary | `#586B82` | `#A2AEC5` |
| foreground-disabled | `#8792A0` | `#73809B` |
| border | `#DAE1EB` | `#313D55` |
| control-border | `#78899C` | `#788CAB` |
| surface-hover | `#EDF2F8` | `#29344C` |
| selection | `#E4EFFB` | `#303C59` |
| primary 前景/背景 | `#FFFFFF` / `#2168A8` | `#201B32` / `#B6A1E7` |
| focus | `#2168A8` | `#B6A1E7` |
| error 前景/背景 | `#A8323A` / `#FBECEE` | `#F2A6AC` / `#422934` |
| warning 前景/背景 | `#80551C` / `#FBF3E6` | `#E9C485` / `#3D3426` |
| success 前景/背景 | `#216B4E` / `#EAF5EF` | `#86CCAD` / `#223C36` |

正文和关键标签目标对比度至少 4.5:1，识别交互所必需的边界、状态和焦点与相邻表面目标至少 3:1。disabled 表示真实不可交互内容，原因使用正常对比说明；只读内容保持可读和可复制。实际 CSS、透明度、继承、Portal 和系统字体由实际消费者检查。

Studio 主题仅覆盖 Studio 根及所属 Portal。Player、Monaco 和插件贡献 DOM 使用自己的作用域；M01 保存 Studio 明暗偏好，作品阅读模板继续由 M08 提供。

指令的媒体、声音和控制分类使用局部图标、标记或浅色分区，并保留文字类型名称。当前任务使用一个明确主动作；普通次动作使用轻表面或 outline，重复管理动作使用 ghost。

## 状态与动效

| 状态 | 表达规则 |
|---|---|
| hover/pressed | 使用表面变化，文本和控件位置稳定 |
| focus-visible | 2px 焦点线，通常 2px offset；布局为其保留空间 |
| selected/active | 底色加边标记或勾选，焦点可同时呈现 |
| disabled | 使用真实禁用语义，显示可访问原因 |
| read-only | 正常可读、可选择和复制，显示所属原因 |
| loading | 就地 busy 或稳定尺寸骨架，重复提交进入 pending |
| error | 字段或对象旁持续说明原因、恢复与保留输入 |
| success | 实际回执更新局部状态，必要时短 Toast |
| mixed/partial | 显示多个值及半选语义，仅提交实际编辑字段 |

hover/focus 色彩过渡 80–120ms，浮层 opacity 可用 120–160ms，排序反馈约 180–220ms。动效按实际属性限定，编辑区几何与文字输入立即响应。`prefers-reduced-motion` 使用直接定位并保留状态标记。未知进度显示不确定状态，完成反馈来自实际回执。
