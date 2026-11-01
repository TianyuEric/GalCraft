# 共同契约

`@galcraft/contracts` 提供跨包和宿主边界的线格式类型、Zod schema、具名操作目录与测试夹具。Studio、Player、领域包和插件通过公开出口共享作品、素材、页面、制作、运行和宿主契约；各模块定义自己内部使用的执行参数与结果。

`@galcraft/contracts/fixtures` 提供作品身份、场景、素材元数据、精确依赖、快照和玩家资料等固定逻辑输入。开发者用这些夹具验证 schema 解析、JSON 往返及拒绝规则；领域包和宿主测试使用实际安装、编译、播放或磁盘事务检查对应行为。

源码开发者在仓库根执行 `pnpm --filter @galcraft/contracts build` 生成 `dist/`，执行 `pnpm --filter @galcraft/contracts test` 检查契约。插件作者执行 `npm install @galcraft/contracts@0.1.0 @galcraft/plugins@0.1.0` 独立安装 SDK，也可使用 `tools/plugin-development/distribute-sdk.mjs` 准备的 tarball，并从 `@galcraft/contracts` 导入所需类型或 schema。使用 DSL 解析器的插件另安装匹配版本的 DSL 包。普通浏览器消费者可以直接使用适合浏览器的契约出口；插件开发 CLI 的环境要求见 plugins 包说明。

GalCraft 契约代码使用 **MPL-2.0**。SDK tarball 随包提供 `LICENSE`，并在 `dist/licenses/project/` 保留许可范围、第三方声明和 `LICENSES/SOURCE-CODE.md` 源码取得说明。维护者在公开发行时提供匹配版本的源码；使用者按随包许可处理使用、修改及再分发。
