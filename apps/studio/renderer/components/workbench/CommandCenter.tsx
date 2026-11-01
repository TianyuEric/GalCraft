import { useEffect, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { createRoot } from 'react-dom/client';
import { Button } from '../controls.js';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandShortcut } from '../ui/command.js';

export type CommandEntry = { id: string; label: string; group: string; detail?: string; shortcut?: string; disabled?: string; run(): void | Promise<void> };
export type CommandMode = 'objects' | 'commands';
export function CommandCenter({ mode: initialMode, locale, load, choose, close, anchor }: {
  mode: CommandMode; locale: string; load(query: string, mode: CommandMode): Promise<CommandEntry[]>;
  choose(entry: CommandEntry): void; close(restoreFocus?: boolean): void;
  anchor?: HTMLElement | null;
}) {
  const [query, setQuery] = useState(initialMode === 'commands' ? '>' : ''), [items, setItems] = useState<CommandEntry[]>([]);
  const [active, setActive] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLElement>(null);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const help = query.startsWith('?'), mode = query.startsWith('>') ? 'commands' : 'objects';
  useEffect(() => { let alive = true; setLoading(true); setError('');
    void load(query.replace(/^[>?]\s*/, ''), mode).then(value => { if (alive) { setItems(value); setActive(value.find(item => !item.disabled)?.id ?? ''); } }).catch(reason => { if (alive) setError(String(reason)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, mode, load]);
  useEffect(() => {
    if (anchor) return; // The anchored Popover owns outside focus and pointer dismissal.
    const outside = (event: PointerEvent | FocusEvent) => { if (event.target instanceof Node && !popup.current?.contains(event.target)) close(false); };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside); };
  }, [close, anchor]);
  const content = <section ref={popup} className="command-center-popup" aria-label={t('搜索作品与命令', 'Search project and commands', '作品とコマンドを検索')}>
    <Command className="workbench-command-center" shouldFilter={false} value={active} onValueChange={setActive} vimBindings={false} onKeyDownCapture={event => {
      if (event.nativeEvent.isComposing) { if (['Enter', 'Escape'].includes(event.key)) event.stopPropagation(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
      <div className="command-center-modes" aria-label={t('搜索范围', 'Search scope', '検索範囲')}>
        <Button tone="quiet" aria-pressed={!help && mode === 'objects'} onClick={() => { setQuery(''); input.current?.focus(); }}>{t('作品对象', 'Project objects', '作品の項目')} <kbd>Ctrl+P</kbd></Button>
        <Button tone="quiet" aria-pressed={!help && mode === 'commands'} onClick={() => { setQuery('>'); input.current?.focus(); }}>{t('应用命令', 'Commands', 'コマンド')} <kbd>Ctrl+Shift+P</kbd></Button>
        <Button tone="quiet" aria-pressed={help} onClick={() => setQuery('?')}>{t('帮助', 'Help', 'ヘルプ')}</Button>
      </div>
      <CommandInput ref={input} autoFocus={!anchor} aria-label={t('搜索作品与命令', 'Search project and commands', '作品とコマンドを検索')} value={query} onValueChange={setQuery} />
      {help ? <p>{t('搜索当前作品的场景、角色、素材、页面与制作草稿。输入 > 搜索应用及插件命令。↑↓ 选择，Enter 打开，Esc 返回原编辑位置；Ctrl+F 留在当前编辑器。', 'Search scenes, characters, assets, pages and production drafts. Type > for application and plugin commands. ↑↓ selects, Enter opens, Esc returns to your editor. Ctrl+F stays in the current editor.', '場面・キャラクター・素材・ページ・制作下書きを検索。> でアプリと拡張のコマンドを検索。↑↓ で選択、Enter で開く、Esc で編集に戻る。Ctrl+F は現在のエディターで検索。')}</p> : <CommandList aria-busy={loading} className="command-center-results">
        {items.map(item => <CommandItem value={item.id} key={item.id} disabled={!!item.disabled} onSelect={() => choose(item)}>
          <small className="command-result-kind">{item.group}</small><span className="command-result-name"><strong>{item.label}</strong>{(item.disabled || item.detail) && <small>{item.disabled ?? item.detail}</small>}</span>{item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
        </CommandItem>)}
        {loading && <p role="status">{t('正在搜索…', 'Searching…', '検索中…')}</p>}
        {!loading && <CommandEmpty>{t('没有匹配项。尝试其他关键词，或输入 > 搜索命令。', 'No matches. Try another keyword, or type > for commands.', '該当なし。別の語句、または > でコマンドを検索してください。')}</CommandEmpty>}
      </CommandList>}
      {error && <p role="alert">{error}</p>}
    </Command>
  </section>;
  return anchor ? <Popover.Root open modal={false} onOpenChange={open => { if (!open) close(false); }}>
    <Popover.Portal container={document.getElementById('studio-portals')}>
      <Popover.Positioner anchor={anchor} side="bottom" align="start" sideOffset={4} collisionPadding={12} className="command-center-positioner">
        <Popover.Popup initialFocus={input} finalFocus={false}>{content}</Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root> : content;
}

export function showCommandCenter(input: { mode: CommandMode; locale: string; anchor?: HTMLElement | null; load(query: string, mode: CommandMode): Promise<CommandEntry[]>; error(reason: unknown): void }) {
  const origin = document.activeElement as HTMLElement | null, host = document.createElement('div');
  (document.getElementById('studio-portals') ?? document.body).append(host); const root = createRoot(host); let closed = false;
  const close = (restoreFocus = true) => { if (closed) return; closed = true; queueMicrotask(() => { root.unmount(); host.remove(); if (restoreFocus) (origin?.isConnected ? origin : input.anchor)?.focus({ preventScroll: true }); }); };
  root.render(<CommandCenter {...input} close={close} choose={entry => { close(); setTimeout(() => { void Promise.resolve().then(() => entry.run()).catch(input.error); }, 0); }}/>);
  return close;
}
