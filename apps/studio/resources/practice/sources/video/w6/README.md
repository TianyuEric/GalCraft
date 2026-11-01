# 春夜影院四片 Motion Canvas 作者源

四片使用 `org.galcraft.motion-canvas@0.1.0` 的本机制作端口。每个子目录的 `motion-project.json` 是完整 `MotionProject`；以 `{project: <JSON>}` 作为 `org.galcraft.motion-canvas/project` 作者文档数据。`scene.tsx` 编排画面和可编辑动作，`timeline.json` 记录镜头、字幕与时序。`production.json` 保存公开工具身份、成品参数和作者工程；发行组装消费 `video/*.mp4`，并按当前作品的实际素材身份重写作者工程绑定。

| 影片 | 帧数 / 30fps | 音乐及完整乐句 | 镜头动作 |
|---|---|---|---|
| OP | 1005 / 33.500秒 | spring-01，第0–12小节：四小节引子＋八小节第一主题 | 闭馆与空椅、雨、接线、星形缝线、胶片运转、末班车、三人汇合、未亮银幕与标题 |
| 澜汐 ED | 670 / 22.333秒 | spring-05，第20–28小节“明天的约定” | 插头接合、电流沿线到达、灯串顺次点亮、共同放映、散场收灯 |
| 绮白 ED | 686 / 22.867秒 | spring-03，第20–28小节“向你靠近” | 星形缝线逐边完成、重新串灯、列车与星光方向、修补与出发 |
| 绯书 ED | 670 / 22.333秒 | spring-05，第12–20小节“回望灯火” | 胶片与卷盘运转、他人的照片经过、相机放下、取景框消散、相册翻页留下“我们” |

片长随完整乐句调整。音乐使用已采用的原创播放母带，不重复拼接短音频。`audio/*-mix.wav` 保存48kHz双声道混音；`audio/*-effects.wav` 保存源码合成的雨声、接线声、星灯音与低音量放映机声。音乐首尾使用0.3秒／0.85秒淡变，混音末尾额外0.18秒平滑。OP 保留路线悬念；ED 使用正篇结局 CG，后日谈仍由正篇外的正式入口展开。

`dependencies.json` 的 `media` 将别名映射到样例资源根的相对文件，`bindings` 记录本轮真实制作副本的精确素材／变体身份，`clips[].audioBinding` 记录每片混音。组装方先导入这些文件，再按别名重写 `motion-project.json` 的身份。作者工程只依赖公开包和显式素材别名；正式工程文件没有临时目录绝对路径。

三张新增操作图使用内置 image_gen（GPT Image）及现有结局 CG 作为人物／服装／美术参考。`images/originals/` 保留1672×941原始输出，`images/` 保存等比例 Lanczos 适配的1920×1080采用版；`image-generation.json` 保存实际提示、参考和采用关系。三张图是完整场景，没有透明层。复用的三角色立绘保留原有 alpha。字体为 Noto Sans CJK SC，完整 OFL 与上游说明随 `fonts/` 保留；原创音乐的乐谱及音色来源沿 `sources/music/` 的既有记录。

作者可以在Studio的Motion Canvas作者文档中修改工程，再通过自己准备的工具链重渲染。`dependencies.json`提供公开素材别名与相对路径，组装时重写实际素材身份。授权图像、影片、乐谱和非代码时间轴使用CC BY 4.0，署名为TianyuEric / GalCraft contributors；`scene.tsx`等程序使用MPL-2.0。
