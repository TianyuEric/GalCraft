# Motion Canvas 本机工具链

`prepare.mjs` 为 `plugins/motion-canvas/` 准备可选制作运行时。工具链使用 Motion Canvas 3.17.2、Vite 5.4.21 和 Playwright Core 1.62.1，消费执行者已安装的 Chromium 浏览器及宿主 FFmpeg/ffprobe。

## 准备与运行契约

```powershell
node tools/motion-canvas/prepare.mjs
# 安装版 Studio 使用明确的安装根和个人运行时目录：
node "<Studio安装根>/resources/motion-canvas/prepare.mjs" --directory "<Studio个人数据根>/runtimes/motion-canvas" --browser "<Chromium可执行文件>" --media-tools "<Studio安装根>/resources/media/bin"
```

默认运行时位于本目录的 `runtime/`，`--directory` 指定另一安装位置。准备入口用本机 Node/npm 安装精确依赖，实际启动浏览器、检查编码器后写入 `manifest.json`。清单记录依赖、浏览器和编码器的实际版本与路径。浏览器或编码器改变后，执行者重新准备清单；已有冻结任务按精确版本诊断差异，作者重新审阅新任务。

宿主沿公开能力键 `org.galcraft.motion-canvas/toolchain` 返回渲染入口及完整清单。`renderMotionProject({project,resources,directory,requestId,signal,onProgress,expected})` 执行冻结工程；`resources` 提供明确 alias、MIME 与媒体字节，输出返回媒体路径、MIME、大小和元数据。实际 Motion Canvas Renderer/Exporter 产生逐帧图像，宿主编码器输出 H.264、yuv420p、AAC 128kbps 与 faststart MP4。进度回调报告实际阶段和已知的完成帧数，失败携带阶段及适用诊断。取消和收尾释放所属浏览器、编码进程、工程及临时帧。

Motion Canvas 3.17.2 的源时长含一个终止帧；适配器要求 `sampledFrames = duration - 1`，输出采样位置为 `0…frames-1`。源时长与冻结输出帧数不一致时，作者修正源或输出帧数后建立新任务。

## 适用检查

执行者先完成[开发环境](../../docs/development.md)、媒体工具、字体和本机工具链准备，再按改变的能力选择入口。下列自足场景使用授权教学图像和音乐，或在独立作品中建立作者文档。

```powershell
node tools/motion-canvas/renderer-integration.mjs
node tools/motion-canvas/acceptance.mjs
node tools/motion-canvas/playback.mjs
node tools/motion-canvas/freeze.mjs
node tools/motion-canvas/document-acceptance.mjs
node tools/motion-canvas/package-acceptance.mjs
node tools/motion-canvas/studio-acceptance.mjs
node tools/motion-canvas/production-edge-acceptance.mjs --case freeze
node tools/motion-canvas/production-edge-acceptance.mjs --case errors
node tools/motion-canvas/production-edge-acceptance.mjs --case lifecycle
```

| 入口 | 检查能力 |
| --- | --- |
| `renderer-integration` | 实际 Renderer/Exporter、编译与缺资源错误、逐帧和编码取消、旧候选保护 |
| `acceptance`、`playback`、`freeze` | 产品适配器完整解码与音画时序、浏览器实际播放、冻结源保护及新版本重渲染；playback 消费 acceptance 的当前输出 |
| `document-acceptance` | 实际作者文档创建、更新、冲突、复制、撤销/重做及保存重开 |
| `package-acceptance` | 独立打包目录中的运行时准备、明确媒体目录和实际渲染入口装载 |
| `studio-acceptance` | 实际 M02/M04/M09/M10 创建任务、视频与作者源采用、整组撤销/重做及保存 |
| `production-edge-acceptance` | 实际 M10/M12 冻结、精确依赖诊断、修复后候选保留、连接超时、所属浏览器终止、作者取消及原调用恢复 |

执行者可为 `studio-acceptance` 同时提供 `--project <作品目录> --profile <个人数据目录>`，选择可修改的测试副本。该模式保存连接、任务与采用结果，执行者先关闭同目录的 Studio。默认模式创建独立测试作品。

测试临时副本位于 `tmp/testing/`，报告及必要媒体位于 `test-results/latest/motion-canvas/`。执行者遵循[测试产物预算与清理规则](../../docs/testing.md#临时产物与适用范围)，清理时保留明确选择的外部作品、调用账本和远端回执。真实服务与主观音画体验由对应环境的实际观察确认。

Motion Canvas 与 Vite 使用 MIT，Playwright Core 使用 Apache-2.0；安装目录保留其许可与 lockfile。宿主 FFmpeg 按 LGPL-3.0-or-later 准备。工程媒体沿所属来源与许可管理。
