# 公开材料清单

| 位置 | 内容、归属与许可 |
|---|---|
| `apps/`、`packages/`、`plugins/`、`tools/`、`tests/` | GalCraft 当前应用、领域包、SDK、官方插件、模板、工具及适用测试；自有程序使用 MPL-2.0，实际第三方文件保留原许可 |
| 根说明和 `docs/` | 当前开发、架构、接口、UI、测试、贡献和发行说明；自有文档使用 CC BY 4.0 |
| `assets/branding/` 及应用品牌素材 | GalCraft 自有图形，使用 CC BY 4.0；许可不授予商标或背书权利 |
| `apps/studio/resources/practice/` | 《今晚，让春天亮起来》教学作品的当前源码输入、剧情、图片、音乐、39句日语配音和四段影片，以及可编辑乐谱、影片工程和来源；授权内容使用 CC BY 4.0，程序部分使用 MPL-2.0 |
| `assets/generated/practice/` | 当前角色白底原图、表达提示、五首音乐的原始 WAV 和母带，以及可复用的制作来源；授权内容使用 CC BY 4.0 |
| `practice/textures/` | 三张未修改的 OpenWebGAL / WebGAL_Terre 天气图；使用原 MPL-2.0，来源索引和许可证随素材保留 |
| `practice/sources/video/w6/fonts/` | Noto Sans CJK SC 与完整 OFL、上游说明；使用原字体许可 |
| `practice/sources/music/` | 自有乐谱和制作摘要，以及外部 MuseScore 音色的版权、来源和采样声明；音色库本体由作者独立准备 |
| `LICENSES/`、`THIRD_PARTY_NOTICES.md` 和组件内声明 | 自有许可全文、源码取得说明及实际第三方例外；来源与分发范围按各文件说明 |

`practice/manifest.json` 选择当前采用媒体。来源元数据保留制作方法、模型或工具身份、可编辑参数、相对路径和必要上游署名；公开构建和作品播放消费本树输入或操作者显式提供的外部工具。

Studio 安装器与 npm 应用分发工作台、精确插件、Player 引擎和已准备的媒体运行时；完整教学作品使用独立 `.galproject`。SDK 使用独立 npm tarball；教学制作源中的 WAV 供需要无损源文件的作者使用。每种容器内的文件分别遵循 [许可范围](../LICENSING.md)。

Live2D Framework、Cubism Core、MotionSync、模型、VoiceStudio 服务及模型权重属于外部输入；本树提供接入或准备代码。可选构建参数会改变实际打包材料，发行者依据最终包保留其原许可和来源。具体范围见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

产品手册由[官网](https://galcraft.dev/)维护；本仓维护开发说明。材料许可、署名方法和独立用户作品的权利见 [LICENSING.md](../LICENSING.md)。
