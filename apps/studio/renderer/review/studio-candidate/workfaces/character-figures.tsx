import { useEffect, useState } from 'react';
import { FileImage, Plus, ScanFace, Trash2 } from 'lucide-react';
import { createId, type Asset, type Character, type CharacterDifference, type Id } from '@galcraft/contracts';
import { afterstoryPresentation, upperBodyCrop } from '../../../authoring/characters/AfterstoryLayoutEditor.js';
import { FigureCropEditor, type DifferenceResources } from '../../../authoring/characters/SharedDifferencesEditor.js';
import { CandidateButton, CandidateField, CandidateInput, CandidateObjectRow, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { CharacterNumber, useClearCharacterNumbers } from './character-number.js';
import type { CharacterFieldsProps } from './character-profile.js';
import { resultValue, workfaceError } from './workface-helpers.js';

type Figure = CharacterDifference['figure'];
type Presentation = NonNullable<NonNullable<Character['afterstory']>['presentation']>;
type Catalog = { assets: Asset[]; resources?: DifferenceResources };
const avatarCrop = { x: .25, y: 0, width: .5, height: .35 };

function FigureField({ label, value, assets, disabled, change }: {
  label: string; value: Figure; assets: Asset[]; disabled: boolean; change(value: Figure): void;
}) {
  const asset = assets.find(item => item.id === value.assetId);
  const variants = asset?.variants ?? [];
  return <div className="candidate-character-inline">
    <CandidateField label={label}><CandidateSelect disabled={disabled} value={value.assetId}
      onValueChange={assetId => change({ assetId, variantId: assets.find(item => item.id === assetId)?.activeVariantId ?? null })}>
      <option value="">选择图片</option>
      {!asset && value.assetId && <option value={value.assetId}>原图片缺失</option>}
      {assets.filter(item => item.kind === 'image').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </CandidateSelect></CandidateField>
    {!!variants.length && <CandidateField label="固定版本"><CandidateSelect disabled={disabled} value={value.variantId ?? asset?.activeVariantId ?? ''} onValueChange={variantId => change({ ...value, variantId })}>
      {value.variantId && !variants.some(item => item.id === value.variantId) && <option value={value.variantId}>原版本缺失</option>}
      {variants.map((item, index) => <option key={item.id} value={item.id}>{index + 1} · {item.role}{item.id === asset?.activeVariantId ? ' · 当前采用' : ''}</option>)}
    </CandidateSelect></CandidateField>}
  </div>;
}

function FigurePreview({ figure, crop, assets, resources, label }: Catalog & { figure: Figure; crop?: typeof avatarCrop; label: string }) {
  const [uri, setUri] = useState(''), [error, setError] = useState('');
  const asset = assets.find(item => item.id === figure.assetId), variantId = figure.variantId ?? asset?.activeVariantId;
  const variant = asset?.variants.find(item => item.id === variantId);
  useEffect(() => {
    let active = true, lease: string | undefined;
    setUri(''); setError('');
    if (!resources || !asset || !variantId || asset.kind !== 'image') return;
    void resources.resolveRuntime(asset.id, variantId).then(result => {
      const value = resultValue(result);
      if (!active) { void resources.releaseRuntime(value.leaseId); return; }
      lease = value.leaseId; setUri(value.uri);
    }).catch(reason => { if (active) setError(workfaceError(reason)); });
    return () => { active = false; if (lease) void resources.releaseRuntime(lease); };
  }, [asset?.id, asset?.kind, resources, variantId]);
  const missing = !asset || !variant;
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const canvasWidth = variant?.canvas?.width ?? imageSize.width, canvasHeight = variant?.canvas?.height ?? imageSize.height;
  const framing = crop ? { width: canvasWidth * crop.width, height: canvasHeight * crop.height, x: crop.x * canvasWidth, y: crop.y * canvasHeight } : undefined;
  return <figure className="candidate-character-figure">
    <div className="candidate-character-figure-art">
      {uri && !error ? <div className="candidate-character-figure-frame" style={framing ? { aspectRatio: framing.width + '/' + framing.height, width: Math.min(116, 116 * framing.width / framing.height) } : undefined}>
        <img src={uri} alt={label} onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError('图片无法解码')}
          style={framing ? {
            position: 'absolute',
            width: imageSize.width / framing.width * 100 + '%',
            height: imageSize.height / framing.height * 100 + '%',
            left: ((variant?.canvas?.offsetX ?? 0) - framing.x) / framing.width * 100 + '%',
            top: ((variant?.canvas?.offsetY ?? 0) - framing.y) / framing.height * 100 + '%',
          } : undefined}/>
      </div> : <><FileImage size={20}/>{(missing || error) && <small title={error}>图片或版本不可用</small>}</>}
    </div>
    <figcaption>{label}</figcaption>
  </figure>;
}

export function CharacterDifferences({ current, original, assets, resources, locale, disabled, change, openAsset, removeDifference }: CharacterFieldsProps & Catalog & {
  original: Character; locale: string; openAsset(id: Id): void; removeDifference(id: Id, replacementId?: Id): Promise<void>;
}) {
  const clearNumbers = useClearCharacterNumbers();
  const [selected, setSelected] = useState<Id | undefined>(current.initialDifferenceId ?? undefined);
  const [replacement, setReplacement] = useState('');
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const value = current.differences ?? [], initial = current.initialDifferenceId ?? null;
  const difference = value.find(item => item.id === selected) ?? value[0];
  const image = assets.find(item => item.kind === 'image');
  const update = (patch: Partial<CharacterDifference>) => { if (difference) change({ differences: value.map(item => item.id === difference.id ? { ...item, ...patch } : item) }); };
  const add = () => {
    if (!image) return;
    const item: CharacterDifference = { id: createId(value), name: '新差分', figure: { assetId: image.id, variantId: image.activeVariantId }, avatar: { kind: 'crop', crop: avatarCrop } };
    change({ differences: [...value, item], initialDifferenceId: initial ?? item.id });
    setSelected(item.id); setReplacement('');
  };
  const remove = async () => {
    if (!difference) return;
    setRemoving(true); setError('');
    try {
      if (original.differences?.some(item => item.id === difference.id)) await removeDifference(difference.id, replacement || undefined);
      else {
        clearNumbers('difference/' + difference.id);
        const next = value.filter(item => item.id !== difference.id);
        change({ differences: next, initialDifferenceId: initial === difference.id ? next[0]?.id ?? null : initial });
      }
      setReplacement('');
    } catch (reason) { setError(workfaceError(reason)); }
    finally { setRemoving(false); }
  };
  const blocked = disabled || removing;
  const grouped = original.groups ?? [];
  const ungrouped = assets.filter(asset => asset.characterId === current.id && !grouped.some(group => group.assetIds.includes(asset.id)));
  const gallery = [...grouped.map(group => ({ id: group.id, name: group.name, ids: group.assetIds })), { id: 'related', name: '其他关联素材', ids: ungrouped.map(asset => asset.id) }];
  const avatar = difference?.avatar;
  return <>
    <CandidateSection title="共同差分" actions={<CandidateButton variant="outline" disabled={blocked} disabledReason={image ? undefined : '先导入角色图片。'} onClick={add}><Plus size={14}/>添加共同差分</CandidateButton>}>
      <p className="candidate-character-hint">舞台立绘和阅读头像共享同一差分。隐藏立绘时保留表情。</p>
      {!difference ? <CandidateState kind="empty" title="还没有共同差分" description="添加差分后，选择立绘源图、阅读头像和会话初始状态。"/> : <>
        <div className="candidate-character-columns candidate-character-difference-columns">
          <div className="candidate-character-difference-list" aria-label="差分列表">
            {value.map(item => <CandidateObjectRow key={item.id} icon={<ScanFace size={14}/>} title={item.name || '未命名差分'} metadata={initial === item.id ? '初始' : undefined}
              active={difference.id === item.id} onActivate={() => { setSelected(item.id); setReplacement(''); setError(''); }}/>)}
          </div>
          <div className="candidate-character-difference-detail">
            <CandidateField label="差分名称"><CandidateInput value={difference.name} disabled={blocked} onChange={event => update({ name: event.target.value })}/></CandidateField>
            <CandidateToolbar label="初始差分">
              <CandidateButton variant="outline" disabled={blocked || initial === difference.id} onClick={() => change({ initialDifferenceId: difference.id })}>设为新会话初始差分</CandidateButton>
            </CandidateToolbar>
            <FigureField label="立绘源图" value={difference.figure} assets={assets} disabled={blocked} change={figure => update({ figure })}/>
            <CandidateField label="头像来源"><CandidateSelect value={avatar?.kind ?? 'default'} disabled={blocked} onValueChange={kind => {
              if (kind !== 'crop') clearNumbers('difference/' + difference.id);
              update({ avatar: kind === 'image' ? { kind, assetId: image?.id ?? '', variantId: image?.activeVariantId ?? null } : kind === 'crop' ? { kind, crop: avatarCrop } : null });
            }}><option value="default">角色默认头像</option><option value="image">独立图片</option><option value="crop">裁剪此立绘</option></CandidateSelect></CandidateField>
            {avatar?.kind === 'image' && <FigureField label="头像图片" value={avatar} assets={assets} disabled={blocked} change={figure => update({ avatar: { kind: 'image', ...figure } })}/>}
            {avatar?.kind === 'crop' && <>
              <FigureCropEditor difference={difference} assets={assets} resources={resources} crop={avatar.crop} change={crop => update({ avatar: { kind: 'crop', crop } })} locale={locale} disabled={blocked}/>
              <div className="candidate-character-inline">
                {(['x', 'y', 'width', 'height'] as const).map(key => <CharacterNumber key={key} field={'difference/' + difference.id + '/' + key} label={{ x: '横坐标', y: '纵坐标', width: '宽度', height: '高度' }[key]}
                  value={avatar.crop[key]} min={key === 'width' || key === 'height' ? .001 : 0} max={1} disabled={blocked} change={next => update({ avatar: { kind: 'crop', crop: { ...avatar.crop, [key]: next } } })}/>)}
              </div>
            </>}
            {avatar && <FigurePreview label="共同差分头像预览" figure={avatar.kind === 'image' ? avatar : difference.figure} crop={avatar.kind === 'crop' ? avatar.crop : undefined} assets={assets} resources={resources}/>}
            <CandidateToolbar label="差分操作">
              <CandidateButton disabled={!difference.figure.assetId} onClick={() => openAsset(difference.figure.assetId)}>查看源图</CandidateButton>
            </CandidateToolbar>
            <CandidateSection title="移除差分" collapsible initiallyOpen={false}>
              {original.differences?.some(item => item.id === difference.id) && <CandidateField label="删除时引用替换为"><CandidateSelect value={replacement} disabled={blocked} onValueChange={setReplacement}>
                <option value="">无替代，需先解除引用</option>
                {value.filter(item => item.id !== difference.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </CandidateSelect></CandidateField>}
              <CandidateToolbar label="移除差分操作"><CandidateButton variant="danger" disabled={blocked} onClick={() => void remove()}><Trash2 size={14}/>移除此差分</CandidateButton></CandidateToolbar>
              {error && <p role="alert">{error}</p>}
            </CandidateSection>
          </div>
        </div>
      </>}
    </CandidateSection>
    <CandidateSection title="关联形象" collapsible initiallyOpen={false}>
      {!gallery.some(group => group.ids.length) && <p>导入素材时可关联角色，也可以在指令属性中选择素材与取景。</p>}
      {gallery.filter(group => group.ids.length).map(group => <section key={group.id}>
        <h3>{group.name}</h3>
        <div className="candidate-character-figure-gallery">{group.ids.map(id => {
          const asset = assets.find(item => item.id === id);
          return <CandidateButton key={id} className="candidate-character-gallery-choice" title={asset?.name} disabled={!asset} onClick={() => openAsset(id)}>
            <FigurePreview label={asset?.name ?? '素材缺失'} figure={{ assetId: id, variantId: asset?.activeVariantId ?? null }} assets={assets} resources={resources}/>
          </CandidateButton>;
        })}</div>
      </section>)}
    </CandidateSection>
  </>;
}

export function CharacterAfterstoryLayout({ character, assets, resources, locale, disabled, commit }: Catalog & {
  character: Character; locale: string; disabled: boolean; commit(value: Presentation): Promise<void>;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [pending, setPending] = useState<Presentation>();
  const presentation = pending ?? afterstoryPresentation(character, assets, 0);
  const save = async (next: Presentation) => {
    setBusy(true); setError(''); setPending(next);
    try { await commit(next); }
    catch (reason) { setError(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (pending && JSON.stringify(pending) === JSON.stringify(character.afterstory?.presentation)) setPending(undefined);
  }, [character.afterstory?.presentation, pending]);
  return <CandidateSection title="角色取景">
    {!character.afterstory ? <CandidateState kind="empty" title="尚未配置后日谈入口" description="在个人路线中关联结局并配置后日谈后，可选择此页立绘。"/> : <>
      <p className="candidate-character-hint">锁定剪影使用相同取景。</p>
      {disabled && <p className="candidate-character-hint">请先应用或还原角色资料中的输入。</p>}
      <FigureField label="此页立绘" value={presentation?.figure ?? { assetId: '', variantId: null }} assets={assets} disabled={disabled || busy} change={figure => {
        if (!figure.assetId) return;
        void save({ figure, crop: figure.assetId === presentation?.figure.assetId ? presentation.crop : { ...upperBodyCrop }, order: presentation?.order ?? 0 });
      }}/>
      {presentation && <FigureCropEditor difference={{ id: character.id, name: character.name, figure: presentation.figure, avatar: null }}
        crop={presentation.crop} assets={assets} resources={resources} locale={locale} disabled={disabled || busy} resetCrop={upperBodyCrop} change={crop => void save({ ...presentation, crop })}/>}
      {error && <p role="alert">{error}</p>}
    </>}
  </CandidateSection>;
}
