import { useEffect, useRef, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import type { AuthorDocument, AuthorDocumentEntry, AuthorContributionServices } from '../../../../pages/Plugins/author-contributions.js';
import { CandidateButton, CandidateField, CandidateInput, CandidateMenuButton, CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../controls/index.js';

const typeId = (type: AuthorDocumentEntry) => `${type.pluginId}/${type.definition.key}`;

export function CandidatePluginDocuments({ services, locale, missing, sourceVersion, onOpen }: {
  services?: AuthorContributionServices;
  locale: string;
  missing: readonly { documentId: string; name: string; pluginId: string }[];
  sourceVersion: string;
  onOpen(document: AuthorDocument, type: AuthorDocumentEntry): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const types = services?.documentTypes() ?? [];
  const [selection, setSelection] = useState('');
  const [listed, setListed] = useState<{ key: string; services: AuthorContributionServices; items: AuthorDocument[] }>();
  const [revision, reload] = useState(0);
  const [name, setName] = useState('');
  const [remove, setRemove] = useState<AuthorDocument>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const type = types.find(item => typeId(item) === selection) ?? types[0];
  const key = type && typeId(type);
  const currentType = useRef(type);
  currentType.current = type;
  const items = listed?.key === key && listed?.services === services ? listed?.items : undefined;

  useEffect(() => {
    const entry = currentType.current;
    if (!services || !entry) return;
    let active = true;
    setLoading(true);
    setError('');
    void services.documents.list(entry).then(result => {
      if (!active) return;
      if (result.ok) setListed({ key: typeId(entry), services, items: result.value });
      else setError(result.error.message);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [services, key, revision, sourceVersion]);

  const run = async (action: () => ReturnType<AuthorContributionServices['documents']['create']>, done?: () => void) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (!result.ok) throw new Error(result.error.message);
      done?.();
      reload(value => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  if (!services || (!types.length && !missing.length)) return null;
  return <CandidateSection title={t('插件文档', 'Plugin documents', 'プラグイン文書')} className="candidate-plugin-documents">
    {error && !remove && <CandidateState kind="error" title={error} action={<CandidateButton disabled={busy} onClick={() => reload(value => value + 1)}>{t('重新读取', 'Reload', '再読込')}</CandidateButton>}/>}
    {type && <form className="candidate-plugin-document-form" onSubmit={event => {
      event.preventDefault();
      if (name.trim() && items && !(type.definition.instances === 'fixed' && items.length)) {
        void run(() => services.documents.create(type, name.trim()), () => setName(''));
      }
    }}>
      <CandidateField label={t('文档类型', 'Document type', '文書の種類')}>
        <CandidateSelect value={key} disabled={busy} onValueChange={setSelection}>
          {types.map(item => <option key={typeId(item)} value={typeId(item)}>{item.title}</option>)}
        </CandidateSelect>
      </CandidateField>
      <CandidateField label={t('新文档名称', 'New document name', '新しい文書名')}>
        <CandidateInput value={name} onChange={event => setName(event.target.value)} disabled={busy}/>
      </CandidateField>
      <CandidateButton type="submit" variant="outline" density="standard" disabled={busy || loading || !items || !name.trim() || type.definition.instances === 'fixed' && !!items.length}>
        <Plus size={14} aria-hidden="true"/>{t('创建文档', 'Create document', '文書を作成')}
      </CandidateButton>
    </form>}
    {type && loading && !items && <CandidateState kind="loading" title={t('正在读取插件文档', 'Loading plugin documents', 'プラグイン文書を読込中')}/>}
    {type && !loading && items?.length === 0 && <CandidateState kind="empty" title={t('此类型还没有文档', 'No documents of this type', 'この種類の文書はありません')}/>}
    {type && items?.map(item => <CandidateObjectRow key={item.documentId} icon={<FileText size={14}/>} title={item.name}
      metadata={type.title} onActivate={() => onOpen(item, type)}
      actions={<CandidateMenuButton label={t(`${item.name} 操作`, `Actions for ${item.name}`, `${item.name} の操作`)} disabled={busy} actions={[
        { id: 'edit', label: t('编辑', 'Edit', '編集'), run: () => onOpen(item, type) },
        ...(type.definition.instances === 'fixed' ? [] : [{ id: 'copy', label: t('复制', 'Copy', 'コピー'), run: () => void run(() => services.documents.copy(item, `${item.name} ${t('副本', 'copy', 'コピー')}`)) }]),
        { id: 'remove', label: t('移除', 'Remove', '削除'), danger: true, run: () => { setError(''); setRemove(item); } },
      ]}>{t('操作', 'Actions', '操作')}</CandidateMenuButton>}/>)}
    {!!missing.length && <CandidateSection title={t('缺少文档提供者', 'Document provider missing', '文書の提供元がありません')}>
      <p>{t('作品已保留下列文档。安装并启用对应版本后可继续编辑。', 'The project retains these documents. Install and enable the matching version to edit them.', '文書は作品に保持されています。対応するバージョンを導入し、有効化すると編集できます。')}</p>
      <ul className="candidate-plugin-missing-documents">{missing.map(item => <li key={item.documentId}>{item.name} <small>{item.pluginId}</small></li>)}</ul>
    </CandidateSection>}
    <CandidateReviewDialog open={!!remove} title={t('移除插件文档', 'Remove plugin document', 'プラグイン文書を削除')}
      description={remove?.name} busy={busy} onDismiss={() => setRemove(undefined)}
      actions={<CandidateToolbar label={t('文档操作', 'Document actions', '文書操作')}>
        <CandidateButton disabled={busy} onClick={() => setRemove(undefined)}>{t('取消', 'Cancel', 'キャンセル')}</CandidateButton>
        <CandidateButton variant="danger" disabled={busy} onClick={() => remove && void run(() => services.documents.remove(remove), () => setRemove(undefined))}>
          {t('移除此文档', 'Remove this document', 'この文書を削除')}
        </CandidateButton>
      </CandidateToolbar>}>
      <p>{t('应用后可通过统一撤销恢复；统一保存后写入磁盘。', 'Undo the change through the project history or save to persist it.', '作品の履歴から元に戻せます。保存するとディスクに書き込みます。')}</p>
      {error && remove && <CandidateState kind="error" title={error}/>}
    </CandidateReviewDialog>
  </CandidateSection>;
}
