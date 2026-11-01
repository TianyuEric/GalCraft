# 教学角色立绘源文件

`white/`保留三名成年角色的白底全身原图，每人有neutral、smile、serious、surprised、shy、sad六种表达，尺寸为1024×1536。`expression-prompts.json`保留编辑提示。授权图像与提示使用CC BY 4.0，署名为TianyuEric / GalCraft contributors；见[许可范围](../../../LICENSING.md)。

采用的透明图位于`apps/studio/resources/practice/figures/`。作者使用BiRefNet工作流处理透明背景；原图保留尺寸及白色服饰。重新处理时，操作者提供自己的ComfyUI地址及可用工作流：

```powershell
node tools/artwork/rmbg-batch.mjs --input assets/generated/practice/white --output apps/studio/resources/practice/figures --workflow <your-workflow.json> --server <your-ComfyUI-address>
```

当前构建直接消费已有透明图。音乐、图像和影片的采用输入及来源位于`apps/studio/resources/practice/`。
