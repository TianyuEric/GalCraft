# 发行字体

`node tools/fonts/prepare.mjs` 从固定 Noto CJK 提交取得 SC/JP 完整字体、原始许可和声明，存入忽略目录 `cache/`。`tools/package-engine.mjs` 将它们放进引擎的两种目标运行包；独立 Player 不需要系统安装这些字体。

静态子集工具需要 Python 3.12，以及 `fonttools==4.61.1`、`brotli==1.2.0`：

```powershell
python -m pip install --target tools/fonts/deps fonttools==4.61.1 brotli==1.2.0
$env:GALCRAFT_FONT_PYTHON = '完整的 Python 可执行文件路径'
```

Studio 在构建检查阶段执行 `subset.py`。工具不可用时，检查返回字体处理错误，完整字体模式仍可使用。子集保留许可元数据，修改字体名称为 GalCraft Static，完整中日文字体作为动态文字回退随包携带。

上游：[Noto CJK](https://github.com/notofonts/noto-cjk)、[fontTools subset](https://fonttools.readthedocs.io/en/stable/subset/)。
