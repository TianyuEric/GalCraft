export function readableFile(path: string, locale: string): string {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  if (/dependencies\.lock/.test(path)) return t('引擎与插件配置', 'Engine and plugins', 'エンジンとプラグイン');
  if (/assets\/index/.test(path)) return t('素材目录与引用', 'Asset catalog and references', '素材一覧と参照');
  if (/outline/.test(path)) return t('作品大纲', 'Project outline', '作品のあらすじ');
  if (/character/.test(path)) return t('角色与路线设定', 'Characters and routes', 'キャラクターとルート');
  if (/recipe/.test(path)) return t('AI 创作预设', 'AI creation presets', 'AI 創作プリセット');
  if (/variable/.test(path)) return t('剧情变量', 'Story variables', 'シナリオ変数');
  if (/^plugins\//.test(path)) return t('插件作品配置', 'Project plugin settings', '作品のプラグイン設定');
  if (/scenes\/.*\/scene\.json$/.test(path)) return t('场景名称与属性', 'Scene name and properties', 'シーンの名前と属性');
  if (/\.(?:galdsl|gal|dsl)$/.test(path) || /scenes\//.test(path)) return t('场景剧情与演出', 'Scene script and direction', 'シーンの台詞と演出');
  if (/\.(?:css|scss)$/.test(path)) return t('玩家页面样式', 'Player page styles', 'プレイヤーページのスタイル');
  if (/^(?:ui|templates?)\//.test(path)) return t('玩家页面布局与阅读设置', 'Player layout and reading settings', 'プレイヤーのレイアウトと読書設定');
  if (/project\.json$/.test(path)) return t('作品设置', 'Project settings', '作品設定');
  return path.split('/').at(-1) ?? path;
}

export function readableDocument(files: Record<string, string>, locale: string): string {
  for (const [path, raw] of Object.entries(files)) {
    if (!path.endsWith('.json')) continue;
    try {
      const data = JSON.parse(raw).data;
      if (typeof data?.name === 'string' && data.name.trim()) return data.name;
    } catch { /* A pending source edit can be invalid; retain its readable category. */ }
  }
  const path = Object.keys(files)[0];
  const title = path ? readableFile(path, locale) : '';
  if (title && title !== path?.split('/').at(-1)) return title;
  return locale === 'en' ? 'Project document' : locale === 'ja' ? '作品ドキュメント' : '作品文档';
}
