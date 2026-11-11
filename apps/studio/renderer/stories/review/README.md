# Review

Review 承载有明确用途的设计比较与按需审核，使用独立的 `pnpm storybook:review` 入口；正式组件和现行产品场景使用 `pnpm storybook`。

现有历史组件比较保留在相邻 `../candidates/`，由 Review 配置显式加载。审核生命周期、分类与晋升规则见[组件与开发协议](../../../../../docs/ui/components.md)。

本机扩展可在 Review 入口通过 `STORYBOOK_LOCAL_CONFIG` 指定 JSON 配置，其中 `stories` 路径和可选 `vite` 模块路径相对该配置文件。默认正式入口不读取此变量。扩展拥有者负责依赖与来源资料；未跟踪的 `studio-r0/baseline/` 不属于自动清理范围。
