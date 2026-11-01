import { FileText } from 'lucide-react';
import type { DocumentView, SavePlan } from '@galcraft/contracts';
import { buildSaveChanges, compactSourceDiff, type SaveChangeGroup } from './save-changes.js';
import { names as fieldNames } from '../authoring/field-help.js';
import './save-changes.css';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table.js';
import './data-table.css';

export { readableFile, readableDocument } from './readable-files.js';

export function SaveChangeList({ files, locale, names = {}, documents = [], groups = buildSaveChanges(files,documents,names,locale), context = 'save' }: { files: SavePlan['files']; locale: string; names?: Record<string, string>; documents?: readonly DocumentView[]; groups?: SaveChangeGroup[]; context?: 'save' | 'adopt' | 'discard' }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const value = (item: unknown) => item === undefined ? t('未设置','Not set','未設定') : item === null ? t('空','Empty','空') : typeof item==='boolean' ? item?t('开启','On','オン'):t('关闭','Off','オフ') : typeof item==='string'?item:JSON.stringify(item);
  const displayedValue = (item: unknown) => {
    if (!item || typeof item !== 'object') return value(item);
    const label = Array.isArray(item) ? t(`${item.length} 项`, `${item.length} items`, `${item.length} 件`) : t('结构化内容', 'Structured content', '構造化された内容');
    return <details className="save-structured-value"><summary>{label}</summary><pre>{JSON.stringify(item, null, 2)}</pre></details>;
  };
  const field = (path: string) => path.split('.').map(key=>fieldNames[key]?.[locale==='en'?1:locale==='ja'?2:0]??({name:t('名称','Name','名前'),command:t('指令类型','Command type','コマンド種類'),variants:t('素材版本与目标验证','Asset versions and target verification','素材バージョンと対象検証'),activeVariantId:t('当前版本','Current version','現在のバージョン'),playerName:t('主角姓名','Player name','主人公名'),mode:t('模式','Mode','モード'),fixed:t('固定姓名','Fixed name','固定名'),enabled:t('启用','Enabled','有効')} as Record<string,string>)[key]??key).join(' / ');
  const operation = {add:t('新增','Add','追加'),delete:t('删除','Delete','削除'),move:t('移动','Move','移動'),update:t('更新','Update','更新'),source:t('源码修改','Source change','ソース変更')};
  return <ul className="save-change-list" aria-label={context === 'discard' ? t('本次放弃的修改', 'Changes to discard', '破棄する変更') : context === 'adopt' ? t('本次采用的修改', 'Changes to adopt', '採用する変更') : t('本次保存的修改', 'Changes to save', '保存する変更')}>
    {groups.map(group => <li key={group.documentId}>
      <FileText size={17} aria-hidden="true"/>
      <div><strong>{group.name}</strong>
        <div className="save-logical-changes">{group.changes.map((change,index)=><div className="save-logical-change" key={`${change.statementId??change.label}/${change.kind}/${index}`}>
          <span className="save-change-operation">{operation[change.kind]}</span><span>{change.label}</span>
          {change.kind==='move'&&<p>{t('位置','Position','位置')} {change.before} → {change.after}</p>}
          {!!change.fields?.length && <div className="save-fields-table gc-table-scroll"><Table aria-label={`${group.name} · ${change.label}`}>
            <TableHeader><TableRow><TableHead>{t('字段','Field','項目')}</TableHead><TableHead>{context === 'discard' ? t('放弃前','Before discard','破棄前') : context === 'adopt' ? t('采用前','Before adoption','採用前') : t('保存前','Before','変更前')}</TableHead><TableHead>{context === 'discard' ? t('放弃后','After discard','破棄後') : context === 'adopt' ? t('采用后','After adoption','採用後') : t('保存后','After','変更後')}</TableHead></TableRow></TableHeader>
            <TableBody>{change.fields.map(item=><TableRow key={item.field}><TableCell>{field(item.field)}</TableCell><TableCell><del>{displayedValue(item.before)}</del></TableCell><TableCell><ins>{displayedValue(item.after)}</ins></TableCell></TableRow>)}</TableBody>
          </Table></div>}
          {change.kind==='source'&&<details><summary>{t('查看原文差异','Source difference','ソースの差分')}</summary>{(()=>{const diff=compactSourceDiff(change.before??'',change.after??'');return <div className="save-source-diff"><pre><b>{t('保存前','Before','変更前')}</b>{'\n'}{diff.before||t('（空）','(empty)','（空）')}</pre><pre><b>{t('保存后','After','変更後')}</b>{'\n'}{diff.after||t('（空）','(empty)','（空）')}</pre></div>;})()}</details>}
        </div>)}</div>
        <details><summary>{t('查看文件位置', 'File locations', 'ファイルの場所')}</summary>{group.paths.map(path=><code key={path}>{path}</code>)}</details>
      </div>
      <span className="save-change-count">{group.changes.length} {t('项修改','changes','件の変更')}</span>
    </li>)}
  </ul>;
}
