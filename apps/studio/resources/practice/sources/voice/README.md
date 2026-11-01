# 日语角色声音来源

三名路线角色共有39句日文成品配音，每名角色13句，覆盖共同线、个人路线、结局与普通后日谈。中文剧本、界面和角色名保留；玩家角色对白与第一人称旁白保持无声。

`adopted-ja/lines.json` 与 `lines.md` 保存中文正文和日语朗读稿。`voice/{key}-ja-01..13.mp3` 是实际采用成品，剧情按语句与语言绑定，不依赖制作环境。样例角色保持无语音制作预设。

`adopted-ja/production-summary.json`提供采用工具、模型与成品授权范围；`license-provenance.json`保留实际模型来源和上游条件。39句成品及台词使用CC BY 4.0，署名为TianyuEric / GalCraft contributors。语音模型与服务本体由重新制作者独立准备，分别遵循其条款。

`node tools/artwork/verify-practice-voices.mjs`核对39句成品的台词映射、编码、完整解码与音量范围。
