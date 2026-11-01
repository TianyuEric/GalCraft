# 教学作品素材来源

`manifest.json` 选择当前采用媒体。授权非代码内容使用 CC BY 4.0，署名为 TianyuEric / GalCraft contributors；程序使用 MPL-2.0，第三方例外见 [许可范围](licenses/README.md)。

| 材料 | 制作方法与可复用来源 |
|---|---|
| 六背景、三CG、回忆墙、三人合照、标题艺术字 | GPT Image / ImageGen生成；`sources/images/`保留提示、原图、尺寸和采用关系 |
| 十八立绘及头像 | 项目角色图像及其表达差分，BiRefNet透明处理；`assets/generated/practice/white/`保留白底原图，`sources/images/avatar-crops.json`记录头像裁剪 |
| 五首BGM | 项目原创旋律、和声和多轨编曲；`sources/music/*.score.json`保存可编辑乐谱，`*.production.json`保存渲染参数、音色来源和采用编码；无损源位于`assets/generated/practice/music/` |
| 39句日语配音 | GalCraft M10、voice-comfy及Aratako/Irodori-TTS-v4.1-Small制作；`sources/voice/adopted-ja/`保留中日台词、工具与模型来源；`voice/*.mp3`保存采用成品 |
| 雨声与铃声 | 项目程序合成；`sources/audio/`记录方法与参数，`tools/artwork/synthesize-practice-effects.mjs`提供重建入口 |
| OP与三个ED | Motion Canvas图层、动作、字幕及原创配乐；`sources/video/w6/`保留工程、时间轴、混音、图像来源与字体声明 |
| 樱花、雨、雪 | OpenWebGAL / WebGAL_Terre模板天气纹理，保持原图；[来源索引](sources/textures/source-index.json)保留精确版本、上游与本地路径，按MPL-2.0分发 |
| SVG界面图形与作品图标 | 项目自行绘制；`ui/`与`branding/spring-lights.svg`保存可编辑文件 |

来源摘要使用仓库内相对路径和公开工具身份。已采用成品可独立播放；重新制作需要操作者准备相应工具和合法输入。
