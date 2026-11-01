# FFmpeg Windows x64 对应源码材料

本附件对应 BtbN `autobuild-2026-10-30-13-01` 的 `ffmpeg-n9.0.2-39-g7adfbe40dc-win64-lgpl-9.0.zip`。GalCraft 将其中的 `ffmpeg.exe` 与 `ffprobe.exe` 作为独立命令行进程调用。准备阶段逐字节核对两个 runtime 文件与该 ZIP 的原始成员；应用封装阶段可以添加发行签名。`build-inputs/binary-correspondence.json` 保存核对范围和文件大小。

## 附件内容

- `archives/` 保存 FFmpeg、本配置采用的外部库、传递源码及构建输入的上游归档。FFmpeg 源码固定为 `7adfbe40dcde598f93a6963d2f7b22cd75202ccc`，BtbN 配方固定为 `5031c6f1082414e53688d39e521849905071070d`。
- `SOURCE-INPUTS.json` 列出每个归档的来源、固定版本、用途、父组件、解包位置与许可补充来源。`ARCHIVES.json` 列出实际文件、大小、源码文件数和原始许可路径。归档保留其原始内容。
- `build-inputs/` 保存两个程序的版本、实际 configure 参数、原始 Cargo 锁文件、rav1e 重建锁、原始构建日志摘录和工具链来源依据。
- `NOTICES/` 保存原始许可、版权及作者材料，包括源码中的第三方声明。`supplemental/` 补充 crate 原包省略的上游许可；`license-texts/` 提供声明了 SPDX 标识但未附独立文本的 crate 所适用的完整条款。对应的原始 `Cargo.toml`、源码声明和作者信息保留在各组件目录与源码归档中。

清单用 `configured-library`、`transitive-library` 等用途区分实际配置及其传递来源，用 `build-input`、`synchronized-build-input` 和 `locked-crate-source` 标记保留的构建输入。完整 Rust 锁集合包含可选、测试及其他平台条目；这些条目属于锁定输入材料。GPL-only 编解码库、Linux-only 库、9.0 未采用的 libcurl 及其专属依赖没有列入目标库集合。FFmpeg 与完整编译器源码自身可以包含其他配置的代码和许可。

## 准备与检查

从 GalCraft 公开源码根目录运行 Python 3.11 或更新版本：

```sh
python tools/media/prepare-sources.py --bundle --quiet
python tools/media/prepare-sources.py --check --quiet
```

第一条命令从固定来源下载缺少的归档，复制公开保留的 `tools/media/source-inputs/` 与许可材料，完整读取压缩流，检查显式输入、锁依赖和文件清单，然后生成 `out/media-sources/ffmpeg-n9.0.2-39-g7adfbe40dc-win64-lgpl-9.0-sources.tar`。外层 TAR 保存已经压缩的上游归档。第二条命令复用本地归档执行检查；检查遇到缺项时返回非零退出码。

维护者把此 TAR 与对应的 NSIS、npm 二进制放在同一发行页面，并提供直接下载。维护者随对应二进制保留 `UPSTREAM.md`、`SOURCE-INPUTS.json`、`SOURCE-BUNDLE.json` 及 `notices/`。

## 构建依据

BtbN 归档中的 `scripts.d/`、`patches/`、`images/`、`variants/` 和 `addins/` 保存本配置的构建步骤、补丁、工具链配置与开关。上游入口为：

```sh
./makeimage.sh win64 lgpl 9.0
./build.sh win64 lgpl 9.0
```

维护者使用清单的固定源码恢复各阶段输入，并按 `parentComponent`、`unpackInto` 和 `nestedInputLocations` 将 Highway、Shaderc DEPS、GLib、Mbed TLS 等次级来源放到指定位置。原配方读取可变分支、容器标签和 Rust registry；构建该附件的固定版本时，维护者让 FFmpeg checkout 指向上述提交，让 rav1e 使用保存的 `rav1e-Cargo.resolved.lock`，并让 Cargo 从附件中的 `.crate` 来源恢复锁定输入。`build-inputs/ffmpeg-buildconf.txt` 给出对应程序的完整配置参数；GCC 16.2.0、Rust 1.99.1 和 crosstool-NG 的来源与配置同时保留。

原始 rav1e 配方执行 `cargo update cc`。原始构建日志记录 `cc 1.2.26 → 1.10.0`，新增 `find-msvc-tools 0.1.15` 和 `shlex 2.0.1`；bindgen 继续使用 `shlex 1.3.0`。附件按原锁与该记录重建 resolved lock，保留原锁及重建说明。上游删除了构建目录中的最终锁文件，因此附件对重建锁声明其来源与语义范围。

## 验证范围

本附件的验收覆盖固定来源收集、目标配方与嵌套输入核对、锁集合覆盖、原始二进制字节对应性、压缩归档完整读取和许可材料路径。完整 FFmpeg/工具链重构建及位级可复现性仍属于独立验证范围；本附件记录源码收集通过。
