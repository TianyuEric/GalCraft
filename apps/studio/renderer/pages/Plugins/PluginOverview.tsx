import type { PluginManifest } from '@galcraft/plugins';
import { pluginDisplayMetadata } from '@galcraft/plugins/contracts';
import { Badge } from '../../components/controls.js';
import './plugin-overview.css';

const kinds: Record<string, [string, string, string]> = {
  condition:['剧情条件','Story conditions','シナリオ条件'], component:['界面组件','UI components','UI部品'], system:['运行系统','Runtime systems','実行システム'], platform:['平台能力','Platform capabilities','プラットフォーム機能'], workbench:['独立工作台','Dedicated workspace','専用ワークスペース'], form:['编辑表单','Editor forms','編集フォーム'], dialog:['专用对话框','Specialized dialogs','専用ダイアログ'],
  command:['剧情指令','Story commands','シナリオ命令'], assetType:['素材类型','Asset types','素材の種類'], resource:['资源处理','Resource handling','リソース処理'],
  stage:['舞台演出','Stage rendering','舞台描画'], assetEditor:['素材编辑','Asset editing','素材編集'], assetPreview:['素材预览','Asset previews','素材プレビュー'], assetThumbnail:['素材缩略图','Asset thumbnails','素材サムネイル'],
  productionOperation:['制作操作','Production operations','制作操作'], productionEditor:['制作编辑器','Production editor','制作エディター'],
  inspector:['属性编辑','Properties','プロパティ編集'], panel:['工作区面板','Workspace panels','ワークスペースパネル'], toolbar:['工具栏操作','Toolbar actions','ツールバー操作'],
  document:['作品文档','Project documents','作品文書'], tool:['制作工具','Production tools','制作ツール'], page:['页面组件','Page components','ページ部品'],
  expression:['剧情表达式','Story expressions','シナリオ式'], generationProvider:['生成服务','Generation services','生成サービス'], textPreparation:['文字准备','Text preparation','テキスト準備'], resourceProcessor:['资源处理','Resource processing','リソース処理'], fieldEditor:['专用字段编辑','Specialized fields','専用フィールド編集'], publishCheck:['发行检查','Release checks','配布確認'],
};
export function pluginCapabilityLabel(kind: string, locale: string) { const labels = kinds[kind]; return labels ? labels[locale === 'en' ? 1 : locale === 'ja' ? 2 : 0] : kind; }
export function PluginOverview({ manifest, enabledVersion, studioService = false, locale }: { manifest: PluginManifest; enabledVersion?: string; studioService?: boolean; locale: string }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const capabilities = Array.from(new Set([...manifest.contributions, ...(manifest.studio ?? [])].map(item => item.kind)));
  const display = pluginDisplayMetadata(manifest, locale);
  return <section className="plugin-overview" aria-label={t('插件用途与作品状态', 'Plugin purpose and project status', 'プラグインの用途と作品の状態')}>
    <div className="plugin-overview-identity"><h2>{display.name}</h2><span>{manifest.version}</span><Badge tone={!studioService && enabledVersion === manifest.version ? 'good' : ''}>{studioService ? t('Studio 默认装配', 'Provided by Studio', 'Studio 標準搭載') : enabledVersion === manifest.version ? t('作品已启用', 'Enabled in project', '作品で有効') : enabledVersion ? t(`作品使用 ${enabledVersion}`, `Project uses ${enabledVersion}`, `作品で ${enabledVersion} を使用`) : t('作品未启用', 'Not enabled in project', '作品で無効')}</Badge></div>
    <p>{display.description}</p>
    <dl><dt>{t('支持目标', 'Targets', '対象')}</dt><dd>{manifest.targets.join(' / ')}</dd><dt>{t('提供能力', 'Capabilities', '提供機能')}</dt><dd>{capabilities.length ? capabilities.map(kind => pluginCapabilityLabel(kind, locale)).join(' · ') : t('此包未声明贡献能力', 'No contributions declared by this package', 'このパッケージに機能の宣言はありません')}</dd></dl>
    <p className="plugin-overview-next">{studioService ? t('Studio 随应用提供此服务，制作时按需加载。在“制作 → 服务连接”中配置连接。', 'Studio provides this service and loads it on demand. Configure a connection in Production → Service connections.', 'Studio が標準提供し、制作時に必要に応じて読み込みます。「制作 → サービス接続」で接続を設定します。') : t('启用、停用或切换版本前，先审阅对当前作品及依赖的影响；确认后更新工作内容，保存后保留精确版本。', 'Review the impact on this project and its dependencies before enabling, disabling or changing versions. Confirm to update working content; save to persist the exact version.', '有効化・無効化・バージョン変更の前に作品と依存関係への影響を確認します。確定後に作業内容を更新し、保存して正確なバージョンを保持します。')}</p>
  </section>;
}
