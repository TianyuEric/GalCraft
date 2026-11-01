import { useState } from 'react';
import type { Asset, Character, CharacterDifference, Id } from '@galcraft/contracts';
import { ArrowLeft, ArrowRight, GripVertical } from 'lucide-react';
import { Button, Choice, Field } from '../../components/controls.js';
import { FigureCropEditor, type DifferenceResources } from './SharedDifferencesEditor.js';
import './AfterstoryLayoutEditor.css';

type Presentation = NonNullable<NonNullable<Character['afterstory']>['presentation']>;
export const upperBodyCrop = { x: .1, y: 0, width: .8, height: .6 };
export function afterstoryPresentation(character: Character, assets: Asset[], index: number): Presentation | null {
  if (character.afterstory?.presentation) return character.afterstory.presentation;
  const source = character.differences?.find(item => item.id === character.initialDifferenceId)?.figure;
  const id = source?.assetId ?? character.groups[0]?.assetIds[0] ?? character.avatar;
  const asset = assets.find(item => item.id === id);
  return asset ? { figure: source ?? { assetId: asset.id, variantId: asset.activeVariantId }, crop: { ...upperBodyCrop }, order: index } : null;
}
export function AfterstoryLayoutEditor({ characters, assets, resources, locale, selectedId, select, commit }: {
  characters: Character[]; assets: Asset[]; resources?: DifferenceResources; locale: string; selectedId?: Id;
  select?(id: Id): void; commit(values: { characterId: Id; presentation: Presentation }[]): Promise<void>;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [selected, setSelected] = useState(selectedId), [dragged, setDragged] = useState<Id | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ordered = characters.filter(item => item.narrativeRole === 'main' && item.afterstory).sort((a, b) => (a.afterstory?.presentation?.order ?? characters.indexOf(a)) - (b.afterstory?.presentation?.order ?? characters.indexOf(b)));
  const character = ordered.find(item => item.id === selected) ?? ordered[0];
  const presentation = character && afterstoryPresentation(character, assets, characters.indexOf(character));
  const save = async (values: Parameters<typeof commit>[0]) => { setBusy(true); setError(''); try { await commit(values); } catch (reason) { setError(String(reason)); } finally { setBusy(false); } };
  const reorder = (from: Id, to: number) => {
    const result = [...ordered], index = result.findIndex(item => item.id === from); if (index < 0 || to < 0 || to >= result.length || index === to) return;
    result.splice(to, 0, result.splice(index, 1)[0]!);
    setSelected(from); select?.(from);
    const values = result.map((item, order) => { const presentation = afterstoryPresentation(item, assets, order); return { characterId: item.id, presentation: presentation && { ...presentation, order } }; });
    if (values.some(item => !item.presentation)) { setError(t('请先为角色选择可用立绘。', 'Choose an available figure first.', '利用できる立ち絵を選択してください。')); return; }
    void save(values as Parameters<typeof commit>[0]);
  };
  const update = (value: Presentation) => character && void save([{ characterId: character.id, presentation: value }]);
  const images = assets.filter(item => item.kind === 'image');
  return <section className="afterstory-layout-editor" aria-busy={busy}>
    <h3>{t('角色排列与取景', 'Character order and framing', 'キャラクターの順序と構図')}</h3>
    <p>{t('拖动调整左右顺序，选择角色调整此页立绘。锁定剪影使用相同取景。', 'Drag to reorder, then select a character to frame its figure. Locked silhouettes share the framing.', 'ドラッグで左右の順序を変え、選択して構図を調整します。未解放のシルエットも同じ構図を使います。')}</p>
    <ol className="afterstory-layout-list">{ordered.map((item, index) => <li key={item.id} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && dragged) reorder(dragged, index); setDragged(null); }}>
      <Button disabled={busy} draggable onDragStart={() => setDragged(item.id)} onDragEnd={() => setDragged(null)} aria-pressed={character?.id === item.id} onClick={() => { setSelected(item.id); select?.(item.id); }}><GripVertical size={16}/>{item.name}</Button>
      <Button disabled={busy || index === 0} aria-label={`${t('左移', 'Move left', '左へ')} ${item.name}`} onClick={() => reorder(item.id, index - 1)}><ArrowLeft size={16}/></Button>
      <Button disabled={busy || index === ordered.length - 1} aria-label={`${t('右移', 'Move right', '右へ')} ${item.name}`} onClick={() => reorder(item.id, index + 1)}><ArrowRight size={16}/></Button>
    </li>)}</ol>
    {!character && <p>{t('先为主角色配置后日谈入口。', 'Configure a main character’s afterstory first.', 'メインキャラクターの後日談を設定してください。')}</p>}
    {character && <Field label={t('此页立绘', 'Page figure', 'このページの立ち絵')}><Choice label={t('此页立绘', 'Page figure', 'このページの立ち絵')} value={presentation?.figure.assetId ?? ''} disabled={busy} options={[{ value: '', label: t('选择透明立绘', 'Choose a transparent figure', '透過立ち絵を選択') }, ...images.map(item => ({ value: item.id, label: item.name }))]} onChange={id => { const asset = images.find(item => item.id === id); if (asset) update({ figure: { assetId: id, variantId: asset.activeVariantId }, crop: { ...upperBodyCrop }, order: presentation?.order ?? characters.indexOf(character) }); }}/></Field>}
    {character && presentation && <>
      <Field label={t('固定版本', 'Pinned version', '固定バージョン')}><Choice label={t('固定版本', 'Pinned version', '固定バージョン')} value={presentation.figure.variantId ?? assets.find(item => item.id === presentation.figure.assetId)?.activeVariantId ?? ''} disabled={busy} options={(assets.find(item => item.id === presentation.figure.assetId)?.variants ?? []).map((item, index) => ({ value: item.id, label: `${index + 1} · ${item.role}` }))} onChange={variantId => update({ ...presentation, figure: { ...presentation.figure, variantId } })}/></Field>
      <FigureCropEditor difference={{ id: character.id, name: character.name, figure: presentation.figure, avatar: null } satisfies CharacterDifference} crop={presentation.crop} assets={assets} resources={resources} locale={locale} disabled={busy} resetCrop={upperBodyCrop} change={crop => update({ ...presentation, crop })}/>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
