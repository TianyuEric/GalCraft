import { editorText as translate } from './editor-text.js';
import './editor-fields.css';
import { useRef, useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronsUpDown, ImageOff, Search } from 'lucide-react';
import { Button } from '../controls.js';

export type ProjectObject = { id: string; variantId: string; revision: number; name: string; path: string; type: string; thumbnail: string | null; ownedThumbnail?: boolean; unavailable?: string };
export const objectKey = (item: ProjectObject) => `${item.id}@${item.variantId}`;
function ObjectImage({ item, locale }: {item: ProjectObject; locale: string}) {
  const t = (text: string) => translate(text, locale);
  const [failed, setFailed] = useState(false);
  return <span className="candidate-object-image">{(item.thumbnail || item.ownedThumbnail) && !failed ? <img src={item.thumbnail ?? undefined} data-asset-id={item.ownedThumbnail ? item.id : undefined} data-variant-id={item.ownedThumbnail ? item.variantId : undefined} alt="" onError={() => setFailed(true)}/> : <ImageOff size={18} aria-label={t("缩略图不可用")}/>}</span>;
}
/** coss's searchable popup composition; object identity remains with its caller. */
export function ProjectObjectPicker({ value, items, disabled, status = 'ready', onChange, retry, current, onSearch, refreshThumbnails, locale = 'zh-CN' }: {
  locale?: string; current?: ProjectObject | null; onSearch?(query: string): void; refreshThumbnails?(): void;
  value: string; items: ProjectObject[]; disabled?: boolean; status?: 'ready'|'loading'|'error';
  onChange(value: string): void; retry(): void;
}) {
  const t = (text: string) => translate(text, locale);
  const [query, setQuery] = useState(''), composing = useRef(false);
  const selected = items.find(item => objectKey(item) === value) ?? current ?? null;
  return <Combobox.Root items={status === 'ready' ? items : []} value={selected} disabled={disabled}
    itemToStringLabel={item => `${item.name} ${item.path} ${item.type} ${t('版本')} ${item.revision}`} itemToStringValue={objectKey}
    isItemEqualToValue={(a,b) => objectKey(a) === objectKey(b)} inputValue={query} onInputValueChange={next => { setQuery(next); onSearch?.(next); }}
    onOpenChange={open => { if (!open) { setQuery(''); onSearch?.(''); } else requestAnimationFrame(() => refreshThumbnails?.()); }} onValueChange={item => { if (item && !item.unavailable) onChange(objectKey(item)); }}>
    <Combobox.Trigger data-slot="studio-editor-control" aria-label={t("选择背景素材")} className="candidate-object-trigger">
      {selected && <ObjectImage item={selected} locale={locale}/>}<span>{selected?.name ?? t("选择背景素材")}</span><ChevronsUpDown size={16}/>
    </Combobox.Trigger>
    <Combobox.Portal container={document.getElementById('studio-portals')}><Combobox.Positioner align="start" sideOffset={4} collisionPadding={12} className="candidate-positioner">
      <Combobox.Popup className="candidate-object-popup">
        <div className="candidate-object-search"><Search size={16}/><Combobox.Input data-slot="studio-editor-control" aria-label={t("搜索背景素材")} placeholder={t("搜索名称或路径…")}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={event => { if (event.nativeEvent.isComposing || composing.current) event.stopPropagation(); }}/></div>
        {status === 'loading' && <Combobox.Status>{t("正在读取项目对象，当前选择保留。")}</Combobox.Status>}
        {status === 'error' && <div role="alert" className="candidate-object-message">{t("项目对象读取失败，当前选择保留。")}<Button onClick={retry}>{t("重试读取")}</Button></div>}
        {status === 'ready' && <Combobox.Empty className="candidate-object-message">{items.length === 0 ? t("项目中暂无可选背景素材。") : <>{t("没有匹配项。试试名称的一部分，或")}<Button tone="quiet" onClick={() => { setQuery(''); onSearch?.(''); }}>{t("清除搜索")}</Button></>}</Combobox.Empty>}
        <Combobox.List ref={node => { if (node) requestAnimationFrame(() => refreshThumbnails?.()); }} className="candidate-object-list">{(item: ProjectObject) => <Combobox.Item key={objectKey(item)} value={item} disabled={!!item.unavailable} className="candidate-object-item">
          <ObjectImage item={item} locale={locale}/><span><strong>{item.name}</strong><small>{item.path} · {item.type} · {t('版本')} {item.revision}</small>{item.unavailable && <small className="candidate-error">{item.unavailable}</small>}</span>
          <Combobox.ItemIndicator><Check size={16}/></Combobox.ItemIndicator>
        </Combobox.Item>}</Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>;
}
