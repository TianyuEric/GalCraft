const messages: Record<string, [string, string]> = {
  "当前素材引用尚未载入": ["Current asset reference has not loaded", "現在の素材参照は未読込です"],
  "横向偏移": [
    "Horizontal offset",
    "横方向オフセット"
  ],
  "常用视觉属性": [
    "Common visual properties",
    "基本表示設定"
  ],
  "颜色": [
    "Color",
    "色"
  ],
  "拖动调整": [
    "Drag to adjust",
    "ドラッグで調整"
  ],
  "左右拖动快速调整；Esc 还原": [
    "Drag horizontally to adjust; Esc restores",
    "左右ドラッグで調整・Escで戻す"
  ],
  "请输入有效范围内的数值，或按 Esc 还原。": [
    "Enter a number within the valid range, or press Esc to restore.",
    "範囲内の数値を入力するか、Escで戻してください。"
  ],
  "减少": [
    "Decrease ",
    "減らす "
  ],
  "增加": [
    "Increase ",
    "増やす "
  ],
  "步进": [
    "step",
    "刻み"
  ],
  "还原": [
    "restore",
    "戻す"
  ],
  "编辑颜色": [
    "Edit color",
    "色を編集"
  ],
  "调整颜色": [
    "Adjust color",
    "色の調整"
  ],
  "含透明度": [
    "With alpha",
    "透明度あり"
  ],
  "RGB · 不含透明度": [
    "RGB · Opaque",
    "RGB・不透明"
  ],
  "饱和度与明度色板；也可在色值输入框精确输入": [
    "Saturation and brightness; exact values are available in the color input",
    "彩度と明度。色の値で正確に入力できます"
  ],
  "色相": [
    "Hue",
    "色相"
  ],
  "不透明度": [
    "Opacity",
    "不透明度"
  ],
  "颜色格式": [
    "Color format",
    "色の形式"
  ],
  "屏幕取色": [
    "Pick screen color",
    "画面から色を取得"
  ],
  "从屏幕选择颜色": [
    "Pick a color from the screen",
    "画面から色を選択"
  ],
  "当前环境不支持屏幕取色": [
    "Screen color picking is unavailable",
    "画面からの色取得は利用できません"
  ],
  "色值": [
    "Color value",
    "色の値"
  ],
  "颜色值": [
    "Color value",
    "色の値"
  ],
  "请输入完整的 HEX、RGB 或 HSL 色值。": [
    "Enter a complete HEX, RGB or HSL color.",
    "HEX、RGB、HSLの値をすべて入力してください。"
  ],
  "此字段只接受不透明颜色。": [
    "This field accepts opaque colors only.",
    "この項目では不透明な色のみ使用できます。"
  ],
  "实时预览 · Enter 或外点确认 · Esc 还原": [
    "Live preview · Enter or click outside to confirm · Esc restores",
    "即時プレビュー・Enterまたは外側をクリックして確定・Escで戻す"
  ],
  "当前环境不支持屏幕取色，可直接输入色值。": [
    "Screen picking is unavailable; enter a color value instead.",
    "画面からの色取得は利用できません。色の値を入力できます。"
  ],
  "取消": [
    "Cancel",
    "キャンセル"
  ],
  "确认颜色": [
    "Confirm color",
    "色を確定"
  ],
  "正在屏幕取色…": [
    "Picking a screen color…",
    "画面から色を取得中…"
  ],
  "已取色，可继续调整或确认。": [
    "Color picked. Adjust it further or confirm.",
    "色を取得しました。調整を続けるか確定できます。"
  ],
  "已取消取色，面板内的调整仍保留。": [
    "Screen picking cancelled; panel adjustments are retained.",
    "色取得をキャンセルしました。パネルの調整は保持されます。"
  ],
  "取色未完成，请重试或输入色值。": [
    "Color picking failed. Retry or enter a value.",
    "色を取得できませんでした。再試行するか値を入力してください。"
  ],
  "缩略图不可用": [
    "Thumbnail unavailable",
    "サムネイルなし"
  ],
  "选择背景素材": [
    "Choose background asset",
    "背景素材を選択"
  ],
  "搜索背景素材": [
    "Search background assets",
    "背景素材を検索"
  ],
  "搜索名称或路径…": [
    "Search names or paths…",
    "名前・パスを検索…"
  ],
  "正在读取项目对象，当前选择保留。": [
    "Loading project assets; current selection is retained.",
    "素材を読み込み中。現在の選択は保持されます。"
  ],
  "项目对象读取失败，当前选择保留。": [
    "Failed to load project assets; current selection is retained.",
    "素材を読み込めませんでした。現在の選択は保持されます。"
  ],
  "重试读取": [
    "Retry",
    "再試行"
  ],
  "项目中暂无可选背景素材。": [
    "No background assets are available.",
    "選択できる背景素材がありません。"
  ],
  "没有匹配项。试试名称的一部分，或": [
    "No matches. Try part of a name, or ",
    "該当なし。名前の一部で検索するか、"
  ],
  "清除搜索": [
    "Clear search",
    "検索をクリア"
  ],
  "版本": [
    "Revision",
    "リビジョン"
  ],
  "素材选择服务不可用": [
    "Asset selection service is unavailable",
    "素材選択サービスを利用できません"
  ],
  "精确版本不可用": [
    "Referenced version is unavailable",
    "参照バージョンがありません"
  ],
  "显示前100项，请搜索缩小范围或打开完整素材库。": [
    "Showing the first 100 results. Search to narrow them or open the full library.",
    "最初の100件を表示しています。検索を絞るか素材ライブラリを開いてください。"
  ],
  "浏览与导入素材": [
    "Browse and import assets",
    "素材の参照・読み込み"
  ],
  "作品对象": [
    "Project objects",
    "作品のオブジェクト"
  ],
  "重命名": [
    "Rename",
    "名前を変更"
  ],
  "确认重命名": [
    "Confirm rename",
    "名前変更を確定"
  ],
  "折叠": [
    "Collapse",
    "折りたたむ"
  ],
  "展开": [
    "Expand",
    "展開"
  ],
  "未保存": [
    "Unsaved",
    "未保存"
  ],
  "打开场景": [
    "Open scene",
    "場面を開く"
  ],
  "移动到": [
    "Move to",
    "移動先"
  ],
  "操作": [
    "Actions",
    "操作"
  ],
  "已选": [
    "Selected",
    "選択済み"
  ],
  "项": [
    "items",
    "件"
  ],
  "隐藏": [
    "hidden",
    "非表示"
  ],
  "其中": [
    "including",
    "うち"
  ],
  "项不在当前结果": [
    "items outside the current results",
    "件は現在の結果に含まれません"
  ],
  "没有匹配的章节或场景。": [
    "No matching chapters or scenes.",
    "該当する章や場面がありません。"
  ],
  "清除筛选": [
    "Clear filter",
    "絞り込みを解除"
  ]
};
export function editorText(text: string, locale = "zh-CN") {
  return messages[text]?.[locale === "ja" ? 1 : 0] && (locale === "en" || locale === "ja") ? messages[text]![locale === "ja" ? 1 : 0] : text;
}
