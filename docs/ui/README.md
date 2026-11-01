# UI 设计与开发

GalCraft 的 Studio 是面向连续写作、调演出、管理素材和试玩的精密工作台。界面持续说明当前编辑对象、本次动作范围、预览来源及保存结果。Player 以作品画布和阅读体验为中心。

| 规范 | 内容 |
|---|---|
| [Studio 设计系统](design-system.md) | 视觉方向、字体、颜色、尺度、状态及主题边界 |
| [工作台交互](workbench.md) | 文档、选区、焦点、键盘、IME、预览及提交 |
| [组件与开发](components.md) | 实现层次、已选控件、领域组合及正式 Storybook |
| [Player 设计](player.md) | 作品画布、阅读、页面、存档及公开组件 |

M01 维护 Studio 表现和个人偏好；领域提供方维护事务、资源身份和生命周期。UI 消费真实所属状态，技术字段和完整数据格式由源码与 schema 维护。新共享组件先进入正式 Storybook，业务页面复用同一实现。开发者按本次影响选择组件、浏览器或真实宿主观察。

产品行为见[架构](../architecture.md)及[行为参考](../reference/README.md)，创作者教程见[在线手册](https://galcraft.dev/docs/zh-CN/studio-guide/)。
