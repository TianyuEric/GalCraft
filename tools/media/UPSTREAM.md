# FFmpeg / ffprobe 来源与许可

GalCraft 使用 BtbN `autobuild-2026-10-30-13-01` 的 Windows x64 LGPL 静态命令行构建：**n9.0.2-39-g7adfbe40dc-20261030**。GalCraft 通过独立进程调用 `ffmpeg.exe` 与 `ffprobe.exe`。准备阶段核对了 runtime 与精确上游 ZIP 中的两个原始文件，结果逐字节一致；应用封装可以为文件添加发行签名。

- [精确二进制归档](https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-30-13-01/ffmpeg-n9.0.2-39-g7adfbe40dc-win64-lgpl-9.0.zip)
- [FFmpeg 源码提交](https://github.com/FFmpeg/FFmpeg/tree/7adfbe40dcde598f93a6963d2f7b22cd75202ccc)
- [BtbN 构建配方与补丁](https://github.com/BtbN/FFmpeg-Builds/tree/5031c6f1082414e53688d39e521849905071070d)
- [对应源码材料说明](SOURCES.md)；源码树的固定目标清单为 `source-bundle.json`，二进制包内同一清单名为 `SOURCE-BUNDLE.json`。

对应源码附件为 `ffmpeg-n9.0.2-39-g7adfbe40dc-win64-lgpl-9.0-sources.tar`。维护者在二进制发行页面同时提供该附件。附件保存 FFmpeg、实际配置的外部库与传递来源、必要子模块、Rust 锁定来源、Opus 模型与生成输入、编译器运行时源码、完整上游构建脚本及补丁。`SOURCE-INPUTS.json` 记录原配方的主要 Git 来源索引；`SOURCE-BUNDLE.json` 记录经过目标条件与次级来源核对的实际收集清单。

本配置启用 `--enable-version3`，FFmpeg 报告 **LGPL version 3 or later**。`LICENSE.txt` 保留 FFmpeg LGPLv3 原文，发行物同时提供其引用的 GPLv3 条款。`notices/` 保留第三方原始许可、版权、作者材料和必要补充条款。外部库分别适用所属许可；清单把构建工具、锁定可选输入及实际目标库分别标注。

维护者从公开源码根目录运行 `python tools/media/prepare-sources.py --bundle --quiet` 生成对应源码附件，运行 `python tools/media/prepare-sources.py --check --quiet` 复核现有归档与必要输入。准备工具从公开保留的 `source-inputs/` 复制版本、配置、锁文件及构建依据。压缩归档完整读取、锁覆盖与原始文件对应性检查已通过；完整 FFmpeg 重构建及位级可复现性属于独立验证范围。

rav1e 的原始配方执行 `cargo update cc`。清单依据原锁与原始构建日志保留 `cc 1.10.0`、`find-msvc-tools 0.1.15` 和 `shlex 2.0.1`，同时保留 bindgen 使用的 `shlex 1.3.0`。`source-inputs/rav1e-lock-update.json` 说明重建锁的依据及范围。Rust 1.99.1 和 crosstool-NG 的版本同样来自原始构建记录。

FFmpeg 上游的[许可与分发说明](https://ffmpeg.org/legal.html)说明了 FFmpeg 和外部库的源码及声明要求。
