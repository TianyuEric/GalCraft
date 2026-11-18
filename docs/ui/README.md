# UI 设计与开发

GalCraft 的 Studio 是面向连续写作、调演出、管理素材和试玩的精密工作台。界面持续说明当前编辑对象、本次动作范围、预览来源及保存结果。Player 以作品画布和阅读体验为中心。

本组文档是当前源码的共用 UI 规范唯一正文，维护设计、交互和组件开发规则。产品场景与业务状态沿所属需求和领域契约；创作者操作说明由在线手册维护。当前开发实现、用户已确认的界面基线和各次已发布产物分别标识，源码预览不代表已发行版本。

| 规范 | 内容 |
|---|---|
| [Studio 设计系统](design-system.md) | 视觉方向、字体、颜色、尺度、状态及主题边界 |
| [工作台交互](workbench.md) | 分区、工具、工作面组合、文档、来源、恢复及提交 |
| [组件与开发](components.md) | 实现层次、领域组合、Storybook 审核与正式晋升 |
| [Player 设计](player.md) | 作品画布、阅读、页面、存档及公开组件 |

M01 维护 Studio 表现和个人偏好；领域提供方维护事务、资源身份和生命周期。UI 消费真实所属状态，技术字段和完整数据格式由源码与 schema 维护。所有用户可见 UI 调整，包括文案、间距和局部样式，先在受影响 Story 展示并取得用户确认，再承接为正式基线；新工作流和重大重构使用独立 Review。具体步骤见[审核与晋升](components.md#审核与晋升)。

当前反馈基线使用浮层 Message 说明本次操作结果，底栏「问题」按作品汇总内容诊断及操作失败摘要，「输出」和所属工作面保留执行回执、失败明细与恢复动作。各来源独立更新；忽略只作用于本次操作失败，重新检查只运行已有检查和读取状态。只读原因和返回来源入口分别位于状态栏或当前场景工具栏。已确认的浅色与暮色场景复用正式 `Product/Studio/Workbench/` 下的 `Notifications`、`Problems`、`Read Recovery` 与 `Workflow Recovery` Story；问题生命周期见[工作台规则](workbench.md#问题与恢复)，服务替身与实际宿主的验证边界见[组件与开发](components.md#验证边界)。

人物基线使用稳定人物文档承接引用往返、资料优先、当前人物保存及旧聚合草稿恢复。独立人物输入按原依据恢复，其他人物保存推进版本后仍能编辑；尚未创建人物明确继续恢复后，保留关闭及目录重开沿用原 ID。当前保存先确定目标，再处理目标输入，必要联动由 M02 保存计划决定；作品设置的语言、主角姓名和启动普通数值、序列输入沿同一规则，复杂颜色与音频编辑继续明确确认。无关人物、制作与发行草稿保持原状。正式 `Product/Studio/Workbench/` 下的 `Characters`、`Character Recovery` 和 `Current Ordinary Save` 维护已确认流程，具体交互见[人物资料与引用](workbench.md#人物资料与引用)及[保存规则](workbench.md#保存错误与长内容)。

素材选择器在已有结果中继续提供导入；作者可临时查看本次成功素材，再返回素材浏览现场，明确应用后才改变字段。素材库以稳定成功 ID 浏览本批并保留原筛选、分页、勾选、主对象、版本、固定属性和滚动，重试沿原批次处理剩余失败；聚焦/还原复用 Dock，整行双击复用单素材预览。人物参考图和共同差分共用同一 Picker，显式应用后才追加或创建，保留浮动及精确版本。正式 `Product/Studio/Workbench/` 下的 `Asset Picker`、`Asset Browser` 和 `Character Asset Fields` 维护已确认流程；规则见[素材浏览与本批返回](workbench.md#素材浏览与本批返回)及[编辑与预览](workbench.md#编辑拖动与预览)。

正式 `Product/Studio/Workbench/` 的 `Command Defaults`、`Project Settings and Startup`、`Page Building` 与 `Workbench Navigation` 保留确认过的 Story 身份，覆盖结构化插入、当前保存及启动、页面模式和布局。

同目录下的 `Authoring Forms`、`Workbench Form Details`、`Production Forms` 与 `Management Forms` 延续已确认的 21 个 Story ID。它们覆盖场景开场、结构与变量、页面样式与开屏输入、制作发送计划和管理配置。

`Workbench Messages` 保留两条正式 Story，覆盖浅色与暮色下叠放消息、工作台命令和首排页签的可操作性。

产品行为见[架构](../architecture.md)及[行为参考](../reference/README.md)，创作者教程见[在线手册](https://galcraft.dev/docs/zh-CN/studio-guide/)。
