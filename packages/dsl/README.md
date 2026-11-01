# GalCraft DSL 配套 SDK

`@galcraft/dsl/parser` 公开 `parse` 及其 CST 类型，供需要读取 GalCraft 语句的作者插件使用。插件使用公开包出口，构建时将解析依赖打入自己的产物；宿主继续负责作品读写、编译与语义服务。解析结果不能代替 M02 事务校验或正式编译结论。

需要解析能力的独立插件执行 `npm install @galcraft/contracts@0.1.0 @galcraft/dsl@0.1.0 @galcraft/plugins@0.1.0`，或安装 SDK 分发中的对应 tarball，并从 `@galcraft/dsl/parser` 导入 `parse`。构建器将解析依赖纳入插件产物；普通插件按自己的实际能力选择依赖。源码开发者在仓库根执行 `pnpm --filter @galcraft/dsl build` 和 `pnpm --filter @galcraft/dsl test`，分别构建包和检查解析、编译行为。

GalCraft DSL 代码使用 **MPL-2.0**。SDK tarball 随包提供 `LICENSE`，并在 `dist/licenses/project/` 保留许可范围、第三方声明和 `LICENSES/SOURCE-CODE.md` 源码取得说明。维护者在公开发行时提供匹配版本的源码；插件作者在分发包含 DSL 实现的产物时保留相应许可和源码取得说明。
