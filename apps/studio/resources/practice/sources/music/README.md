# 样例原创编曲源

作者为五首曲目编写原创旋律、和声、分段及配器，作者源采用 `MusicScore` 第 1 版。`tools/artwork/practice-scores.mjs` 保存可重建的音符与段落安排，Tone.js 15.1.22 的 `TicksClass` 负责音乐单位换算。作者通过M10草稿、计划和任务调用精确的 `org.galcraft.music-composition@0.1.0` 提供方，使用 SpessaSynth core 4.3.22 实际渲染完整事件序列。

| 成品 | 曲名与用途 | 时长 | 分段 / 轨道 | 作者源 |
|---|---|---|---|---|
| `music/spring-01.opus` | 灯火的第一行 · 标题与街道序幕 | 89.302 秒 | 5 / 6 | `spring-01.score.json` |
| `music/spring-02.opus` | 把椅子排成春天 · 日常筹备 | 90 秒 | 5 / 7 | `spring-02.score.json` |
| `music/spring-03.opus` | 把未说完的话留住 · 角色路线 | 91.429 秒 | 5 / 6 | `spring-03.score.json` |
| `music/spring-04.opus` | 银幕亮起的那一秒 · 放映高潮 | 88.889 秒 | 5 / 7 | `spring-04.score.json` |
| `music/spring-05.opus` | 明天仍有一盏灯 · 告别结局 | 89.302 秒 | 5 / 6 | `spring-05.score.json` |

各曲使用完整首尾循环区，保存3秒采样尾音并以`wrap`方式回卷，表达控制和段落力度保存在乐谱。Player采用600毫秒淡入、800毫秒淡出；准确循环点见各自`production.json`。制作摘要保留公开渲染参数、音色身份、乐谱和编码元数据。播放版本为48kHz双声道Opus 128 kbps，以−18 LUFS为整定目标。`artifact.localPath`相对于样例资源根目录。

原始 WAV 与原始制作记录保存在仓库 `assets/generated/practice/music/originals/`，整定 WAV 母带保存在同级 `masters/`。它们随独立制作源包交付，轻量样例保留本目录的乐谱和来源资料。重新准备试听时从原始 WAV 开始，保留用户已采用的播放版本。

音色使用已安装的 `musescore-general-hq@0.1.0`，上游 MuseScore General HQ 0.2.1，无损 SF2。来源为 [Debian 上游包](https://deb.debian.org/debian/pool/main/m/musescore-general-soundfont/musescore-general-soundfont-lossless_0.2.1-1_all.deb)。随附的 `MuseScore-General-HQ-copyright`、`MuseScore-General-HQ-MuseScore_General_HQ_Readme.md` 与 `MuseScore-General-HQ-MuseScore_General_HQ_Sample_Sources.csv` 保留完整来源和 MIT、CC0、公共领域声明。音色库作为作者个人安装依赖，不随 Player 音频闭包分发。SpessaSynth 引擎采用 Apache-2.0，提供方包保留对应引擎许可证。

自有旋律、乐谱、录音及制作摘要使用CC BY 4.0，署名为TianyuEric / GalCraft contributors。第三方音色来源和许可保持原文。
