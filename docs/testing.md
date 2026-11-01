# 测试与维护入口

负责人根据本次变更选择最小有效检查，检查通过后交付结果。新失败、关联实现变化或用户明确要求决定扩展范围。负责人在 PR 中简述具体变化、实际验证和适用范围。

## 日常检查

开发者使用 Node **24.21.0**、pnpm **12.3.4**，在仓库根目录执行命令。源码旁的领域、契约、组件和宿主测试随所属模块维护。

| 变更 | 适用入口 |
| --- | --- |
| 文档、文案与链接 | 核对本次正文、示例、页面和引用 |
| 局部实现 | `pnpm --filter <包名> test` 和该包的 `typecheck` |
| 包出口、共享契约、IPC、插件或宿主接线 | 构建提供方依赖，检查提供方及实际消费者；`pnpm check:architecture` 检查工程边界 |
| UI 和 Storybook | 查看受影响 Story 或实际页面；`pnpm storybook:build` 检查注册和组装 |
| 共享工具 | `pnpm test:tools` 检查架构解析、目标选择、迁移工具、CI 选择器及自足作品夹具 |
| 全部源码范围 | `pnpm typecheck`、`pnpm test`；根 typecheck 已包含架构检查 |

开发者用 `pnpm --filter <包名>... build` 先构建所需依赖。根 `test:tools` 在干净树上先构建 authoring 的依赖闭包，再运行 `tools/*.test.mjs` 和 `tests/e2e/fixtures.test.mjs`。后者通过实际 `ProjectDocuments` 打开自制磁盘作品，再交给实际 DSL 编译器。

## 跨应用场景

开发者先按[开发说明](development.md)执行 `pnpm --filter @galcraft/studio desktop:prepare`。它构建正式 renderer、服务与 Player，准备精确引擎、官方插件和字体。下列场景使用当前正式宿主实现及独立临时作品，执行者按受影响能力选用。

| 能力与命令 | 实际检查和输入 |
| --- | --- |
| `node tests/e2e/studio-object-save.mjs` | 真实 Electron、正式 preload、目录选择 IPC 与服务 HTTP，选择对象保存、共享资源索引、部分保存后的离开处理、丢弃撤销、Windows 独占文件锁失败；页面重连保留工作，随后关闭 renderer → 重启服务 → 打开作品并明确恢复；host 用自制 PNG 创建作品并提供目录选择结果 |
| `node tests/e2e/production-adoption.mjs` | 真实 M10/M04/M02，精确人物和插图对象采用、差分、资源库与 BGM、整组撤销/重做、冲突保护及保存重开；本地受控提供方返回自制几何 PNG 和合成 WAV，断言外部请求为 0 |
| `node tests/e2e/project-backup-release.mjs` | Node Studio 正式组装，创建已保存备份、`copyNew` 恢复、精确依赖、媒体闭包、独立编辑保存重开及原作品保护；夹具使用源码 schema、官方模板和自制 SVG 栅格化的 PNG |
| `node tests/e2e/project-backup-release.mjs web windows` | 在同一自制夹具上追加实际 M11 双目标构建，检查发行清单、逐文件大小、快照及构建回执版本；Windows 构建使用 unsigned 模式 |

`project-fixture.mjs` 和 `production-adoption-fixture.mjs` 提供选定场景的输入；`studio-object-save-host.mjs` 组装实际桌面应用；`electron-cleanup.mjs` 释放本场景所属 Electron 进程树。测试通过实际 `apps/studio/main/` 和 `service/` 消费共享包，开发者同步这些消费者后维护场景断言。

## 独立消费与可选工具

| 入口 | 前置与用途 |
| --- | --- |
| `pnpm studio:npm`，`node tools/verify-studio-npm.mjs` | 从公开源码生成独立 npm 应用，再以独立安装检查 CLI、原生依赖、创建及编译；执行者准备发行所需媒体工具与引擎 |
| `node tools/plugin-development/distribute-sdk.mjs out/sdk` | 生成精确版本 contracts/plugins/dsl tarball 和 SDK 清单 |
| `node tools/plugin-development/verify-external-sdk.mjs out/sdk complete` | 在独立 npm 消费者中安装 tarball，执行 create/typecheck/build/check/pack，并检查依赖闭包；也支持 `custom-asset` 和 `video-generation` 示例 |
| `node tools/verify-studio-package.mjs --unpacked <目录>` | 检查已解包桌面候选的实际服务入口、原生目标、插件/引擎闭包和品牌信息 |
| `node tools/media/src/transcoding-smoke.mjs` | 需要准备好的 FFmpeg/ffprobe 和 Windows H.264 编码器；使用合成视频检查实际转码、完整解码、取消及源文件保护 |
| `node tools/matting/src/model-smoke.mjs <图片> <输出目录> <模型目录>` | 执行者明确提供可使用的图片；实际下载/加载透明化模型并处理输入 |
| `tools/live2d/acceptance-inputs.mjs` | 调用方通过 `GALCRAFT_LIVE2D_SDK`、`GALCRAFT_LIVE2D_MOTION_SDK`、`GALCRAFT_LIVE2D_MOTION_MODEL`、`GALCRAFT_LIVE2D_EXPRESSION_MODEL`、`GALCRAFT_LIVE2D_VOICE` 明确提供有相应用途许可的本机输入 |
| [Motion Canvas 工具链](../tools/motion-canvas/README.md) | 准备实际浏览器与媒体工具后检查渲染、冻结、作者文档、生命周期及打包布局 |
| `node tools/package-practice.mjs` | 对仓库授权教学素材创建备份、恢复独立副本、编译并保存重开；`--verify-only` 消费已有包 |
| `node tools/package-practice-release.mjs <备份> <输出目录> [引擎目录]` | 用已保存教学备份生成双目标候选，输出保存在指定发行目录 |
| `tools/artwork/verify-practice-audio.mjs`、`verify-practice-voices.mjs` | 准备媒体工具后检查当前教学音频的完整解码、映射和数值指标；执行者另行完成所需听审 |
| `node tools/upgrade-player-gallery.mjs`、`node tools/migrate-work-ids.mjs --user-data <目录>` | 显式选择作品、备份或个人数据目录的维护操作；执行者先关闭所属 Studio 并保留原件 |

执行者依据本次改变的公开入口选择独立消费检查。Node 22.12.0 是 npm Studio 与插件开发 CLI 的最低支持版本；最低版本消费检查使用该版本运行实际 tarball 消费者。

## CI

`.github/workflows/ci.yml` 为指向 `main` 和 `dev` 的 PR 提供固定 **CI** 检查。单条 Windows 路线使用固定开发版本、只读权限、关闭 checkout 凭证保留、45 分钟超时和同 PR 更新取消。工作流按包清单计算变更提供方及递归消费者，构建所需依赖，再运行适用类型检查、测试、架构或 Storybook 构建；共享根配置变化选择全部包。纯文档 PR 完成内容范围选择后同样成功汇总，作者与维护者核对正文和链接。

初次本地候选尚未建立提交历史时，执行者显式列出当前范围：

```powershell
node tools/ci-plan.mjs --paths packages/documents/src/session.ts apps/studio/main/document-providers.mjs
node tools/ci-checks.mjs
# 路径较多时使用每行一个仓库相对路径的清单：
node tools/ci-plan.mjs --paths-file tmp/current-change-paths.txt
```

公开 PR 的规划器读取本仓库 PR 的 base/head。工作流检查公开输入，失败时只上传 `test-results/latest/ci/checks.json`，保留 **7 天**。维护者保留 GitHub 对首次外部贡献运行的审批设置；签名、发布和远程上传由维护者单独执行。

## 临时产物与适用范围

执行者在 `tmp/testing/` 复用明确用途的目录，在 `test-results/latest/` 保存当前必要报告和截图。现役自足场景正常结束时释放所属进程与文件占用，再清理自行创建的临时作品、profile、引擎和发行副本。失败报告保留最小诊断；修复确认后，当前结果替换被取代的材料。

自动生成的保留证据总预算为 **5 GB**（5,000,000,000 字节），覆盖 `test-results` 及因当前复现暂留的测试材料。执行者在持久保存前和收尾时检查总量，达到预算后复用材料、采用终端或内存观察并缩减采集，释放预算后再保存。调用账本与明确保留的远端回执沿所属位置单独保护。录屏、完整 trace 和批量截图由具体定位需要触发，定位结束后收敛。

Windows x64 是当前桌面验证环境。真实服务、Live2D 输入、移动工具链、主观听感和发行签名需要执行者准备相应环境，日常 CI 执行公开自足输入。历史验收流水、个人 profile、私人研究附件和未授权商业素材由原持有人保留；公开测试使用上表的自制输入、授权教学素材或执行者明确选择的本机输入。
