# 组件、复用与开发

Studio 使用 React 19、Base UI、本地 shadcn base-nova/9ui 组件、Tailwind 4、Lucide 和 Geist。原生 DOM 与 React 共同构成正式界面，二者复用语义令牌与按钮 variants。实际依赖版本由清单和锁文件维护。

## 三层职责

| 层级 | 内容 | 责任 |
|---|---|---|
| 令牌与基元 | 语义主题、Button、Menu、Dialog、Input、Tabs 等 | 本地组件维护尺寸、variants、状态、焦点与 Portal |
| 工作台组合 | StudioChrome、DockWorkspace、文档 Tabs、树、Inspector、搜索与对象菜单 | 管理分区与视图，接受所属数据与回调，复用真实状态 |
| 领域视图 | 创作、素材、页面、制作、插件、发行 | 保留 schema、事务、身份、保存及生命周期 |

开发者先扩展已有等价组件。新的复合表现以至少两个真实消费者、相同状态及语义为依据，业务状态继续由所属模块拥有。原生区域通过公共复杂弹层承接交互，按钮直接复用共同 variants；组件归属保持稳定。

TanStack Table 负责语义表格，ReactFlow 负责既有关系图，Monaco 负责源码。开发者以实际问题决定局部组合，维护已有焦点、Portal 和依赖边界。第三方源码及字体保留[来源和许可](../../THIRD_PARTY_NOTICES.md)。

## 当前控件选择

| 控件 | 正式实现与适用范围 | 行为 |
|---|---|---|
| 颜色 | `components/editor-fields/StudioColorField.tsx`，基于 Dice Base Color Picker 的本地组合 | 会话内预览，确认一次事务，Esc 恢复；背景 RGB 保持不透明，页面底色/组件文字按字段支持 alpha |
| 数值 | `StudioNumberField.tsx`，coss/Base UI NumberField 与 ScrubArea 组合 | 精确输入、单位、范围、步长、可取消拖动；按字段提供步进按钮 |
| 项目对象 | `ProjectObjectPicker.tsx`，coss Combobox 与本地对象行 | 项目对象可搜索，目录给出稳定身份、类型、路径、版本及可选条件；固定枚举使用 Select |
| 素材选择器 | `authoring/asset-picker.ts`，共用 M04 查询、精确版本及预览 | 已有结果可导入；本次成功项临时浏览后返回原现场，明确应用才提交原字段；取消或失败保留绑定与选择 |
| 场景/章节树 | `components/workbench/SceneTree.tsx`，React Arborist 4.0.1 | 受控数据、虚拟行、多选、移动和领域约束；方向键焦点、Enter 激活按工作台规范 |
| 短反馈 Message | `components/toast.tsx` 的 StudioToaster/studioToasts，基于现有 Base UI Toast | 顶部居中、四类语义、完整可选正文及恢复动作；hover/焦点暂停、F6 进入、Shift+Tab 返回；关闭仅结束提醒 |
| 问题 | `authoring/problems.tsx`，由工作台提供诊断和恢复动作 | 分组、搜索、严重程度筛选、选择、按需详情、只读重检及本次失败的忽略/重新关注；Dock 显示待处理数，状态由所属来源维护 |

路径相对 `apps/studio/renderer/`。页面、素材、制作等树继续使用符合各自领域的现有实现，完整素材选择器继续服务固定版本等实际契约。auto 长度、专项颜色和高级参数沿所属字段实现。

Message 使用语义背景、文字和图标。success 使用绿色圆圈勾选，error 使用红色圆圈 ×，warning 使用琥珀色三角警告，info 使用主题信息色圆圈 i。消息最大宽 480px、圆角 8px，同时最多显示 3 条。Studio 工作台根据工具栏的实际高度将消息居中放在首排页签下方，其他宿主沿用距视口顶 48px 的默认位置。普通消息默认 4.5 秒，错误及带恢复动作的消息默认持续显示。来源提供稳定 ID 更新同一次反馈，显式 timeout 继续有效。计时与关闭只管理提醒，所属诊断、回执、输入及恢复由来源持有。

问题组件只管理列表呈现。工作台组合来源诊断、批次/任务摘要、检查状态与恢复动作，并按作品保存搜索、筛选、选中、滚动和忽略身份；领域提供方持有原始回执、任务修订及恢复操作。一次重检只更新相应来源。操作失败使用实际尝试身份提供「忽略本次」，内容诊断继续由有效检查更新。详细生命周期与来源分工见[问题与恢复](workbench.md#问题与恢复)。

素材选择器沿原导入回执和字段 `onApply`，本次成功项只改变选择器临时浏览范围；返回恢复原查询、tab、页码、选择、精确引用及滚动，素材库勾选独立保留。字段焦点书签使用稳定字段身份，页面背景和图片槽包含页面、组件、状态与字段；通用素材字段以稳定可访问名称定位，并以独立说明呈现当前素材。首次绑定或素材改名后，关闭选择器仍回到原字段。

素材库本批浏览由 M01 保存临时范围与原现场，M04 以可选 `AssetQuery.assetIds` 限定稳定素材身份：`undefined` 沿原范围，`[]` 返回零结果。分页与完整 ID 查询使用同一范围及索引修订保护，迟到结果只应用到仍匹配的范围。人物参考图及共同差分复用原 Picker 和字段回调；选择结果补齐所属人物的素材数据后，显式应用才追加参考图或创建/修改差分，版本选择沿原浮动与精确引用事务。具体浏览、返回及回执生命周期见[工作台规则](workbench.md#素材浏览与本批返回)。

数值输入、单位及可选步进按钮共用连续焦点框，内侧按钮保留自身键盘焦点。控件拥有者为原生 button/input 和 Base UI Trigger 标记 `data-slot` 并维护自身边框、尺寸和焦点；旧工作区 CSS 排除这些节点。页面切换后已加载样式保持组件表现。

场景树创建区位于虚拟行外；移动索引按移除前插入位置解释，领域计划转换为最终顺序。跨章移动将项目列表和场景 `chapterId` 合为一次 M02 事务。

## 领域组合

指令创建面板表明所需字段。在作者需要判断取值时，说明新建初值或继承来源。应用前使用共享创建规则和所属提供方验证，失败时让作者回到具体字段并保留本次输入。

| 区域 | 组合规则 |
|---|---|
| 工具栏 | 当前对象/模式、高频动作、主动作/溢出分组；保存状态使用文字及 dirty 标记 |
| Inspector | 对象/数量→常用内容→布局/外观→专项/高级；适用字段来自真实 schema |
| 素材 | 目录、底部素材库、素材属性与中央预览各有独立入口；浏览保留主选中和跨页勾选；缩略图 contain，预览使用精确租约 |
| 角色 | 目录与人物引用复用同一稳定 ID 文档；资料文本和参考图优先，默认演出独立收纳，保存主动作持续可达；当前输入与旧草稿按人物隔离，整图共同差分及属性使用同一素材与版本身份 |
| 页面 | 独立页面目录与跟随中央页面的大纲；树、画布、标题和选框读取同一选区，跨页组件 ID 限制到当前页 |
| 动画 | 真实 MiniStage、当前帧属性、播放与时间轴；独立工位临时目标/播放头归 M01，可复用轨道归动画素材 |
| 声音 | 真实解码波形、秒单位与精确素材租约；预览保持工作内容，确认由所属事务提交 |
| 制作新建 | Base UI Popover/Command，360px 宽、视口避让、列表最大 360px/60vh；公开目录分组和搜索，选择进入草稿 |
| 制作任务 | 独立制作记录工具只浏览草稿和任务；中央同一任务展示输入、参数、发送材料、进度、候选比较与采用，来源可返回 |
| 插件 | 用途、名称、精确版本与作品状态在前，贡献键可展开复制；启停/切换进入持续影响审阅 |
| 发行 | 待验证清单最大 240px、诊断最大 280px 独立滚动；检查/构建置于文档滚动外，通知按实际操作区避让 |
| 本机服务 | 明确停止说明恢复与中断影响；路径选择提供输入、目录列表、上级和持续可见的选择/取消 |
| 移动工具 | 先显示目标和产物，再显示检测、位置、许可和准备状态；实际下载进度与取消使用公共 Progress/Field/Modal |

动画预设按反应、待机、移动、出入场及强调组织，应用前显示参数和结束状态；采用后成为普通轨道或指令。重复出场按对象身份合并目标，来源继续可定位；未确认或来源不匹配的预览显示实际状态。AI 动画区分新建、局部修改和整体重做，显示轨道/时间范围及删除授权。

模板选择显示真实 Player 和影响摘要，保留项按页面、组件、字段命名。ComfyUI 图展示 API 拓扑，图的浏览与定位保持工作流版本；绑定按实际用途和类型筛选。作品语言、制作方案、提示规则与连接分别按领域编辑，保存配置与发送请求分别操作。

## Storybook 与有效验证

Story 装配产品组件或 renderer、夹具、服务适配器及初始状态，业务规则由所属实现承担。公共组件提供最小 Components Story，实际页面直接复用；完整流程和单组件分别表达自己的覆盖范围。普通公开仓检出可以构建，私有输入和本机参考材料保持为可选审核资料。

### 审核与晋升

所有用户可见 UI 调整，包括小文案、间距、颜色和组件参数，先在受影响 Story 展示并取得用户确认，再承接为正式基线。常规调整直接使用对应 Components/Product Story；缺少可表达该变化的 Story 时补齐最小场景。新工作流或重大重构在独立 Review 提供可连续操作的完整流程、关键单页及适用失败状态。

本地可以修改同一份共享实现供预览，Components/Product 分类说明实现归属，当前工作树预览仍可能含待确认改动。负责人记录用户确认的入口和变更范围；确认后的新增可见调整继续展示确认。整合与交付时核对共用规范、实际产品和正式 Story 三方一致，确认只覆盖本次受影响内容。

Review 的完整流程、单页和失败状态共用一份 UI 与交互状态。候选组件及 Portal 限定作用域；内存作品、确定性生成或磁盘替身明确标注。体验审核通过后，负责人将同一份实现接入实际宿主，验证受影响的保存、运行及服务链路，并复核接入后的密度、焦点、滚动和连续操作。随后更新正式组件与 Product Story，保留正式完整流程回归入口，删除候选身份、重复业务副本和失去消费者的专用夹具或测试。

通用 Review 机制长期用于后续设计任务，每项活动候选按主题组织。完成晋升的旧候选退出活动入口，历史由对应提交和记录承接。产品内 M10 的素材候选、候选预览资料域和发行候选继续使用各自业务含义。

### 注册与命名

开发者新增 Story 时采用下列约定；修改现有 Story 时，按本次工作需要整理其位置和命名。表中路径相对 `apps/studio/renderer/`。

| 项目 | 约定 |
|---|---|
| 单组件、单页面 | 开发者优先将 Story 放在所属实现附近，沿用实现文件名并加 `.stories.tsx`，例如 `code-block.tsx` 对应 `code-block.stories.tsx` |
| 共享与组合场景 | 开发者将共享夹具、工作区及跨域组合场景放在 `stories/`，按所展示的场景命名 Story 文件 |
| 文件与场景命名 | Story 文件使用 `<组件或场景名>.stories.tsx`；开发者用具名导出区分状态或场景，例如 `ReadOnly`、`ApplyFailure`、`Reading` |
| 侧栏分类 | 开发者显式填写 `meta.title`：通用控件使用 `Components/...`，Studio 业务使用 `Product/Studio/...`，Player 相关场景使用 `Product/Player/...`；开发者按展示内容选择类别，并复用所属领域的已有分组 |
| 审核场景 | 活动审核使用 `Review/Studio/<主题>/...`，审核故事集中在 `stories/review/`；实现放在可正式复用的组件或工作区模块 |
| 正式命名与引用 | 新增、迁入和受影响正式 Story 的文件名、标题分段、导出与显示名用英文，内容夹具保留所需语言；优先沿用有效 ID，变更 ID 时同步脚本和引用 |

现有示例提供以下写法：

- [code-block.stories.tsx](../../apps/studio/renderer/components/code-block.stories.tsx) 使用 `Components/Code details`，以 `LongIndex`、`ReadOnly`、`Dusk` 展示控件内容、状态和主题。
- [Projects.stories.tsx](../../apps/studio/renderer/pages/Projects/Projects.stories.tsx) 使用 `Product/Studio/Projects/Project center`，以 `Library`、`Workbench` 展示项目中心场景。
- [Notifications.stories.tsx](../../apps/studio/renderer/stories/Notifications.stories.tsx) 使用 `Product/Studio/Workbench/Notifications`，以已确认的 `LocalModel`、`AuthoringResults`、`SaveRecovery` 及各自 `Dusk` 场景维护通知、问题定位和保存恢复基线；场景装配真实 renderer 与内存服务。
- [Problems.stories.tsx](../../apps/studio/renderer/stories/Problems.stories.tsx) 使用 `Product/Studio/Workbench/Problems`，以已确认的 `ImportRecovery`、`ProductionRecovery`、`BuildRecovery` 及各自 `Dark` 场景维护原批次/任务/构建回执恢复、忽略与只读重检；保留 `review-studio-ux-refinement-problems--…` 的稳定 Story ID。场景装配真实 renderer，内存服务及重开夹具承接可控回执，磁盘、远端服务和真实构建沿实际宿主验证。
- [ReadRecovery.stories.tsx](../../apps/studio/renderer/stories/ReadRecovery.stories.tsx) 使用 `Product/Studio/Workbench/Read Recovery`，以已确认的 `FailedReads`、`FailedReadsDark` 保留来源读取失败、旧批次待复查及只读重检恢复场景；沿用 `review-studio-uxf02-read-recovery--failed-reads{-dark}` ID，夹具按钮只控制服务读取结果。
- [WorkflowRecovery.stories.tsx](../../apps/studio/renderer/stories/WorkflowRecovery.stories.tsx) 使用 `Product/Studio/Workbench/Workflow Recovery`，以已确认的 `RetainedWorkflow`、`RetainedWorkflowDark` 维护「查看连接与工作流」返回原配置、保留名称/模型族/待导入原文及原 Issue 的场景；沿用 `review-studio-ux-refinement-workflow-recovery--retained-workflow{-dark}` ID。真实 renderer 与内存服务确认恢复入口和调用边界，磁盘写入与外部服务沿实际宿主验证。
- [Characters.stories.tsx](../../apps/studio/renderer/stories/Characters.stories.tsx) 使用 `Product/Studio/Workbench/Characters`，以已确认的 `ReferenceReturn`、`ProfileOrganization`、`CurrentSaveScope`、`LegacyDraftRecovery` 及各自 `Dusk` 场景维护引用往返、资料组织、目标级保存和旧聚合输入恢复，保留 `review-studio-uxf03-characters--` 前缀及原 slug。场景复用真实 renderer、人物编辑器和编辑事务；内存保存及恢复夹具只证明所装配交互和调用范围，磁盘冷重开与实际宿主沿所属验证记录。
- [CharacterRecoveryRefinement.stories.tsx](../../apps/studio/renderer/stories/CharacterRecoveryRefinement.stories.tsx) 使用 `Product/Studio/Workbench/Character Recovery`，维护独立人物冷恢复、尚未创建人物保留关闭后同 ID 重开、其他来源恢复及空旧入口目录场景；保留 `review-studio-uxf03-character-recovery--` 前缀和六条原 ID。真实 renderer、人物表单和编辑事务配合内存重挂载夹具，实际进程与磁盘冷恢复按所属宿主结果说明。
- [CurrentOrdinarySaveRefinement.stories.tsx](../../apps/studio/renderer/stories/CurrentOrdinarySaveRefinement.stories.tsx) 使用 `Product/Studio/Workbench/Current Ordinary Save`，维护作品语言/姓名、启动普通及序列数值的有效输入保存与非法输入保留，以及无玩家视角人物的目录指引；保留 `review-studio-uxf03-current-ordinary-save--` 前缀和五条原 ID。场景使用真实资料编辑器、Dock 和编辑事务，内存保存审阅与磁盘结果分别说明。
- [AssetPickerRefinement.stories.tsx](../../apps/studio/renderer/stories/AssetPickerRefinement.stories.tsx) 使用 `Product/Studio/Workbench/Asset Picker`，维护已有结果导入、本次成功临时浏览与返回、显式选择应用，以及取消/失败保留精确绑定的四条浅色/暮色流程；保留 `review-studio-uxf04-asset-picker--` 前缀和原 slug。真实 Picker 与字段 `onApply` 配合受控导入回执，磁盘导入及原生文件选择另由所属环境验证。
- [AssetBrowserRefinement.stories.tsx](../../apps/studio/renderer/stories/AssetBrowserRefinement.stories.tsx) 使用 `Product/Studio/Workbench/Asset Browser`，维护 `batch-return`、`preview-and-focus` 及各自 `-dusk`，保留 `review-studio-uxf04-asset-browser--` 前缀。真实 renderer、Dock 和编辑事务配合受控查询及原批回执，覆盖本批返回、剩余项重试、行双击预览与聚焦/还原；真实磁盘和宿主路径另行记录。
- [CharacterAssetFieldsRefinement.stories.tsx](../../apps/studio/renderer/stories/CharacterAssetFieldsRefinement.stories.tsx) 使用 `Product/Studio/Workbench/Character Asset Fields`，维护 `reference-images`、`shared-difference-version` 及各自 `-dusk`，另含 `empty-difference-import`，保留 `review-studio-uxf04-character-asset-fields--` 前缀。真实人物字段、Picker 和原编辑事务覆盖显式追加/创建、取消保留及浮动/精确版本；服务夹具控制素材查询、预览和导入回执。
- [Player.stories.tsx](../../apps/studio/renderer/stories/Player.stories.tsx) 使用 `Product/Player/Pages`，以 `Title`、`Reading`、`Save` 展示作品页面。

[默认配置](../../apps/studio/.storybook/main.ts)只注册 Components/Product；[Review 配置](../../apps/studio/.storybook/review/main.ts)使用独立入口加载审核场景与显式本机扩展。旧组件比较属于 Review/History。正式预览和构建不依赖本机 Review 配置。实际命令见[开发说明](../development.md#开发服务与调试)。

### 验证边界

Storybook 证明所装配界面和交互。整机 Story 复用真实产品 renderer 时，其服务仍可能使用内存替身；负责人分别标明真实组件、受控交互、不可用端口和需要实际宿主的能力。生产磁盘、原生进程、外部服务和独立 Player 使用对应真实环境验证。

开发者按变化选择主题、语言、窄窗、长文本、错误和只读状态。实屏比较记录相同任务、内容、主题与实际 CSS 视口，通常使用 1440×900 和 900×768，影响最大化或宽度上限时补 1920×1080。焦点、拖动和滚动检查真实浏览器；注册和组装变化检查对应构建。测试归所属源码附近，跨实际应用场景归 `tests/e2e/`；具体入口见[测试说明](../testing.md)。

UI 交付说明实际变化和观察。用户可见操作改变时，同步网站唯一手册正文及实际关联源图。新规则写入本组当前规范，组件来源在第三方声明或源码所属说明维护。
