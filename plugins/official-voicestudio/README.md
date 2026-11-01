# VoiceStudio 官方连接插件

`org.galcraft.voicestudio@0.1.0` 使用公开 SDK 的 definition、generationProvider 和 fieldEditor 贡献。Studio 默认装配此独立包，作者另行安装、配置并运行 VoiceStudio 服务及模型。插件的服务入口执行 HTTP 和媒体写入，浏览器入口只通过 M10 的个人草稿事务和只读连接检查访问能力。

## 连接与操作

在制作的“连接与工具”中添加 VoiceStudio，填写实际地址（本机预设为 `http://127.0.0.1:3900`），保存并检查，再选择服务返回的引擎 ID。模型字段表示请求的引擎；实际权重身份来自该连接的活动模型和已安装模型目录。

| 操作 | 输入与结果 |
|---|---|
| `org.galcraft.voicestudio/speech` | 朗读文本、目标语言、实际 profile/引擎预设或参考录音、逐字稿及受支持参数；产生普通 WAV 候选，支持现有逐句规划与台词绑定 |
| `org.galcraft.voicestudio/design` | 文本与所属引擎的声音设计属性/描述；产生可试听并采用为角色参考音色的 WAV 样音 |
| `org.galcraft.voicestudio/clone` | 参考音频、作者核对的逐字稿、朗读文本及目标语言；产生普通 WAV 候选 |
| `org.galcraft.voicestudio/transcribe` | 参考录音与可选录音语言；使用实际活动 ASR 引擎，产生可编辑纯文本候选。审阅后“转入下一制作阶段”把文本写入克隆草稿的 `referenceText`，同时带上原录音 |

候选、逐句覆盖、角色分语言预设和采用继续由 M10/M04/M02 管理。角色编辑中的“读取实际引擎与声音”可以选择已有 profile；其连接 ID、引擎 ID 和真实声音 ID 随角色预设保存。缺失个人服务或声音时重新绑定，已采用本地音频继续可用。

## 已核对的接口与边界

VoiceStudio 0.5.6 的目录由 `/health`、`/engines/tts`、`/models`、`/profiles`、`/personalities`、`/engines/asr` 取得；检查不产生生成请求。OpenAI 标准声音别名不是具体已保存音色，插件不把它们列为 profile。KittenTTS 预设采用该上游已核对的实际预设身份，且只在该引擎实际可用时显示。

原生 `/generate` 使用 multipart 上传参考音频，接收完整 WAV 及 `X-Audio-Id`。引擎预设和 VoxCPM2 描述设计使用 `/v1/audio/speech` 已公开扩展；转录使用 `/v1/audio/transcriptions` multipart。插件冻结引擎、实际模型和声音事实，并在提交前比较变化。下载与候选采用保持同一请求及来源。

OmniVoice 的设计是同一种语言的逗号分隔属性，例如 `female, young adult, moderate pitch`；普通 happy/sad 或自由情绪句子不是它的通用情绪参数。CosyVoice 的参考表演沿已核对的 `instruct`。IndexTTS 的 WebSocket 情绪字段没有映射到 HTTP 端口，插件据实说明限制。未核对的引擎不声明专用设计、速度或表演控制；输入超出所属端口能力时明确失败并保留草稿。

这些同步端口在开始生成时不提供可恢复任务 ID，因此 query/refetch/cancelPerTask/resume 均为 false。取消只停止本地接收，不调用全局中断；发送后断流或超时保留 unknown，作者检查原请求后决定是否另建请求，插件不重发 POST。

## 模型来源与使用条件

界面显示实际模型仓库链接和服务返回的条件说明。VoiceStudio 应用使用 AGPL-3.0-only；引擎、权重及输出分别遵循其条件，OmniVoice 权重包含非商业条件。作者使用实际模型前阅读 [VoiceStudio 许可说明](https://github.com/debpalash/VoiceStudio/blob/main/LICENSE-NOTICE.md)及对应模型卡。此插件独立实现 HTTP 协议，分发包不包含 VoiceStudio 应用和模型。

## 构建与验证

`pnpm --filter @galcraft/official-voicestudio build` 生成普通精确插件包 `package/`；`test` 验证发现、上传、转录、冻结变化、错误输出与请求次数。正式 Studio 通过数据化官方目录安装并启用同一包，浏览器编辑器从 `./editor` 公开出口加载。开发者按[测试指南](../../docs/testing.md)选择真实服务输入，并在交付说明中记录观察结果。
