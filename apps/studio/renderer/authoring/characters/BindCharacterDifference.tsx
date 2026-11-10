import { useRef, useState } from 'react';
import type { Asset, Character, CharacterDifference, Id, Result } from '@galcraft/contracts';
import type { AuthorOperation } from '@galcraft/documents/authoring';
import { Button, Choice, Field, Modal } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { tr } from '../../pages/Production/Production.js';
import type { StudioLocale } from '../controller.js';
import { defaultDifferenceCrop, differencePortrait, differenceVersionLabel } from './model.js';
import { FigureCropEditor, type DifferenceResources } from './SharedDifferencesEditor.js';
import './characters.css';

type BindCharacterDifferenceProps = {
  asset: Asset;
  variantId: Id;
  characters: readonly Pick<Character, 'id' | 'name' | 'initialDifferenceId'>[];
  locale: StudioLocale;
  resources?: DifferenceResources;
  close(): void;
  apply(operation: Extract<AuthorOperation, { op: 'character.difference.create' }>): Promise<Result<unknown>>;
  openCharacter?(id: Id): void;
};

export function BindCharacterDifference({ asset, variantId, characters, locale, resources, close, apply, openCharacter }: BindCharacterDifferenceProps) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const [characterId, setCharacterId] = useState(() => characters.find(character => character.id === asset.characterId)?.id ?? characters[0]?.id ?? '');
  const [name, setName] = useState(() => asset.name.replace(/\.[^.]+$/, '') || asset.name);
  const [portrait, setPortrait] = useState<'default' | 'image' | 'crop'>('crop');
  const [crop, setCrop] = useState(defaultDifferenceCrop);
  const [initial, setInitial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const applying = useRef(false);
  const character = characters.find(character => character.id === characterId);
  const available = asset.kind === 'image' && asset.variants.some(variant => variant.id === variantId);
  const figure = { assetId: asset.id, variantId };
  const avatar = differencePortrait(figure, portrait, crop);
  const difference: CharacterDifference = { id: 'preview', name, figure, avatar };
  const first = !!character && !character.initialDifferenceId;
  const characterLabel = t('角色', 'Character', 'キャラクター');
  const portraitLabel = t('阅读头像', 'Reading portrait', '会話アバター');
  const submit = async () => {
    if (!available || !character || !name.trim() || applying.current) return;
    applying.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await apply({ op: 'character.difference.create', characterId, name: name.trim(), figure, avatar, initial: first || initial });
      if (!result.ok) { setError(result.error.message); return; }
      close();
      openCharacter?.(characterId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { applying.current = false; setBusy(false); }
  };

  return <Modal wide title={t('绑定共同差分', 'Bind shared difference', '共通差分を割り当て')} close={() => { if (!applying.current) close(); }}>
    <form className="character-bind" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <dl className="character-bind-source">
        <div><dt>{t('立绘源图', 'Figure source', '立ち絵の元画像')}</dt><dd>{asset.name}</dd></div>
        <div><dt>{t('固定版本', 'Pinned version', '固定バージョン')}</dt><dd>{differenceVersionLabel(asset, variantId, locale)}</dd></div>
      </dl>
      {!available && <p role="alert" className="character-error">{t('所选图片版本不可用。请返回素材属性选择一个有效版本。', 'This image version is unavailable. Choose an available version in asset properties.', '選択した画像バージョンを利用できません。素材のプロパティで利用可能なバージョンを選んでください。')}</p>}
      {!characters.length && <p>{t('请先从角色目录新增角色。', 'Add a character from the character directory first.', '先にキャラクター一覧からキャラクターを追加してください。')}</p>}
      {available && characters.length > 0 && <>
        <Field label={characterLabel} required><Choice label={characterLabel} disabled={busy} value={characterId} options={characters.map(item => ({ value: item.id, label: item.name }))} onChange={id => { setCharacterId(id); setInitial(false); }} /></Field>
        <Field label={t('差分名称', 'Difference name', '差分名')} required><Input value={name} required disabled={busy} onChange={event => setName(event.target.value)} /></Field>
        <Field label={portraitLabel}><Choice label={portraitLabel} disabled={busy} value={portrait} options={[
          { value: 'crop', label: t('裁剪此立绘', 'Crop this figure', '立ち絵から切り抜く') },
          { value: 'image', label: t('使用同一整图', 'Use the same full image', '同じ画像全体を使う') },
          { value: 'default', label: t('角色默认头像', 'Character default', '標準アバター') },
        ]} onChange={value => setPortrait(value as typeof portrait)} /></Field>
        {portrait === 'crop' && resources && <FigureCropEditor difference={difference} assets={[asset]} resources={resources} crop={crop} change={setCrop} locale={locale} disabled={busy} />}
        <label className="character-check"><input type="checkbox" checked={first || initial} disabled={busy || first} onChange={event => setInitial(event.target.checked)} />
          <span>{t('设为新会话初始差分', 'Use as initial difference for new sessions', '新規セッションの開始時の差分にする')}
            <small>{first ? t('此角色尚未设置初始差分。', 'This character has no initial difference yet.', 'このキャラクターに開始時の差分がまだありません。') : t('场景中的当前差分和实例变换由演出指令控制。', 'Scene commands control the current difference and instance transform.', 'シーン内の現在の差分とインスタンスの変形は演出命令で制御します。')}</small>
          </span>
        </label>
      </>}
      {error && <p role="alert" className="character-error">{error}</p>}
      <footer>
        <Button disabled={busy} onClick={close}>{t('取消', 'Cancel', 'キャンセル')}</Button>
        <Button type="submit" tone="primary" disabled={!available || !character || !name.trim() || busy}>{busy ? t('正在绑定…', 'Binding…', '割り当て中…') : t('绑定差分', 'Bind difference', '差分を割り当て')}</Button>
      </footer>
    </form>
  </Modal>;
}
