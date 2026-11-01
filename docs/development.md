# 开发说明

本文维护源码开发环境与命令。创作者使用方式见[在线手册](https://galcraft.dev/docs/zh-CN/studio-guide/)，工程边界见[架构](architecture.md)。

## 环境与安装

源码开发和 CI 固定使用 Node.js **24.21.0**、pnpm **12.3.4**。根 `package.json` 和 `pnpm-lock.yaml` 共同维护环境与依赖；开发者在仓库根执行命令。Studio 首发运行平台为 Windows x64。

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @galcraft/studio desktop
```

发行 npm 应用和插件开发 CLI 最低支持 Node.js **22.12.0**，使用教程推荐 Node 24 LTS 的最新补丁。源码仓继续使用固定开发版本。Studio 安装器携带自己的运行时，Electron 使用随包的 Node/Chromium。

完整 `desktop` 命令先运行 `desktop:prepare`，构建 Studio 依赖、Web/Windows Player、默认插件及引擎，再启动 Electron。开发者等待终端完成构建与首次准备。已完成准备后，`pnpm --filter @galcraft/studio desktop:start` 启动已有构建。

## 首次字体与媒体准备

依赖安装需要访问配置的 npm registry 和 Electron 下载源。完整桌面准备还需要以下输入：

| 输入 | 默认准备方式 | 已有本机输入 |
|---|---|---|
| 作品中日文字体 | `tools/fonts/prepare.mjs` 从固定 Noto CJK 源码提交取得 SC/JP Regular OTF、OFL 及来源说明，写入 `tools/fonts/cache/` | `GALCRAFT_FONT_DIR` 指向包含 `fonts.json`、所列字体、许可及 `UPSTREAM.md` 的目录 |
| FFmpeg、ffprobe | `tools/media/prepare.mjs` 按 `tools/media/manifest.json` 下载 BtbN Windows x64 LGPL 构建，使用系统 `tar.exe` 解包，准备 `tools/media/runtime/bin/` | `GALCRAFT_MEDIA_TOOL_DIR` 指向匹配当前平台与架构的两个可执行文件目录 |
| 品牌与引擎 | 工具从仓库品牌输入生成资源，并在 `build/desktop/engines/0.1.0/` 组装默认引擎 | 开发者通过完整准备命令更新产物 |

字体准备使用固定来源版本；媒体清单维护实际下载来源和许可。指定外部目录后，准备流程核对所需文件与原生目标。下载、解包或路径出错时，开发者修正终端指出的网络、文件或工具条件，再运行完整桌面命令。第三方来源和分发条件见[第三方声明](../THIRD_PARTY_NOTICES.md)。

可在当前 PowerShell 会话指定已经准备好的输入：

```powershell
$env:GALCRAFT_FONT_DIR = 'C:\GalCraftTools\fonts'
$env:GALCRAFT_MEDIA_TOOL_DIR = 'C:\GalCraftTools\ffmpeg\bin'
pnpm --filter @galcraft/studio desktop
```

## 开发服务与调试

桌面和本机浏览器界面共用同一 Node 领域服务。关闭窗口或浏览器标签后，服务继续持有作品与长任务。修改源码后，开发者先明确停止旧服务，再构建启动，使窗口使用新代码：

```powershell
node apps/studio/service/cli.mjs status
node apps/studio/service/cli.mjs stop
pnpm --filter @galcraft/studio desktop
```

停止入口执行保存恢复数据及任务交接。开发者按 CLI 结果处理尚待确认的状态。浏览器入口可在完整准备后运行 `pnpm --filter @galcraft/studio web:start`，并使用终端输出的实际地址。

| 命令 | 用途 |
|---|---|
| `pnpm dev` | 启动 renderer 的 Vite 开发服务，适合局部界面调试 |
| `pnpm --filter @galcraft/studio desktop` | 构建并启动完整 Electron 宿主 |
| `pnpm --filter @galcraft/studio desktop:prepare` | 更新应用、默认插件、媒体、字体及默认引擎 |
| `pnpm storybook` | 启动正式组件预览，默认端口 6007 |
| `pnpm storybook:build` | 构建正式 Storybook |
| `pnpm --filter <包名> typecheck` | 检查受影响包的实际类型边界 |
| `pnpm typecheck` | 检查全部 workspace 类型及架构依赖边界 |
| `pnpm build` | 构建提供 build 脚本的 workspace 包 |

本机服务拥有文件、凭据与长任务；renderer 开发页面需要所属宿主桥接才能执行这些能力。完整编辑保存、资源访问、制作和发行结论使用实际宿主。组件表现可在正式 Storybook 观察。

## 修改与验证

开发者先确定所属模块、实际提供方和消费者，再修改当前行为。跨进程接口同时维护契约、实际处理方、preload、桌面/浏览器传输及消费者。renderer 使用浏览器可用出口；`@galcraft/authoring/production` 总出口包含 Node 实现，renderer 从中导入类型，运行操作目录使用 `@galcraft/authoring/production/operations`。

开发者按变化选择最小有效检查：文档核对正文、示例与链接；组件查看受影响 Story 或页面；焦点、拖动与滚动使用真实浏览器；磁盘、原生工具和生命周期使用对应宿主；包出口、IPC 或独立插件变化检查实际消费者与组装。根类型检查已包含架构检查。自动化入口与材料准备见[测试](testing.md)，打包、签名与候选分发见[发行](releasing.md)。

产品帮助的唯一编辑源位于网站的 `content/product-docs/{zh-CN,en,images}/`。用户可见操作改变时，负责人同步相应手册页面与源图；源码仓通过链接引用产品手册。工程文档写明当前规则、具体责任与必要取舍，图使用 Mermaid。
