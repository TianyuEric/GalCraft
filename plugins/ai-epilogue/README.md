# AI 后日谈作者配置插件

本包目前提供 Studio 作者配置和上下文预览，包括独立工作台、插件页入口和许可上下文预览弹窗。作者配置通过 M02 统一应用、撤销和保存。Player互动生成、轮次保存和恢复归入Backlog；当前支持范围见[运行与发行](../../docs/reference/runtime-and-publishing.md)。

在仓库根目录执行 `pnpm --filter @galcraft/ai-epilogue build`。当前包保持 0.1.0，使用清单 2 和引擎范围 `^0.1.0`，分别交付无 DOM 的 `definition/index.js` 与 Studio `editor/index.js`；Player 不接收作者配置编辑入口。在 Studio“插件 → 安装插件”中输入本包 `package` 的绝对路径，检查、安装、查看影响并确认启用。本机开发可通过普通安装刷新同版本产物，作品保留精确 Lock；导航“扩展 → AI 后日谈”提供作者配置；先在角色资料中设置个人路线主角色与个人结局。

作者填写许可角色设定、起点、事实、互动范围、结束条件，选择个人路线结局与素材白名单；预览发送范围后确认配置，并使用“保存全部”。插件不自动发送全局角色描述，预览不发请求。停用保留作品配置，重新启用恢复入口。

插件 SDK 边界见[插件接口](../../docs/reference/plugins.md)。类型检查使用 `pnpm exec tsc --noEmit -p plugins/ai-epilogue/tsconfig.json`；配置测试使用 `pnpm exec vitest run plugins/ai-epilogue/src/ai-epilogue.test.ts`。
