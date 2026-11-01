# 发行 / Releasing

维护者发布0.1.0早期预览，Studio首发支持Windows x64。源码开发与CI使用Node.js 24.21.0、pnpm 12.3.4；npm Studio及插件CLI要求Node.js >=22.12.0，推荐Node 24 LTS最新补丁。桌面安装器自带运行时。

The maintainer releases 0.1.0 as an early preview, initially supporting Windows x64. Source development and CI use Node.js 24.21.0 and pnpm 12.3.4. The npm application and plugin CLI require Node.js >=22.12.0; use the latest Node 24 LTS patch. The desktop installer includes its runtime.

## 构建与交付 / Build and deliver

发行负责人按[开发说明](development.md)安装锁定依赖，选择本次改动需要的检查，从同一源码准备交付物，并复用输入和实现仍适用的结果。

The release maintainer installs locked dependencies using the [development guide](development.md), selects checks for the change, prepares artifacts from the same source, and reuses results whose inputs and implementation still apply.

| 交付物 / Artifact | 准备入口与内容 / Preparation and contents |
|---|---|
| Studio安装器 / Installer | `pnpm --filter @galcraft/studio desktop:prepare`，随后 / then `node tools/package-studio.mjs`。包含工作台、精确插件、Player引擎和媒体运行时。 / Includes the workbench, exact plugins, Player engines and media runtimes. |
| npm Studio | `node tools/package-studio-npm.mjs`准备 / prepares `build/npm-studio/`；负责人在该目录执行 / the maintainer runs `npm pack` there. |
| SDK | `node tools/plugin-development/distribute-sdk.mjs out/sdk`构建contracts、plugins及可选dsl，保留版本索引、许可和源码声明。 / Builds contracts, plugins and optional DSL with a version index, licenses and source notices. |
| Player引擎 / Engine | `node tools/package-engine.mjs <output-directory> 0.1.0`使用已构建的Web、preview、Windows Player及所需字体、Electron和可选运行时。 / Uses the built Players, required fonts, Electron and selected optional runtimes. |
| 教学作品 / Tutorial | `node tools/package-practice.mjs`准备独立`.galproject`；素材索引把许可与作者源带入备份及Player。 / Prepares an independent `.galproject`; the asset index carries licenses and authoring sources into backups and Players. |
| 独立作品 / Independent work | 作者通过Studio M11从作品快照、精确依赖和目标构建，选择品牌、版本、签名及独立内容许可。 / Authors build through Studio M11 from a saved snapshot, exact dependencies and target, and choose their branding, version, signature and content license. |

每个程序发行物携带`LICENSE`、`LICENSING.md`、`THIRD_PARTY_NOTICES.md`和`LICENSES/`。Studio与Player报告收集所含npm依赖声明；插件构建收集所属许可和分环境报告。SDK构建器保留插件作者的许可，并收集LICENSE、COPYING、NOTICE及`licenses/`。

Each executable distribution includes `LICENSE`, `LICENSING.md`, `THIRD_PARTY_NOTICES.md` and `LICENSES/`. Studio and Player reports collect the included npm notices; plugin builds collect their licenses and environment reports. The SDK builder preserves the author's license and collects LICENSE, COPYING, NOTICE and `licenses/`.

发行负责人检查最终tarball、安装器暂存及解包目录和作品发行目录，确认对应源码、声明和来源进入同一交付链。教学包携带CC BY内容许可、天气图MPL、字体OFL及采用配音模型来源；独立来源包提供完整音乐WAV制作源。MPL源码取得方式见[源码声明](../LICENSES/SOURCE-CODE.md)。

The maintainer checks final tarballs, staged and unpacked installer files and work releases for corresponding source, notices and attribution. The tutorial carries CC BY content terms, weather texture MPL terms, font OFL terms and adopted voice model sources. A separate source package provides full music WAV masters. See the [source notice](../LICENSES/SOURCE-CODE.md) for MPL source access.

## 发布顺序 / Publication order

1. 维护者核对候选和审阅结果，以`TianyuEric <117527394+TianyuEric@users.noreply.github.com>`建立首次提交。 / The maintainer checks the candidate and review, then creates the initial commit with the stated public Git identity.
2. 维护者创建私有空仓库`TianyuEric/GalCraft`，推送同一初始提交的`main`与`dev`，核对后切换公开，默认分支设为`main`。 / The maintainer creates the empty private repository, pushes both branches at the same initial commit, verifies them, makes the repository public and selects `main` as default.
3. 维护者为`main`与`dev`要求PR和固定`CI`检查，批准人数为0，阻止强推与删除，采用手动合并，并启用私人漏洞报告。 / The maintainer requires PRs and the fixed `CI` check with zero approvals, blocks force pushes and deletion, merges manually, and enables private vulnerability reporting.
4. 维护者从明确的`main`发行提交建立`v0.1.0`，在Draft Release收齐附件与教学链接，再发布为Pre-release。 / The maintainer tags the selected `main` commit, collects artifacts and tutorial links in a draft release, then publishes a pre-release.
5. 维护者向`https://registry.npmjs.org/`发布已检查的三个SDK tarball和Studio轻量入口，使用public access、0.1.0和`latest`标签；轻量入口从精确Release URL安装完整应用。 / The maintainer publishes the three checked SDK tarballs and small Studio entry with public access, version 0.1.0 and the `latest` tag; the entry installs the full application from its exact release URL.
6. 负责人从真实入口安装精确npm版本，下载教学包并完成恢复、编译试玩、编辑保存重开，随后更新及部署中英官网。 / The maintainer installs exact npm versions, downloads and restores the shared tutorial, compiles and playtests it, edits, saves and reopens it, then updates and deploys the bilingual website.

维护者启用Squash和Merge commit，采用0位强制批准、无常驻绕过、无强制追平分支、无强制线性历史及手动合并。任务分支以Squash合入`dev`，`dev`以Merge commit合入`main`。普通PR说明具体问题、最终变化和实际验证。

The maintainer enables squash and merge commits, requires zero approvals, grants no standing bypass, permits checks without forcing an up-to-date branch, preserves merge history and merges manually. Task branches enter `dev` through squash merges; `dev` enters `main` through merge commits. PRs describe the concrete problem, final change and actual validation.

## npm启动入口与源码 / npm entry and source

维护者使用`node tools/package-studio-npm-entry.mjs`准备`build/npm-studio-entry/`，在该目录执行`npm pack`，把生成包保存为`galcraft-studio-npm-entry-0.1.0.tgz`。registry与该附件分发相同轻量入口。`galcraft-studio-0.1.0.tgz`继续作为完整应用附件，安装器和完整应用保持已发布内容。

The maintainer prepares `build/npm-studio-entry/` with the command above, runs `npm pack` there, and saves the result as `galcraft-studio-npm-entry-0.1.0.tgz`. The registry and that attachment distribute the same small entry. The original full application tarball and installer retain their published contents.

首次命令从精确GitHub Release URL下载完整应用（约326 MiB）并安装现有npm依赖，存入`%LOCALAPPDATA%/GalCraft/npm-studio/0.1.0`；后续命令复用完成的安装。准备失败后，用户执行相同命令重试。入口将参数交给完整应用的现有CLI，个人资料继续由现有Studio目录管理。首次准备要求GitHub与npm网络访问；已完成安装后的普通启动复用本机内容。

The first command downloads the exact full application release (about 326 MiB), installs its existing npm dependencies, and stores it in the stated user version cache. Later commands reuse the completed installation. Users retry failed preparation with the same command. The entry forwards arguments to the existing application CLI; Studio retains its personal-data directory. First preparation requires GitHub and npm access; subsequent ordinary startup reuses local files.

完整应用与安装器的源码标签为`v0.1.0`；轻量入口的源码标签为`studio-npm-v0.1.0`。维护者保留两个标签与各自附件，在发行说明分别链接。0.1.0的轻量入口让registry传送启动命令，GitHub Release传送完整运行输入；负责人检查首次安装、失败重试、缓存复用与参数转交，并复用完整应用的已有有效结果。

The full application and installer use source tag `v0.1.0`; the small entry uses `studio-npm-v0.1.0`. The maintainer retains both tags and their artifacts and links each source in the release notes. The registry supplies the command while GitHub supplies the complete runtime inputs. Validation covers first installation, retry, cache reuse and argument forwarding and reuses applicable full-application results.

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

维护者在同一Release上传对应源码TAR、安装器和npm tarball，并提供源码下载链接。附件保留原始档案、构建输入、许可与依据；Studio的`resources/media/`携带清单及声明。当前检查覆盖来源版本、配置、依赖闭包和归档内容；来源说明记录完整重构建与位级复现的实际范围。

The maintainer uploads source TAR, installer and npm tarballs together and links the source download. The attachment preserves upstream archives, build inputs, licenses and evidence; Studio includes manifests and notices in `resources/media/`. Checks cover source versions, configuration, dependency closure and archive contents. The upstream notice records the scope of full rebuild and bit-for-bit reproduction checks.

发行者按实际包含的Live2D适配器、Core、MotionSync或模型确认各自条款及许可；操作者提供所需外部SDK与模型。VoiceStudio服务、引擎、模型及生成内容分别遵循所属条款，连接器自身使用MPL-2.0。

Distributors check terms and permissions for included Live2D adapters, Core, MotionSync or models; operators supply external SDKs and models. VoiceStudio services, engines, models and generated content follow their own terms. The connector itself uses MPL-2.0.

维护者让公开二进制对应实际源码与精确输入，在发行说明列明系统、组件组合、变化、安装帮助、教学恢复、备份兼容、检查范围、签名、许可及反馈。维护者在公开主线修复，私人验证环境消费对应源码或产物。

The maintainer matches binaries to source and exact inputs and records systems, components, changes, installation, tutorial restoration, backup compatibility, checks, signature, licenses and feedback in the release notes. Fixes enter the public development line; private validation consumes that source or its artifacts.
