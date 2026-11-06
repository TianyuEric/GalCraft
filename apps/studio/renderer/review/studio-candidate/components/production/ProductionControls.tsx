import { Children, createContext, isValidElement, useContext, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Eye, EyeOff, GripHorizontal, Plus, Search } from 'lucide-react';
import {
  CandidateButton, CandidateField, CandidateIconButton, CandidateInput, CandidateObjectRow, CandidateReviewDialog,
  CandidateSection, CandidateSelect, CandidateState, CandidateDockTab, CandidateDockTabList, CandidateToolbar,
} from '../controls/index.js';
import type { ProductionCreateEntry } from '../../../../pages/Production/ProductionCreateMenu.js';

export const ProductionLocale = createContext('zh-CN');
export const productionText = (locale: string, zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;

export function ProductionChoice({ label, value, options, onChange, locale: localeOverride, ...props }: {
  label: string;
  value: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  onChange(value: string): void;
  locale?: string;
} & Omit<ComponentProps<typeof CandidateSelect>, 'children' | 'value' | 'onValueChange'>) {
  const inheritedLocale = useContext(ProductionLocale);
  const locale = localeOverride ?? inheritedLocale;
  const searchLabel = options.length >= 10 ? productionText(locale, `搜索${label}`, `Search ${label}`, `${label}を検索`) : undefined;
  return <CandidateSelect {...props} aria-label={props['aria-label'] ?? label} value={value} onValueChange={onChange}
    placeholder={label} searchLabel={searchLabel}>
    {options.map((option, index) => <option key={`${option.value}:${index}`} value={option.value} disabled={option.disabled}>{option.label}</option>)}
  </CandidateSelect>;
}

export function ProductionField({ name, help, required, className, ...props }: ComponentProps<typeof CandidateField> & {
  name?: string; help?: ReactNode; required?: boolean;
}) {
  return <CandidateField {...props} hint={help ?? props.hint} data-field={name} data-required={required || undefined} className={className}/>;
}

export function ProductionStatus({ children, tone, source }: { children: ReactNode; tone?: string; source?: string }) {
  return <small className="candidate-production-status" data-tone={tone || undefined} data-source={source}>{children}</small>;
}

export function ProductionEmpty({ title, detail }: { title: string; detail: string; children?: ReactNode }) {
  return <CandidateState kind="empty" title={title} description={detail}/>;
}

export function ProductionDisclosure({ children, open, onOpenChange, className }: {
  children: ReactNode; open?: boolean; onOpenChange?(open: boolean): void; className?: string;
}) {
  const [title, ...body] = Children.toArray(children);
  if (open === undefined) return <CandidateSection title={title} collapsible initiallyOpen={false}
    className={['candidate-production-disclosure', className].filter(Boolean).join(' ')}>{body}</CandidateSection>;
  return <section className={['gc-candidate-section', 'candidate-production-disclosure', className].filter(Boolean).join(' ')}>
    <details open={open} onToggle={event => { if (event.currentTarget.open !== open) onOpenChange?.(event.currentTarget.open); }}>
      <summary className="gc-candidate-section-heading"><ChevronRight size={14} aria-hidden="true"/><span>{title}</span></summary>
      <div className="gc-candidate-section-content">{body}</div>
    </details>
  </section>;
}

type ConfirmationAction = { label: string; tone?: 'primary' | 'danger'; run(): void | Promise<void> };

export function ProductionConfirm({ title, description, cancelLabel, actions, onClose }: {
  title: string; description: ReactNode; cancelLabel: string; actions: ConfirmationAction[]; onClose(): void;
}) {
  const cancel = useRef<HTMLButtonElement>(null), running = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dismiss = () => { if (!running.current) onClose(); };
  const confirm = async (action: ConfirmationAction) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try { await action.run(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { running.current = false; setBusy(false); }
  };
  return <CandidateReviewDialog open title={title} description={description} initialFocus={cancel} onDismiss={dismiss} actions={<>
    <CandidateButton variant="outline" density="standard" ref={cancel} disabled={busy} onClick={dismiss}>{cancelLabel}</CandidateButton>
    {actions.map(action => <CandidateButton key={action.label} density="standard" variant={action.tone ?? 'outline'}
      disabled={busy} onClick={() => void confirm(action)}>{action.label}</CandidateButton>)}
  </>}>
    {error && <p role="alert" className="candidate-production-error">{error}</p>}
  </CandidateReviewDialog>;
}

export function ProductionDialog({ title, children, actions, close }: { title: string; children: ReactNode; actions?: ReactNode; close(): void }) {
  const locale = useContext(ProductionLocale);
  const items = Children.toArray(children);
  const last = items.at(-1);
  const footer = isValidElement<{ className?: string; children?: ReactNode }>(last) && last.type === 'footer' ? last : null;
  return <CandidateReviewDialog open title={title} onDismiss={close}
    actions={actions ?? footer?.props.children ?? <CandidateButton variant="outline" density="standard" onClick={close}>{productionText(locale, '关闭', 'Close', '閉じる')}</CandidateButton>}>
    {footer ? items.slice(0, -1) : items}
  </CandidateReviewDialog>;
}

export function ProductionPagination({ total, page, pageSize, onPageChange, locale, label, disabled = false }: {
  total: number; page: number; pageSize: number; onPageChange(page: number): void; locale: string; label: string; disabled?: boolean;
}) {
  const pages = Math.ceil(total / pageSize), current = Math.max(0, Math.min(page, pages - 1));
  const t = (zh: string, en: string, ja: string) => productionText(locale, zh, en, ja);
  if (pages <= 1) return null;
  return <nav className="candidate-production-pagination" aria-label={label}>
    <small>{current * pageSize + 1}–{Math.min(total, (current + 1) * pageSize)} / {total}</small>
    <CandidateToolbar label={label}>
      <CandidateIconButton label={t('首页', 'First page', '最初のページ')} disabled={disabled || current === 0} onClick={() => onPageChange(0)}><ChevronsLeft size={14}/></CandidateIconButton>
      <CandidateIconButton label={t('上一页', 'Previous page', '前のページ')} disabled={disabled || current === 0} onClick={() => onPageChange(current - 1)}><ChevronLeft size={14}/></CandidateIconButton>
      <small aria-live="polite">{current + 1} / {pages}</small>
      <CandidateIconButton label={t('下一页', 'Next page', '次のページ')} disabled={disabled || current === pages - 1} onClick={() => onPageChange(current + 1)}><ChevronRight size={14}/></CandidateIconButton>
      <CandidateIconButton label={t('末页', 'Last page', '最後のページ')} disabled={disabled || current === pages - 1} onClick={() => onPageChange(pages - 1)}><ChevronsRight size={14}/></CandidateIconButton>
    </CandidateToolbar>
  </nav>;
}

type DirectoryItem = { id: string; name: string; icon?: ReactNode; detail?: ReactNode };
export function ProductionDirectory({ label, groups, current, open }: {
  label: string; groups: (DirectoryItem & { children: DirectoryItem[] })[]; current?: string; open(id: string): void;
}) {
  const locale = useContext(ProductionLocale);
  return <nav className="candidate-production-directory" aria-label={label} onKeyDown={event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.gc-candidate-object-open'))
      .filter(button => button.getClientRects().length);
    const index = rows.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
    rows[next]?.focus();
  }}>
    {groups.filter(group => group.children.length > 0).map(group => <CandidateSection key={group.id} title={<>
      {group.icon}{group.name}<small>{group.children.length}</small>
    </>} collapsible>
      {group.children.map(row => <CandidateObjectRow key={row.id} title={row.name} icon={row.icon} metadata={row.detail}
        active={current === row.id} onActivate={() => open(row.id)}/>)}
    </CandidateSection>)}
    {!groups.some(group => group.children.length) && <p>{productionText(locale, '没有匹配对象', 'No matching objects', '一致する項目がありません')}</p>}
  </nav>;
}

type ProductionTabDocument = { id: string; title: string; icon?: ReactNode; dirty?: boolean; closable?: boolean };
export function ProductionTabs({ label, documents, active, onSelect, onClose, onReorder, panelId }: {
  label: string; documents: ProductionTabDocument[]; active: string; onSelect(id: string): void;
  onClose(id: string): void; onReorder?(ids: string[]): void; panelId(id: string): string;
}) {
  const uid = useId();
  const locale = useContext(ProductionLocale);
  const drag = useRef<string | null>(null);
  const reorder = (source: string, destination: string) => {
    const ids = documents.map(item => item.id), from = ids.indexOf(source), to = ids.indexOf(destination);
    if (!onReorder || from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    onReorder(ids);
  };
  return <CandidateDockTabList label={label} className="candidate-production-tabs" activeView={active ?? ''} views={documents.map(item => item.id)} onKeyDown={event => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-production-tab]');
    if (!onReorder || !tab || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const id = tab.dataset.productionTab!, index = documents.findIndex(item => item.id === id);
    const adjacent = documents[index + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (adjacent) { event.preventDefault(); reorder(id, adjacent.id); }
  }}>
    {documents.map(item => <CandidateDockTab key={item.id} viewId={item.id} title={item.title} tabId={`${uid}-${item.id}`} controls={panelId(item.id)}
      data-production-tab={item.id} active={active === item.id} dirty={item.dirty} icon={item.icon}
      closeLabel={productionText(locale, `关闭 ${item.title}`, `Close ${item.title}`, `${item.title}を閉じる`)}
      onActivate={() => onSelect(item.id)} onClose={item.closable === false ? undefined : () => onClose(item.id)}
      draggable={!!onReorder} onDragStart={event => { drag.current = item.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }}
      onDragEnd={() => { drag.current = null; }} onDragOver={event => { if (drag.current) event.preventDefault(); }}
      onDrop={event => { if (drag.current) { event.preventDefault(); reorder(drag.current, item.id); drag.current = null; } }}/>)}
  </CandidateDockTabList>;
}

export function ProductionCreateMenu({ entries, locale, busy = false }: { entries: ProductionCreateEntry[]; locale: string; busy?: boolean }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null), results = useRef<HTMLDivElement>(null);
  const t = (zh: string, en: string, ja: string) => productionText(locale, zh, en, ja);
  const visible = entries.filter(entry => `${entry.label} ${entry.detail ?? ''} ${entry.group}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = () => { setOpen(false); setQuery(''); };
  const searchLabel = t('搜索制作类型', 'Search production types', '制作の種類を検索');
  return <>
    <CandidateButton variant="primary" density="standard" disabled={busy} onClick={() => setOpen(true)}><Plus size={14}/>{t('新建制作', 'New production', '制作を追加')}</CandidateButton>
    {open && <CandidateReviewDialog open title={t('选择制作类型', 'Choose a production type', '制作の種類を選択')}
      initialFocus={search} onDismiss={close} actions={<CandidateButton variant="outline" density="standard" onClick={close}>{t('取消', 'Cancel', 'キャンセル')}</CandidateButton>}>
      <div className="candidate-production-create-search"><Search size={14} aria-hidden="true"/>
        <CandidateInput ref={search} aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'ArrowDown' && event.key !== 'Enter') return;
            const first = results.current?.querySelector<HTMLButtonElement>('button:not([aria-disabled=true])');
            if (!first) return;
            event.preventDefault();
            if (event.key === 'Enter') first.click(); else first.focus();
          }}/>
      </div>
      <div ref={results} className="candidate-production-create-list" onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([aria-disabled=true])'));
        const index = rows.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        if (event.key === 'ArrowUp' && index === 0) search.current?.focus();
        else rows[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
      }}>
        {[...new Set(visible.map(entry => entry.group))].map(group => <CandidateSection key={group} title={group}>
          {visible.filter(entry => entry.group === group).map(entry => <CandidateButton key={entry.id} density="standard"
            disabledReason={entry.disabled} disabled={busy} onClick={() => { close(); entry.run(); }}>
            <strong>{entry.label}</strong>{(entry.disabled || entry.detail) && <small>{entry.disabled || entry.detail}</small>}
          </CandidateButton>)}
        </CandidateSection>)}
        {!visible.length && <CandidateState kind="empty" title={t('没有匹配的制作类型', 'No matching production types', '一致する制作の種類がありません')}
          action={<CandidateButton onClick={() => { setQuery(''); search.current?.focus(); }}>{t('清除搜索', 'Clear search', '検索をクリア')}</CandidateButton>}/>}
      </div>
    </CandidateReviewDialog>}
  </>;
}

export function ProductionSecretInput({ resetKey, locale, disabled, ...props }: Omit<ComponentProps<typeof CandidateInput>, 'type'> & {
  resetKey: string; locale: string;
}) {
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const visible = revealedKey === resetKey;
  const label = visible ? productionText(locale, '隐藏密钥', 'Hide key', 'キーを隠す') : productionText(locale, '显示密钥', 'Show key', 'キーを表示');
  return <div className="candidate-production-secret">
    <CandidateInput {...props} disabled={disabled} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false}/>
    <CandidateIconButton label={label} disabled={disabled} aria-pressed={visible} onClick={() => setRevealedKey(visible ? null : resetKey)}>
      {visible ? <EyeOff size={14}/> : <Eye size={14}/>}
    </CandidateIconButton>
  </div>;
}

export function ProductionCode({ code, language = 'json', locale, copyOnly }: { code: string; language?: string; locale: string; copyOnly?: boolean }) {
  const [wrap, setWrap] = useState(true), [expanded, setExpanded] = useState(false), [message, setMessage] = useState(''), [page, setPage] = useState(0);
  const lines = code.split('\n'), pageSize = 160, current = Math.min(page, Math.ceil(lines.length / pageSize) - 1);
  const t = (zh: string, en: string, ja: string) => productionText(locale, zh, en, ja);
  const title = language.toUpperCase(), label = t('复制', 'Copy', 'コピー');
  return <section className="candidate-production-code" data-wrap={wrap} data-expanded={expanded} aria-label={title}>
    <CandidateToolbar label={title}>
      <small>{title}</small><small role="status">{message}</small>
      {!copyOnly && <CandidateButton aria-pressed={wrap} onClick={() => setWrap(!wrap)}>{t('自动换行', 'Wrap lines', '折り返し')}</CandidateButton>}
      {!copyOnly && <CandidateIconButton label={expanded ? t('收起', 'Collapse', '折りたたむ') : t('展开', 'Expand', '展開')} aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}><GripHorizontal size={14}/></CandidateIconButton>}
      <CandidateIconButton label={label} onClick={() => { void navigator.clipboard.writeText(code).then(
        () => setMessage(t('已复制', 'Copied', 'コピー済み')), () => setMessage(t('复制失败，请选中文字复制', 'Copy failed; select text to copy', '本文を選択してコピーしてください')),
      ); }}><Copy size={14}/></CandidateIconButton>
    </CandidateToolbar>
    <ProductionPagination total={lines.length} page={current} pageSize={pageSize} locale={locale}
      label={t('代码分页', 'Code pages', 'コードのページ')} onPageChange={setPage}/>
    <pre key={current} tabIndex={0} aria-label={title}><code>{lines.slice(current * pageSize, (current + 1) * pageSize).join('\n')}</code></pre>
  </section>;
}

export function ProductionProgress({ value, 'aria-label': label }: { value: number | null; 'aria-label': string }) {
  return <progress className="candidate-production-progress" max={100} value={value ?? undefined} aria-label={label}/>;
}

export function ProductionSeparator() {
  return <hr className="candidate-production-separator"/>;
}

function CopyText({ value, label, locale }: { value: string; label: string; locale: string }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  return <>
    <CandidateIconButton label={label} onClick={() => { void navigator.clipboard.writeText(value).then(() => {
      setCopied(true); setError('');
    }, () => {
      setCopied(false); setError(productionText(locale, '请选中文字复制', 'Select text to copy', '本文を選択してコピーしてください'));
    }); }}>{copied ? <Check size={14}/> : <Copy size={14}/>}</CandidateIconButton>
    <small role="status">{copied ? productionText(locale, '已复制', 'Copied', 'コピー済み') : error}</small>
  </>;
}

export function ProductionIdentity({ label, value, locale }: { label: string; value: string; locale: string }) {
  return <CandidateToolbar label={label}>
    <span>{label} <code>{value}</code></span>
    <CopyText label={`${productionText(locale, '复制', 'Copy', 'コピー')} ${label}`} value={value} locale={locale}/>
  </CandidateToolbar>;
}

export function ProductionTextPreview({ text, locale }: { text: string; locale: string }) {
  return <div className="candidate-production-text-preview">
    <CandidateToolbar label={productionText(locale, '文本预览', 'Text preview', '本文プレビュー')}>
      <CopyText value={text} locale={locale} label={productionText(locale, '复制文本', 'Copy text', '本文をコピー')}/>
    </CandidateToolbar>
    <div tabIndex={0}>{text ? text.split(/(\{\{[a-z_]+\}\})/gi).map((part, index) => /^\{\{[a-z_]+\}\}$/i.test(part)
      ? <code key={index}>{part}</code> : part) : productionText(locale, '未填写', 'Not provided', '未設定')}</div>
  </div>;
}
