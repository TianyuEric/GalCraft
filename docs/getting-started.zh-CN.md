# 上手入口

[English](getting-started.md) · [项目介绍](../README.md)

GalCraft 0.1.0 是面向 Windows x64 的早期预览。创作者从[0.1.0 Release](https://github.com/TianyuEric/GalCraft/releases/tag/v0.1.0)下载安装器；Node 用户执行 `npx --yes --package=@galcraft/studio@0.1.0 galcraft-studio` 启动 npm 应用。

npm 命令首次运行时从精确 GitHub Release 准备完整应用，下载约 326 MiB 及运行依赖。首次准备要求访问 GitHub 与 npm；后续命令复用用户版本缓存。准备中断后，用户执行相同命令重试。

| 目标 | 入口 |
|---|---|
| 试玩成品 | [试玩《今晚，让春天亮起来》](https://galcraft.dev/examples/) |
| 开始创作 | [第一个作品](https://galcraft.dev/docs/zh-CN/first-project/)与[基本操作](https://galcraft.dev/docs/zh-CN/basic-operations/) |
| 编辑教学样例 | 先查看[示例页面](https://galcraft.dev/examples/)的获取状态，再按[样例教程](https://galcraft.dev/docs/zh-CN/sample-tutorial/)恢复独立副本 |
| 使用 Studio | [产品手册](https://galcraft.dev/docs/zh-CN/studio-guide/) |
| 从源码运行 | 准备 Node.js 24.21.0、pnpm 12.3.4，执行下方命令 |
| 开发插件 | [插件教程](https://galcraft.dev/docs/zh-CN/plugin-development/)与[插件工程契约](reference/plugins.md) |
| 修改 GalCraft | [开发](development.md)、[架构](architecture.md)与[贡献](../CONTRIBUTING.zh-CN.md) |

在仓库根执行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @galcraft/studio desktop
```

第二条命令构建完整桌面应用和引擎。首次准备会下载缺失字体与媒体工具。`pnpm dev` 启动 renderer 开发服务；完整宿主使用上述桌面命令。准备条件与重启行为见[开发说明](development.md)。

网站维护产品手册唯一正文。贡献者通过仓库贡献入口报告文档问题，附上页面地址。仓库工程规范以中文为主版，本入口与 README 同时提供英文导航。
