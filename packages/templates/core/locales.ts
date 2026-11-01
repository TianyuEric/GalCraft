import { playerLocaleRows } from './locale-data.js';

export type OfficialLocale = 'zh-CN' | 'en' | 'ja';
export type LocaleResource = { schemaVersion: 1; locale: OfficialLocale; strings: Record<string, string> };

const extraRows: readonly (readonly [string, string, string, string])[] = [
  ['reading.styles','阅读状态样式','Reading state styles','既読・未読のスタイル'],
  ['reading.unread','未读正文','Unread text','未読の本文'],
  ['reading.read','已读正文','Read text','既読の本文'],
  ['reading.inherit','继承正文基础样式','Inherit body style','本文の基本スタイルを継承'],
  ['reading.font','字体','Font','フォント'],
  ['reading.size','字号（留空继承）','Size (blank inherits)','文字サイズ（空欄は継承）'],
  ['reading.color','文字颜色','Text color','文字色'],
  ['reading.custom','自定义','Custom','指定する'],
  ['reading.bold','粗体','Bold','太字'],
  ['reading.italic','斜体','Italic','斜体'],
  ['reading.on','启用','On','有効'],
  ['reading.off','关闭','Off','無効'],
  ['reading.reset','恢复继承','Restore inheritance','継承に戻す'],
  ['reading.help','未覆盖项继承正文；台词局部强调优先，玩家字号缩放继续生效。','Unset fields inherit the body style. Local emphasis takes priority; player text scaling still applies.','未指定の項目は本文から継承します。台詞内の強調を優先し、プレイヤーの文字倍率も適用します。'],
  ['reading.preview','雨停了，影院的灯还亮着。','The rain stopped. The cinema lights are still on.','雨はやみました。映画館の灯りはまだついています。'],
  ['reading.applying','正在应用阅读样式…','Applying reading styles…','スタイルを適用中…'],
  ['gallery.auxiliary','辅助栏','Navigation bars','補助バー'],
  ['action.loading','正在读取…','Loading…','読込中…'],
  ['settings.wheelUp','滚轮向上','Wheel up','ホイール上'],
  ['settings.wheelDown','滚轮向下','Wheel down','ホイール下'],
  ['settings.rightButton','鼠标右键','Right mouse button','マウス右ボタン'],
  ['page.title', '标题', 'Title', 'タイトル'],
  ['page.story', '剧情', 'Story', 'ストーリー'],
  ['page.choice', '选择', 'Choice', '選択肢'],
  ['page.input', '输入', 'Input', '入力'],
  ['page.save', '保存', 'Save', 'セーブ'],
  ['page.load', '读取', 'Load', 'ロード'],
  ['page.history', '历史', 'History', 'バックログ'],
  ['page.settings', '设置', 'Settings', '設定'],
  ['page.cg', 'CG鉴赏', 'CG Gallery', 'CG鑑賞'],
  ['page.music', '音乐鉴赏', 'Music Gallery', '音楽鑑賞'],
  ['page.flow', '剧情流程', 'Story Flow', 'ストーリーフロー'],
  ['page.characters', '后日谈', 'Afterstories', '後日談'],
  ['page.relations', '角色关系', 'Relationships', 'キャラクター関係'],
  ['page.confirm', '确认', 'Confirm', '確認'],
  ['page.error', '错误', 'Error', 'エラー'],
  ['page.dataImport', '资料导入', 'Data Import', 'データのインポート'],
  ['page.dataClear', '资料清理', 'Clear Data', 'データの削除'],
  ['page.emergency', '紧急回避', 'Emergency Hide', '緊急回避'],
  ['page.videoError', '视频播放失败', 'Video Playback Failed', '動画の再生に失敗しました'],
  ['toolbar.reveal', '显示工具栏', 'Show Toolbar', 'ツールバーを表示'],
  ['history.jump', '返回此处', 'Return Here', 'ここに戻る'],
  ['restore.mapping', '此入口使用以下映射：', 'This entry uses the following mappings:', 'このエントリには次の対応付けが適用されます：'],
  ['restore.mappingConfirm', '确认映射并读取？', 'Accept these mappings and load?', '対応付けを確認してロードしますか？'],
  ['action.select', '选择', 'Select', '選択'],
  ['flow.zoomIn', '放大', 'Zoom In', '拡大'],
  ['flow.zoomOut', '缩小', 'Zoom Out', '縮小'],
  ['flow.fit', '适应画面', 'Fit View', '全体表示'],
];

const rows = [...playerLocaleRows, ...extraRows];

export function officialLocaleResources(): Record<OfficialLocale, LocaleResource> {
  const resources: Record<OfficialLocale, LocaleResource> = {
    'zh-CN': { schemaVersion: 1, locale: 'zh-CN', strings: {} },
    en: { schemaVersion: 1, locale: 'en', strings: {} },
    ja: { schemaVersion: 1, locale: 'ja', strings: {} },
  };
  for (const [key, zh, en, ja] of rows) {
    resources['zh-CN'].strings[key] = zh;
    resources.en.strings[key] = en;
    resources.ja.strings[key] = ja;
  }
  return resources;
}

function parameters(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map(match => match[1]!).sort();
}

export function validateLocaleResources(resources: Record<string, LocaleResource>): string[] {
  const baseline = resources['zh-CN']?.strings;
  if (!baseline) return ['zh-CN: missing resource'];
  const issues: string[] = [];
  const keys = Object.keys(baseline);
  for (const locale of ['zh-CN', 'en', 'ja'] as const) {
    const strings = resources[locale]?.strings;
    if (!strings) { issues.push(`${locale}: missing resource`); continue; }
    for (const key of keys) {
      const value = strings[key];
      if (!value?.trim()) { issues.push(`${locale}:${key}: missing or empty`); continue; }
      if (JSON.stringify(parameters(value)) !== JSON.stringify(parameters(baseline[key]!)))
        issues.push(`${locale}:${key}: parameter mismatch`);
    }
    for (const key of Object.keys(strings)) if (!Object.hasOwn(baseline, key)) issues.push(`${locale}:${key}: unknown key`);
  }
  return issues;
}

export function playerText(
  locales: Record<string, Record<string, string>>,
  locale: string,
  key: string,
  values: Record<string, string | number> = {},
): { text: string; resolvedLocale: string; fallback: boolean } {
  const selected = locales[locale]?.[key];
  const text = selected || locales['zh-CN']?.[key] || key;
  const resolvedLocale = selected ? locale : 'zh-CN';
  return { text: text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token), resolvedLocale, fallback: !selected };
}
