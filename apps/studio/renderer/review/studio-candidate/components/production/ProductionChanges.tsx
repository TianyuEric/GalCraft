import { FileText } from 'lucide-react';
import { compactSourceDiff, type SaveChangeGroup } from '../../../../components/save-changes.js';
import { names as fieldNames } from '../../../../authoring/field-help.js';
import { CandidateSection } from '../controls/index.js';
import { ProductionCode, ProductionDisclosure, ProductionStatus, productionText } from './ProductionControls.js';

export function ProductionChanges({ groups, locale, context }: { groups: SaveChangeGroup[]; locale: string; context: 'adopt' | 'save' }) {
  const t = (zh: string, en: string, ja: string) => productionText(locale, zh, en, ja);
  const title = context === 'adopt' ? t('本次采用的修改', 'Changes to adopt', '採用する変更') : t('本次保存的修改', 'Changes to save', '保存する変更');
  const beforeLabel = context === 'adopt' ? t('采用前', 'Before adoption', '採用前') : t('保存前', 'Before', '変更前');
  const afterLabel = context === 'adopt' ? t('采用后', 'After adoption', '採用後') : t('保存后', 'After', '変更後');
  const operations = { add: t('新增', 'Add', '追加'), delete: t('删除', 'Delete', '削除'), move: t('移动', 'Move', '移動'),
    update: t('更新', 'Update', '更新'), source: t('源码修改', 'Source change', 'ソース変更') };
  const names: Record<string, string> = {
    name: t('名称', 'Name', '名前'), command: t('指令类型', 'Command type', 'コマンド種類'),
    variants: t('素材版本与目标验证', 'Asset versions and target verification', '素材バージョンと対象検証'),
    activeVariantId: t('当前版本', 'Current version', '現在のバージョン'),
    playerName: t('主角姓名', 'Player name', '主人公名'), mode: t('模式', 'Mode', 'モード'),
    fixed: t('固定姓名', 'Fixed name', '固定名'), enabled: t('启用', 'Enabled', '有効'),
  };
  const displayName = (path: string) => path.split('.').map(key => fieldNames[key]?.[locale === 'en' ? 1 : locale === 'ja' ? 2 : 0] ?? names[key] ?? key).join(' / ');
  const value = (item: unknown) => {
    if (item === undefined) return t('未设置', 'Not set', '未設定');
    if (item === null) return t('空', 'Empty', '空');
    if (typeof item === 'boolean') return item ? t('开启', 'On', 'オン') : t('关闭', 'Off', 'オフ');
    if (typeof item === 'object') return <ProductionDisclosure>
      {Array.isArray(item) ? t(`${item.length} 项`, `${item.length} items`, `${item.length} 件`) : t('结构化内容', 'Structured content', '構造化された内容')}
      <pre>{JSON.stringify(item, null, 2)}</pre>
    </ProductionDisclosure>;
    return String(item);
  };
  return <div className="candidate-production-changes" aria-label={title}>
    {groups.map(group => <CandidateSection key={group.documentId} title={<><FileText size={14} aria-hidden="true"/>{group.name}</>}
      actions={<ProductionStatus>{group.changes.length} {t('项修改', 'changes', '件の変更')}</ProductionStatus>}>
      {group.changes.map((change, index) => {
        const source = change.kind === 'source' ? compactSourceDiff(change.before ?? '', change.after ?? '') : null;
        return <article key={`${change.statementId ?? change.label}/${change.kind}/${index}`}>
          <header><ProductionStatus>{operations[change.kind]}</ProductionStatus><strong>{change.label}</strong></header>
          {change.kind === 'move' && <p>{t('位置', 'Position', '位置')} {change.before} → {change.after}</p>}
          {!!change.fields?.length && <div className="candidate-production-table-scroll">
            <table aria-label={`${group.name} · ${change.label}`}>
              <thead><tr><th scope="col">{t('字段', 'Field', '項目')}</th><th scope="col">{beforeLabel}</th><th scope="col">{afterLabel}</th></tr></thead>
              <tbody>{change.fields.map(item => <tr key={item.field}>
                <th scope="row">{displayName(item.field)}</th><td>{value(item.before)}</td><td>{value(item.after)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {source && <ProductionDisclosure>
            <span>{t('查看原文差异', 'Source difference', 'ソースの差分')}</span>
            <div className="candidate-production-source-diff">
              <section><h3>{beforeLabel}</h3><ProductionCode locale={locale} language="text" code={source.before || t('（空）', '(empty)', '（空）')}/></section>
              <section><h3>{afterLabel}</h3><ProductionCode locale={locale} language="text" code={source.after || t('（空）', '(empty)', '（空）')}/></section>
            </div>
          </ProductionDisclosure>}
        </article>;
      })}
      <ProductionDisclosure><span>{t('查看文件位置', 'File locations', 'ファイルの場所')}</span>
        {group.paths.map(path => <code key={path}>{path}</code>)}
      </ProductionDisclosure>
    </CandidateSection>)}
  </div>;
}
