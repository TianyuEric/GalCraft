# 春灯五曲制作归档

本目录保存−18 LUFS采用版本的可复用来源。内置样例采用 `apps/studio/resources/practice/music/spring-01.opus` 至 `spring-05.opus`，编码为 Opus 128 kbps、48kHz 双声道。

- `originals/*.wav` 保留整定前的五首 SpessaSynth 原始渲染，`originals/*.production.json` 保留对应渲染参数、音色及乐谱来源摘要。
- `masters/*.wav` 保留采用版本的无损母带；Opus 直接从这些母带编码，采用时复用已试听文件。
- 可编辑乐谱与当前来源记录位于 `apps/studio/resources/practice/sources/music/`；该目录同时保留精确音色身份与完整上游许可资料。

本目录属于制作归档，Studio 内置轻量样例和 Player 发行不收录这些 WAV。独立制作源包同时收录本目录及上述乐谱/来源资料。重新整定时，从`originals/`读取无损输入。自有音乐与来源摘要使用CC BY 4.0，署名为TianyuEric / GalCraft contributors；第三方音色署名沿所属来源资料。
