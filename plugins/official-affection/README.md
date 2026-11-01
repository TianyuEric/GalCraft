# 好感度插件

此包是可选 SDK 示例，保留 `org.galcraft.affection@0.1.0` 的公开贡献和进度契约。作者可独立构建 `package/` 并安装到作品；已有作品继续读取原配置与插件进度。官方新建作品与教学样例使用 DSL 核心变量及通用页面绑定，默认发行不要求此包。

`pnpm install` 后运行 `pnpm build`，`package/` 是可加载和打包的独立 ESM 目录。复制此目录创建开发示例时，同时修改清单 ID 与源码中的贡献前缀。

宿主通过 `PluginContext.config` 传入作品保存的 `{characters:[{characterId,min,max,initial,visible,label}]}`。命令返回进度，由 M05 提交；配置编辑提案由 M02 提交。数值只存在进度域，长期数据为空。`add`、`set` 夹取范围，`compare` 提供六种比较，关系页按配置顺序展示可见角色。

开发构建成功后调用 `loadDevelopment` 和 `reload`；失败保留活动贡献。消费者保留旧试玩，准备并切换新会话后调用 `releaseContributions(oldContributions)` 释放旧实例。`packPlugin` 生成 `.galplugin`，普通安装入口通过 `install({kind:'archive',path})` 安装。目标运行包只需要 runtime 和运行资源。状态版本 0 的 `{values}` 可转换到版本 1，转换在副本内夹取配置范围。
