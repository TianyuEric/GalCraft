# 组件、复用与开发

Studio 使用 React 19、Base UI、本地 shadcn base-nova/9ui 组件、Tailwind 4、Lucide 和 Geist。原生 DOM 与 React 共同构成正式界面，二者复用语义令牌与按钮 variants。实际依赖版本由清单和锁文件维护。

## 三层职责

| 层级 | 内容 | 责任 |
|---|---|---|
| 令牌与基元 | 语义主题、Button、Menu、Dialog、Input、Tabs 等 | 本地组件维护尺寸、variants、状态、焦点与 Portal |
| 工作台组合 | Shell、文档 Tabs、树、工具栏、Inspector、搜索与对象菜单 | 接受所属数据与回调，复用真实状态 |
| 领域视图 | 创作、素材、页面、制作、插件、发行 | 保留 schema、事务、身份、保存及生命周期 |

开发者先扩展已有等价组件。新的复合表现以至少两个真实消费者、相同状态及语义为依据，业务状态继续由所属模块拥有。原生区域通过公共复杂弹层承接交互，按钮直接复用共同 variants；组件归属保持稳定。

TanStack Table 负责语义表格，ReactFlow 负责既有关系图，Monaco 负责源码。开发者以实际问题决定局部组合，维护已有焦点、Portal 和依赖边界。第三方源码及字体保留[来源和许可](../../THIRD_PARTY_NOTICES.md)。

## 当前控件选择

| 控件 | 正式实现与适用范围 | 行为 |
|---|---|---|
| 颜色 | `components/editor-fields/StudioColorField.tsx`，基于 Dice Base Color Picker 的本地组合 | 会话内预览，确认一次事务，Esc 恢复；背景 RGB 保持不透明，页面底色/组件文字按字段支持 alpha |
| 数值 | `StudioNumberField.tsx`，coss/Base UI NumberField 与 ScrubArea 组合 | 精确输入、单位、范围、步长、可取消拖动；按字段提供步进按钮 |
| 项目对象 | `ProjectObjectPicker.tsx`，coss Combobox 与本地对象行 | 项目对象可搜索，目录给出稳定身份、类型、路径、版本及可选条件；固定枚举使用 Select |
| 场景/章节树 | `components/workbench/SceneTree.tsx`，React Arborist 4.0.1 | 受控数据、虚拟行、多选、移动和领域约束；方向键焦点、Enter 激活按工作台规范 |

路径相对 `apps/studio/renderer/`。页面、素材、制作等树继续使用符合各自领域的现有实现，完整素材选择器继续服务固定版本等实际契约。auto 长度、专项颜色和高级参数沿所属字段实现。

数值输入、单位及可选步进按钮共用连续焦点框，内侧按钮保留自身键盘焦点。控件拥有者为原生 button/input 和 Base UI Trigger 标记 `data-slot` 并维护自身边框、尺寸和焦点；旧工作区 CSS 排除这些节点。页面切换后已加载样式保持组件表现。

场景树创建区位于虚拟行外；移动索引按移除前插入位置解释，领域计划转换为最终顺序。跨章移动将项目列表和场景 `chapterId` 合为一次 M02 事务。

## 领域组合

| 区域 | 组合规则 |
|---|---|
| 工具栏 | 当前对象/模式、高频动作、主动作/溢出分组；保存状态使用文字及 dirty 标记 |
| Inspector | 对象/数量→常用内容→布局/外观→专项/高级；适用字段来自真实 schema |
| 素材 | 图片等比 contain 缩略图，音频紧凑行显示真实元数据；预览使用精确租约 |
| 角色 | Explorer 直接显示角色搜索/列表，差分并排真实缩略图，预览与属性使用同一素材身份 |
| 页面 | 树、画布、标题和选框读取同一选区；跨页组件 ID 先限制到当前页；常用数值与 alpha 颜色使用共享字段 |
| 动画 | 真实 MiniStage、当前帧属性、播放与时间轴；独立工位临时目标/播放头归 M01，可复用轨道归动画素材 |
| 声音 | 真实解码波形、秒单位与精确素材租约；预览保持工作内容，确认由所属事务提交 |
| 制作新建 | Base UI Popover/Command，360px 宽、视口避让、列表最大 360px/60vh；公开目录分组和搜索，选择进入草稿 |
| 插件 | 用途、名称、精确版本与作品状态在前，贡献键可展开复制；启停/切换进入持续影响审阅 |
| 发行 | 待验证清单最大 240px、诊断最大 280px 独立滚动；检查/构建置于文档滚动外，通知按实际操作区避让 |
| 本机服务 | 明确停止说明恢复与中断影响；路径选择提供输入、目录列表、上级和持续可见的选择/取消 |
| 移动工具 | 先显示目标和产物，再显示检测、位置、许可和准备状态；实际下载进度与取消使用公共 Progress/Field/Modal |

动画预设按反应、待机、移动、出入场及强调组织，应用前显示参数和结束状态；采用后成为普通轨道或指令。重复出场按对象身份合并目标，来源继续可定位；未确认或来源不匹配的预览显示实际状态。AI 动画区分新建、局部修改和整体重做，显示轨道/时间范围及删除授权。

模板选择显示真实 Player 和影响摘要，保留项按页面、组件、字段命名。ComfyUI 图展示 API 拓扑，图的浏览与定位保持工作流版本；绑定按实际用途和类型筛选。作品语言、制作方案、提示规则与连接分别按领域编辑，保存配置与发送请求分别操作。

## Storybook 与有效验证

公共组件先提供最小真实 Story，业务页面直接消费同一实现。全页 Story 和独立组件 Story 分别说明各自表现；模拟数据明确作为夹具。生产磁盘、原生进程、外部服务和独立 Player 结论使用对应真实环境。

开发者新增 Story 时采用下列约定；修改现有 Story 时，按本次工作需要整理其位置和命名。表中路径相对 `apps/studio/renderer/`。

| 项目 | 约定 |
|---|---|
| 单组件、单页面 | 开发者优先将 Story 放在所属实现附近，沿用实现文件名并加 `.stories.tsx`，例如 `code-block.tsx` 对应 `code-block.stories.tsx` |
| 共享与组合场景 | 开发者将共享夹具、工作区及跨域组合场景放在 `stories/`，按所展示的场景命名 Story 文件 |
| 文件与场景命名 | Story 文件使用 `<组件或场景名>.stories.tsx`；开发者用具名导出区分状态或场景，例如 `ReadOnly`、`ApplyFailure`、`Reading` |
| 侧栏分类 | 开发者显式填写 `meta.title`：通用控件使用 `Components/...`，Studio 业务使用 `Product/Studio/...`，Player 相关场景使用 `Product/Player/...`；开发者按展示内容选择类别，并复用所属领域的已有分组 |

现有示例提供以下写法：

- [code-block.stories.tsx](../../apps/studio/renderer/components/code-block.stories.tsx) 使用 `Components/Code details`，以 `LongIndex`、`ReadOnly`、`Dusk` 展示控件内容、状态和主题。
- [Projects.stories.tsx](../../apps/studio/renderer/pages/Projects/Projects.stories.tsx) 使用 `Product/Studio/Projects/Project center`，以 `Library`、`Workbench` 展示项目中心场景。
- [Player.stories.tsx](../../apps/studio/renderer/stories/Player.stories.tsx) 使用 `Product/Player/Pages`，以 `Title`、`Reading`、`Save` 展示作品页面。

[Storybook 配置](../../apps/studio/.storybook/main.ts)定义正式注册范围。`stories/candidates/` 保留组件方案比较样例，当前配置排除其中的 `PropertyComparison`、`TreeComparison`。启动与构建命令见[开发说明](../development.md#开发服务与调试)。

开发者围绕本次变化选择有效状态：样式检查受影响 Story/页面；焦点、拖动和滚动检查真实浏览器；磁盘和宿主生命周期检查 Electron/本机服务；注册、组装和构建路径变化检查相应构建。主题、语言、窄窗、长文本、错误和只读样例用于暴露实际差异，按影响选择。

UI 交付说明实际变化和观察。用户可见操作改变时，同步网站唯一手册正文及实际关联源图。新规则写入本组当前规范，组件来源在第三方声明或源码所属说明维护。
