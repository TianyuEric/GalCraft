# Studio 颜色控件来源

Studio 使用 Dice UI 的 [Color Picker](https://github.com/sadmann7/diceui/blob/main/docs/registry/bases/base/ui/color-picker.tsx) 与 [Visually Hidden Input](https://github.com/sadmann7/diceui/blob/main/docs/registry/bases/base/lib/visually-hidden-input.tsx)。取用日期为2026-10-18，原版权与MIT全文见 [DICE-LICENSE](DICE-LICENSE)。

Studio 将工具、Button、Popover和Select接到本地出口，以Base UI提供方向和输入原语，以Lucide提供图标。维护者负责复制源码与本地修改：颜色解析覆盖HEX、RGB、HSL/HSB及alpha，HSV保留浮点精度，受控同步保留用户回调边界，滑条提供可访问名称。

`StudioColorField`管理预览、取消和一次提交，协调格式输入、嵌套弹层与原生EyeDropper。颜色转换回归由Storybook相邻测试维护；正式页面与Story使用同一实现。
