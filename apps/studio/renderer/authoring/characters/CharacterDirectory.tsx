import { useRef, useState } from 'react';
import { Plus, Search, UserRound } from 'lucide-react';
import type { Character, Id } from '@galcraft/contracts';
import { Button } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { tr } from '../../pages/Production/Production.js';
import type { StudioLocale } from '../controller.js';
import { characterRoleName } from './model.js';
import './characters.css';

type CharacterDirectoryProps = {
  characters: readonly Pick<Character, 'id' | 'name' | 'narrativeRole'>[];
  locale: StudioLocale;
  selectedId?: Id;
  pendingIds?: ReadonlySet<Id>;
  search: string;
  onSearchChange(search: string): void;
  onOpen(id: Id, name: string): void;
  onCreate(): Promise<void>;
};

export function CharacterDirectory({ characters, locale, selectedId, pendingIds, search, onSearchChange, onOpen, onCreate }: CharacterDirectoryProps) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const query = search.trim().toLocaleLowerCase(locale);
  const matches = characters.filter(character => character.name.toLocaleLowerCase(locale).includes(query));
  const createLabel = t('新增角色', 'Add character', 'キャラクターを追加');
  const searchLabel = t('搜索角色', 'Search characters', 'キャラクターを検索');
  const create = async () => {
    setBusy(true);
    setError('');
    try { await onCreate(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  return <section className="character-directory" aria-label={t('角色目录', 'Character directory', 'キャラクター一覧')}>
    <header className="character-directory-heading">
      <h2>{t('角色目录', 'Character directory', 'キャラクター一覧')}</h2><small>{characters.length}</small>
      <Button tone="quiet" aria-label={createLabel} title={createLabel} disabled={busy} onClick={() => void create()}><Plus size={16} /></Button>
    </header>
    <label className="character-search">
      <Search size={15} aria-hidden="true" />
      <Input ref={searchInput} type="search" aria-label={searchLabel} placeholder={searchLabel} value={search} onChange={event => onSearchChange(event.target.value)} />
    </label>
    {error && <p className="character-error" role="alert">{error}</p>}
    {busy && <p className="character-directory-note" role="status">{t('正在新增角色…', 'Adding character…', 'キャラクターを追加中…')}</p>}
    {!characters.length && <p className="character-directory-note">{t('新增角色后可配置资料与共同差分。', 'Add a character to edit its profile and shared differences.', 'キャラクターを追加すると、資料と共通差分を編集できます。')}</p>}
    {characters.length > 0 && !matches.length && <div className="character-directory-note">
      <p role="status">{t('没有匹配的角色。', 'No matching characters.', '一致するキャラクターがありません。')}</p>
      <Button tone="quiet" onClick={() => { onSearchChange(''); searchInput.current?.focus(); }}>{t('清除搜索', 'Clear search', '検索を解除')}</Button>
    </div>}
    {matches.length > 0 && <nav aria-label={t('角色列表', 'Character list', 'キャラクター一覧')} className="character-directory-list">
      {matches.map(character => <button type="button" key={character.id} aria-current={character.id === selectedId ? 'true' : undefined} onClick={() => onOpen(character.id, character.name)}>
        <UserRound size={16} aria-hidden="true" />
        <span className="character-directory-label">
          <strong>{character.name || t('未命名', 'Untitled', '名称未設定')}</strong>
          <small>{characterRoleName(locale, character.narrativeRole)}</small>
        </span>
        {pendingIds?.has(character.id) && <span className="character-directory-pending" role="img" aria-label={t('待应用', 'Pending changes', '未適用')} title={t('待应用', 'Pending changes', '未適用')} />}
      </button>)}
    </nav>}
  </section>;
}
