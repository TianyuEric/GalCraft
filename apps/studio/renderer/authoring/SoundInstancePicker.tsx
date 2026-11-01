import { Combobox } from '@base-ui/react/combobox';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, Volume2 } from 'lucide-react';
import { Button } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import type { SoundInstanceOption } from './sound-instances.js';
import './sound-instance-picker.css';

export function SoundInstancePicker({ value, items, locale, disabled, choose }: {
  value: string; items: SoundInstanceOption[]; locale: string; disabled?: boolean; choose(id: string): Promise<void>;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [manualId, setManualId] = useState(value);
  const manualEdited = useRef(false);
  useEffect(() => { setManualId(value); manualEdited.current = false; }, [value]);
  const composing = useRef(false), selected = items.find(item => item.id === value) ?? null;
  const commit = async (id: string) => { if (id === value) return; setBusy(true); setError(''); try { await choose(id); } catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); } finally { setBusy(false); } };
  return <div className="sound-instance-picker" aria-busy={busy}>
    <Combobox.Root items={items} value={selected} disabled={disabled || busy} inputValue={query} onInputValueChange={setQuery}
      itemToStringValue={item => item.id} itemToStringLabel={item => `${item.name} ${item.source} ${item.id}`}
      isItemEqualToValue={(a, b) => a.id === b.id} onOpenChange={open => { if (!open) setQuery(''); }} onValueChange={item => { if (item) void commit(item.id); }}>
      <Combobox.Trigger data-slot="studio-editor-control" aria-label={t('选择要停止的声音对象', 'Choose a sound to stop', '停止する音声を選択')} className="sound-instance-trigger">
        <Volume2 size={16}/><span>{selected?.name ?? (value ? t('原声音引用', 'Original sound reference', '元の音声参照') : t('选择声音对象', 'Choose sound instance', '音声を選択'))}</span><ChevronsUpDown size={16}/>
      </Combobox.Trigger>
      <Combobox.Portal container={document.getElementById('studio-portals') ?? document.body}><Combobox.Positioner align="start" sideOffset={4} collisionPadding={12} className="sound-instance-positioner"><Combobox.Popup className="sound-instance-popup">
        <div className="sound-instance-search"><Search size={16}/><Combobox.Input data-slot="studio-editor-control" aria-label={t('搜索声音名称、来源或 ID', 'Search sound name, source or ID', '音声名・参照元・IDで検索')} placeholder={t('搜索名称或 ID…', 'Search name or ID…', '名前・IDで検索…')}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (composing.current || event.nativeEvent.isComposing) event.stopPropagation(); }}/></div>
        <p className="sound-instance-help">{t('当前场景声音在前；分支和跨场景声音需要检查实际路线。', 'Scene sounds first. Check the route for branch and cross-scene sounds.', '現在のシーンを優先します。分岐・他シーンの音声は実際のルートを確認してください。')}</p>
        <Combobox.Empty className="sound-instance-help">{items.length ? <>{t('没有匹配声音。', 'No matching sounds.', '該当する音声がありません。')}<Button tone="quiet" onClick={() => setQuery('')}>{t('清除搜索', 'Clear search', '検索をクリア')}</Button></> : t('此前尚无声音对象。可先添加播放指令，或在引用详情中填写已有 ID。', 'No earlier sounds. Add a play command or enter an existing ID in reference details.', '先行する音声がありません。再生を追加するか、参照詳細に既存IDを入力してください。')}</Combobox.Empty>
        <Combobox.List className="sound-instance-list">{(item: SoundInstanceOption) => <Combobox.Item key={item.id} value={item} className="sound-instance-item">
          <span><strong>{item.name}</strong><small>{item.loop ? t('循环环境音', 'Looping ambience', 'ループ環境音') : t('一次性音效', 'One-shot sound', '単発効果音')} · {item.source}</small><small>{item.current ? t('当前场景引用', 'Current scene reference', '現在のシーン参照') : t('检查生效路线', 'Check active route', '有効なルートを確認')}</small></span><Combobox.ItemIndicator><Check size={16}/></Combobox.ItemIndicator>
        </Combobox.Item>}</Combobox.List>
      </Combobox.Popup></Combobox.Positioner></Combobox.Portal>
    </Combobox.Root>
    <details><summary>{t('声音对象引用详情', 'Sound instance reference', '音声インスタンスの参照')}</summary><Input aria-label={t('声音对象 ID', 'Sound instance ID', '音声インスタンスID')} value={manualId} onChange={event => { setManualId(event.target.value); manualEdited.current = true; }} disabled={disabled || busy} onBlur={() => { if (manualEdited.current && manualId.trim()) void commit(manualId.trim()); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } }}/></details>
    {error && <p role="alert" className="field-error">{error}</p>}
  </div>;
}
