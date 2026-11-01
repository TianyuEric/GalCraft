import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/controls.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover-base.js';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from '../../components/ui/command.js';
import './production-create-menu.css';

export type ProductionCreateEntry = { id: string; label: string; group: string; detail?: string; disabled?: string; run(): void };

/** Entries retain the operation catalog's identity; choosing only opens its existing draft. */
export function ProductionCreateMenu({ entries, locale, busy = false }: { entries: ProductionCreateEntry[]; locale: string; busy?: boolean }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const visible = entries.filter(entry => `${entry.label} ${entry.detail ?? ''} ${entry.group}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Popover open={open} onOpenChange={value => { setOpen(value); if (!value) setQuery(''); }}>
    <PopoverTrigger disabled={busy} render={<Button tone="primary"/>}><Plus size={16}/>{t('新建制作', 'New production', '制作を追加')}</PopoverTrigger>
    <PopoverContent className="production-create-popup" align="start" aria-label={t('选择制作类型', 'Choose a production type', '制作の種類を選択')}>
      <Command label={t('搜索制作类型', 'Search production types', '制作の種類を検索')} shouldFilter={false} vimBindings={false} onKeyDownCapture={event => {
        if (event.nativeEvent.isComposing && ['Enter', 'Escape'].includes(event.key)) event.stopPropagation();
      }}>
        <CommandInput aria-label={t('搜索制作类型', 'Search production types', '制作の種類を検索')} placeholder={t('搜索制作类型…', 'Search production types…', '制作の種類を検索…')} value={query} onValueChange={setQuery}/>
        <CommandList>
          {Array.from(new Set(visible.map(entry => entry.group))).map(group => <CommandGroup key={group} heading={group}>
            {visible.filter(entry => entry.group === group).map(entry => <CommandItem key={entry.id} value={entry.id} disabled={!!entry.disabled} onSelect={() => { if (entry.disabled || busy) return; setOpen(false); setQuery(''); entry.run(); }}>
              <span><strong>{entry.label}</strong>{(entry.disabled || entry.detail) && <small>{entry.disabled || entry.detail}</small>}</span>
            </CommandItem>)}
          </CommandGroup>)}
          {!visible.length && <div className="production-create-empty" role="status"><p>{t('没有匹配的制作类型', 'No matching production types', '一致する制作の種類がありません')}</p><Button tone="quiet" onClick={() => setQuery('')}>{t('清除搜索', 'Clear search', '検索をクリア')}</Button></div>}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
