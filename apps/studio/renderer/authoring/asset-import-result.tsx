import { Button } from '../components/controls.js';
import { assetFileName, type AssetImportResult } from './asset-import-model.js';
import './asset-feedback.css';

export function AssetImportSummary({ result, locale, busy = false, retry, dismiss }: {
  result: AssetImportResult; locale: string; busy?: boolean; retry?: () => void; dismiss(): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return <section className="asset-import-result" aria-label={t('素材导入结果', 'Asset import results', '素材の読込結果')}>
    <div className="asset-import-heading">
      <div role="status"><h2>{t('导入结果', 'Import results', '読込結果')}</h2>
        <p>{t(`已导入 ${result.succeeded} 项 · 未导入 ${result.failed.length} 项`, `${result.succeeded} imported · ${result.failed.length} failed`, `${result.succeeded} 件を追加 · ${result.failed.length} 件が失敗`)}</p></div>
      <div className="gc-actions">
        {!!result.failed.length && retry && <Button disabled={busy} onClick={retry}>{busy ? t('正在导入…', 'Importing…', '読込中…') : t('重试未导入项', 'Retry failed files', '失敗したファイルを再試行')}</Button>}
        <Button tone="quiet" disabled={busy} onClick={dismiss}>{t('关闭结果', 'Dismiss results', '結果を閉じる')}</Button>
      </div>
    </div>
    {!!result.succeeded && <p className="asset-result-help">{t('成功导入的素材已在素材库中，可以继续选用。', 'Imported assets are available in the library and ready to use.', '追加した素材は素材ライブラリで使用できます。')}</p>}
    {!!result.failed.length && <ul className="asset-import-failures" aria-label={t('未导入文件', 'Failed files', '失敗したファイル')}>
      {result.failed.map((item, index) => <li key={`${item.path}:${index}`}>
        <strong>{assetFileName(item.path)}</strong><p className="asset-import-reason">{item.reason}</p>
        <details><summary>{t('查看文件路径', 'File path', 'ファイルパス')}</summary><code>{item.path}</code></details>
      </li>)}
    </ul>}
  </section>;
}
