# 发行 / Releasing

GalCraft Studio `0.2.0` 是面向 Windows x64 的早期预览，随包提供 Player 引擎 `0.2.0` 与 13 个官方插件 `0.1.1`。公开 SDK 的 contracts、plugins 和 DSL 包为 `0.2.0`，插件清单的 `sdkMajor` 为 `0`。

GalCraft Studio `0.2.0` is an early preview for Windows x64. It bundles Player engine `0.2.0` and 13 official plugins at `0.1.1`. The public contracts, plugins and DSL packages are `0.2.0`, with `sdkMajor: 0` in plugin manifests.

## 构建与交付 / Build and deliver

维护者在同一发行提交上用 [开发环境](development.md) 准备运行时和锁定依赖，再执行各产物的相关检查。 / Prepare the runtime and locked dependencies from the same release commit and run the applicable checks in the [development environment](development.md).

| 交付物 / Artifact | 构建入口 / Build entry |
| --- | --- |
| Windows x64 Studio 安装器 / Installer | `pnpm --filter @galcraft/studio desktop:prepare`，然后 / then `pnpm desktop:package` |
| 完整 Studio 应用 / Full Studio application | `pnpm studio:npm`，在 `build/npm-studio` 中执行 / run `npm pack` in that directory |
| npm 轻量入口 / Small npm launcher | `node tools/package-studio-npm-entry.mjs`，在 `build/npm-studio-entry` 中执行 / run `npm pack` in that directory |
| SDK | `node tools/plugin-development/distribute-sdk.mjs out/sdk`，核对精确依赖和独立消费者 / check exact dependencies and the standalone consumer |
| Player 引擎 / Player engine | 桌面准备步骤调用 / desktop preparation invokes `node tools/package-engine.mjs` |
| 教学作品 / Tutorial | `node tools/package-practice.mjs`，核对恢复和构建 / verify restore and builds with `node tools/package-practice-release.mjs` |

维护者检查安装器、解包应用及 npm 产物包含实际引擎、插件、许可和对应源码声明。独立验证入口见[测试说明](testing.md#独立消费与可选工具)。教学媒体保留逐项授权，编曲和动画作者源随教学作品交付。

Check the installer, unpacked application and npm artifacts for the actual engine, plugins, notices and corresponding source. Use the independent checks listed in [Testing](testing.md#独立消费与可选工具). The tutorial retains itemized media terms and editable music and animation sources.

## 发布顺序 / Publication order

1. 功能与定版 PR 经 `CI` 后以 squash 合入 `dev`，发行 PR 从 `dev` 以 merge commit 合入 `main`。 / Squash task PRs into `dev` after CI, then merge the release PR from `dev` into `main` with a merge commit.
2. 从最终 `main` 发行提交构建，建立 `v0.2.0` 与 `studio-npm-v0.2.0` 标签。核对 Draft Release 上的安装器、完整应用、轻量入口、SDK、教学备份及说明，再发布。 / Build from the final `main` commit, create the two source tags, and check the installer, full application, npm launcher, SDKs and tutorial with instructions on the draft release before publishing.
3. 核对完整应用的精确 Release 下载 URL，然后发布 SDK 与轻量 Studio 入口到 npm `latest`。从真实入口确认下载安装，再部署中英文官网。 / Verify the full application at its exact release URL, publish the SDK and small Studio entry to npm `latest`, and verify installation through the public entry before deploying the bilingual site.

首次 npm 执行从 `v0.2.0` Release 下载完整应用到 `%LOCALAPPDATA%/GalCraft/npm-studio/0.2.0` 并安装运行依赖。用户需要访问 GitHub 和 npm，随后启动复用已完成的安装。桌面安装器携带运行时。Node.js 最低版本为 `22.12.0`。

On first use, the npm entry downloads the full application from the `v0.2.0` release into `%LOCALAPPDATA%/GalCraft/npm-studio/0.2.0` and installs its dependencies. This requires GitHub and npm access. Later launches reuse the installation. The desktop installer includes its runtime. The npm and plugin CLIs require Node.js `22.12.0` or later.

新版示例使用引擎 `0.2.0`。旧作品和旧制作任务请继续在 Studio `0.1.1` 中使用相应精确包。旧版完整应用归档包含引擎 `0.1.1` 及随包插件 `0.1.0`。 [Studio 0.1.1](https://github.com/TianyuEric/GalCraft/releases/tag/v0.1.1)

The new tutorial uses engine `0.2.0`. Use Studio `0.1.1` and its exact dependencies to continue earlier projects and production tasks. The historical full application archive includes engine `0.1.1` and bundled plugins `0.1.0`. [Studio 0.1.1](https://github.com/TianyuEric/GalCraft/releases/tag/v0.1.1)

## 0.1.0发布项 / 0.1.0 release artifacts

负责人在[GitHub Release](https://github.com/TianyuEric/GalCraft/releases/tag/v0.1.0)维护以下文件。源码归档服务开发，安装器运行Studio，npm应用提供CLI与浏览器工作台。

The maintainer lists the following files in the [GitHub release](https://github.com/TianyuEric/GalCraft/releases/tag/v0.1.0). Source archives serve development, the installer runs Studio, and the npm application provides the CLI and browser workbench.

| 文件 / File | 用途 / Purpose |
|---|---|
| `GalCraft-Studio-0.1.0-windows-x64-setup.exe` | Windows x64安装器，自带运行时。 / Windows x64 installer with its runtime. |
| `galcraft-studio-0.1.0.tgz` | 完整Studio应用；轻量入口从此文件安装到用户版本缓存。 / Full Studio application, installed into the user version cache by the small entry. |
| `galcraft-studio-npm-entry-0.1.0.tgz` | 与registry相同的轻量启动入口。 / The same small launch entry published to npm. |
| `galcraft-contracts-0.1.0.tgz`、`galcraft-plugins-0.1.0.tgz`、`galcraft-dsl-0.1.0.tgz` | 与registry相同的SDK包。 / The same SDK tarballs published to npm. |
| `ffmpeg-n9.0.2-39-g7adfbe40dc-win64-lgpl-9.0-sources.tar` | 媒体运行时对应源码、构建输入、许可及来源。 / Corresponding media runtime source, build inputs, licenses and provenance. |

维护者使用`CN=GalCraft`自签名发布Windows安装器，在发行说明写明Windows信任提示。用户核对下载来源和发布者后按Windows正常流程安装。维护者保留历史Release、标签及精确包，修复使用新版本。

The maintainer signs the installer with the self-signed `CN=GalCraft` certificate and describes Windows trust prompts in the release notes. Users verify the download source and publisher and follow normal Windows installation steps. The maintainer retains historical releases, tags and exact packages and publishes fixes under new versions.

## 0.1.0教学包 / 0.1.0 tutorial package

维护者在Release和官网引用以下网盘入口。维护者于2026-11-01提供链接和提取码，发行负责人核对实际访问与文件内容。

The maintainer links these shares from the release and website. The maintainer supplied the links and codes on 2026-11-01; the release maintainer checks access and actual files.

| 渠道 / Channel | 分享链接 / Share | 提取码 / Code |
|---|---|---|
| 百度网盘 / Baidu | [下载教学样例 / Download tutorial](https://pan.baidu.com/s/170k5QSiJrMnAlhgK3ThM0w?pwd=9tu8) | `9tu8` |
| 夸克网盘 / Quark | [下载教学样例 / Download tutorial](https://pan.quark.cn/s/f0beac83a506?pwd=ivVr) | `ivVr` |
| Google Drive | [下载教学样例 / Download tutorial](https://drive.google.com/drive/folders/1RTAxnscjDbZjN9dgwKwVnSDkJhuvn6oz?usp=sharing) | — |

各分享目录提供两个同级文件： / Each share provides two files side by side:

- `galcraft-tutorial-0.1.0.galproject`：《今晚，让春天亮起来》教学备份，适用Studio 0.1.0 Windows x64，213,089,707字节（约203.22 MiB）。 / The “Light up spring tonight” backup for Studio 0.1.0 Windows x64, 213,089,707 bytes (about 203.22 MiB).
- `readme.txt`：中英文介绍、恢复步骤、版本及许可说明。 / Bilingual introduction, restore steps, version and license information.

创作者在Studio作品库选择“从备份恢复”，选择教学包和新目标目录，再选“创建独立副本”，准备并检查依赖后确认。负责人从实际分享文件检查恢复、编译试玩与编辑保存重开。

Creators choose “Restore backup” in Studio, select the backup and a fresh destination, choose “Create independent copy”, then prepare and check dependencies before confirming. The maintainer checks restoration, compilation, playtesting, editing, saving and reopening from an actual shared download.

## 媒体源码与外部输入 / Media source and external inputs

媒体运行时采用BtbN的`n9.0.2-39-g7adfbe40dc-20261030`。[来源说明](../tools/media/UPSTREAM.md)记录二进制、配置及固定构建脚本；[源码清单](../tools/media/source-bundle.json)记录FFmpeg、静态依赖、嵌套源码与工具链。维护者使用Python 3.11及以上执行`python tools/media/prepare-sources.py`准备对应源码。

The media runtime uses BtbN `n9.0.2-39-g7adfbe40dc-20261030`. The [upstream notice](../tools/media/UPSTREAM.md) records binaries, configuration and pinned build scripts; the [source manifest](../tools/media/source-bundle.json) records FFmpeg, static dependencies, nested source and toolchains. The maintainer prepares corresponding source with Python 3.11 or newer using the command above.

维护者在发行说明链接对应源码 TAR。随包媒体二进制沿用原构建时，链接已经公布的对应源码即可。附件保留原始档案、构建输入、许可与依据；Studio的`resources/media/`携带清单及声明。当前检查覆盖来源版本、配置、依赖闭包和归档内容；来源说明记录完整重构建与位级复现的实际范围。

Link the corresponding source TAR in the release notes. Reuse the existing public source link when the bundled media binaries retain the same build. The attachment preserves upstream archives, build inputs, licenses and evidence; Studio includes manifests and notices in `resources/media/`. Checks cover source versions, configuration, dependency closure and archive contents. The upstream notice records the scope of full rebuild and bit-for-bit reproduction checks.

发行者按实际包含的Live2D适配器、Core、MotionSync或模型确认各自条款及许可；操作者提供所需外部SDK与模型。VoiceStudio服务、引擎、模型及生成内容分别遵循所属条款，连接器自身使用MPL-2.0。

Distributors check terms and permissions for included Live2D adapters, Core, MotionSync or models; operators supply external SDKs and models. VoiceStudio services, engines, models and generated content follow their own terms. The connector itself uses MPL-2.0.

维护者让公开二进制对应实际源码与精确输入，在发行说明列明系统、组件组合、变化、安装帮助、教学恢复、兼容边界、签名、许可及反馈。完整检查写入内部记录。维护者在公开主线修复，私人验证环境消费对应源码或产物。

The maintainer matches binaries to source and exact inputs and records systems, components, changes, installation, tutorial restoration, compatibility, signature, licenses and feedback in the release notes. Detailed checks belong in the internal record. Fixes enter the public development line; private validation consumes that source or its artifacts.
