import { useState } from 'react';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import type { ActionIconPreset, ComponentConfig, PageConfig, UIImageBinding } from '@galcraft/contracts';
import { componentDefinition, effectiveImages } from '@galcraft/templates';
import { CandidateButton, CandidateFieldGroup, CandidateIconButton, CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateToolbar } from '../components/controls/index.js';
import { editPage } from './page-edit.js';
import { componentVisual, stateNames, updatePageVisual, type PageVisualState } from './page-property-appearance.js';
import { choosePageImage, usePageImage } from './page-property-background.js';
import { currentPropertyComponent, PageCheck, PageChoiceField, PageNumberProperty, PagePropertyStatus, usePagePropertyAction, type PagePropertySession } from './page-property-fields.js';
import { resultValue } from './workface-helpers.js';

const slotNames: Record<string, string> = { icon: '图标', frame: '边框', decoration: '图片／装饰' };
const modes = [{ value: 'contain', label: '完整显示' }, { value: 'cover', label: '填满裁剪' }, { value: 'native', label: '原始大小' }, { value: 'nineSlice', label: '九宫格' }] as const;
const edges = [['top', '上'], ['right', '右'], ['bottom', '下'], ['left', '左']] as const;
const insets = (value: number) => ({ top: value, right: value, bottom: value, left: value });

export function PageImageSlots({ session, page, component, state }: {
  session: PagePropertySession; page: PageConfig; component: ComponentConfig; state: PageVisualState;
}) {
  const slots = [...new Set([...componentDefinition(component.part)?.imageSlots ?? [], ...Object.keys(component.normal.images ?? {}), ...Object.keys(componentVisual(component, state).images ?? {})])];
  const [preferred, setSlot] = useState(slots[0] ?? '');
  const slot = slots.includes(preferred) ? preferred : slots[0];
  if (!slot) return null;
  return <CandidateSection title={`图片槽 · ${stateNames[state]}`} collapsible initiallyOpen={false}>
    {slots.length > 1 && <PageChoiceField label="图片槽" value={slot} options={slots.map(value => ({ value, label: slotNames[value] ?? value }))} onChange={setSlot}/>}
    <PageImageSlot key={`${state}/${slot}`} session={session} page={page} component={component} state={state} slot={slot}/>
  </CandidateSection>;
}

function PageImageSlot({ session, page, component, state, slot }: {
  session: PagePropertySession; page: PageConfig; component: ComponentConfig; state: PageVisualState; slot: string;
}) {
  const { store } = session, action = usePagePropertyAction();
  const [presets, setPresets] = useState<ActionIconPreset[]>();
  const [presetError, setPresetError] = useState(''), [presetBusy, setPresetBusy] = useState(false);
  const assets = store.services.bridge.assets;
  const binding = effectiveImages(component, state)[slot];
  const image = usePageImage(store, binding?.assetId ?? null, binding?.variantId);
  const read = () => currentPropertyComponent(store, page.id, component.id);
  const readBinding = () => effectiveImages(read(), state)[slot];
  const label = slotNames[slot] ?? slot;
  const set = (value: UIImageBinding | null) => {
    const current = read();
    return updatePageVisual(store, page.id, current, state, { images: { ...componentVisual(current, state).images, [slot]: value } }, '调整组件图片槽');
  };
  const adjust = (changes: Partial<UIImageBinding>) => {
    const latest = readBinding();
    if (!latest || latest.assetId !== binding?.assetId || latest.variantId !== binding?.variantId) throw new Error('图片已变化，请重新编辑。');
    return set({ ...latest, ...changes });
  };
  const number = (key: 'opacity' | 'positionX' | 'positionY', name: string) => binding && <PageNumberProperty session={session}
    name={`${component.id}/${state}/images/${slot}/${key}`} label={`${label} · ${name}`} value={binding[key]} read={() => readBinding()?.[key] ?? -1}
    commit={value => adjust({ [key]: value })} min={0} max={1} step={0.05}/>;
  const pickPreset = async (preset: ActionIconPreset) => {
    if (!assets || presetBusy) return;
    setPresetBusy(true); setPresetError('');
    try {
      const receipt = resultValue(await assets.importIconPreset({ key: preset.key, componentId: component.id, state }));
      if (receipt) { await store.controller.acceptExternalEdit(receipt, page.id); store.refreshFromHost(); }
      setPresets(undefined);
    } catch (error) { setPresetError(error instanceof Error ? error.message : String(error)); }
    finally { setPresetBusy(false); }
  };
  return <>
    <div className="candidate-property-media">
      <span className="candidate-property-thumb">{image?.uri ? <img src={image.uri} alt=""/> : <ImageIcon size={18} aria-hidden="true"/>}</span>
      <div><strong>{image?.name ?? (binding ? '正在读取图片' : '未设置图片')}</strong><p className="candidate-property-note">{image?.fault ?? label}</p></div>
    </div>
    <CandidateToolbar label={`${label}图片操作`}>
      <CandidateButton variant="outline" disabled={action.busy} onClick={event => void action.run(() => choosePageImage(store, event, `设置${label}`, binding?.assetId ?? null, binding?.variantId ?? null, choice => {
        if (JSON.stringify(readBinding()) !== JSON.stringify(binding)) throw new Error('图片槽已变化，请重新打开素材选择器。');
        return set({ assetId: choice.assetId, variantId: choice.variantId ?? choice.asset.activeVariantId, mode: 'contain', positionX: .5, positionY: .5,
          colorMode: 'original', tint: null, opacity: 1, slices: null, borders: null, fillCenter: false });
      }))}>作品图片</CandidateButton>
      {slot === 'icon' && <CandidateButton disabled={action.busy} disabledReason={!assets?.iconPresets || !assets.importIconPreset ? '当前审核宿主未提供常用图标素材服务。' : undefined}
        onClick={() => void action.run(async () => { setPresetError(''); setPresets(resultValue(await assets!.iconPresets())); })}>常用图标</CandidateButton>}
      {binding && <CandidateIconButton label={`清除${label}`} disabled={action.busy} onClick={() => void action.run(() => set(null))}><Trash2 size={14}/></CandidateIconButton>}
      {state !== 'normal' && Object.hasOwn(component.states[state]?.images ?? {}, slot) && <CandidateButton disabled={action.busy} onClick={() => void action.run(() => {
        const current = read();
        const images = Object.fromEntries(Object.entries(current.states[state]?.images ?? {}).filter(([key]) => key !== slot));
        if (Object.keys(images).length) return updatePageVisual(store, page.id, current, state, { images }, '恢复图片槽继承');
        return editPage(store, '恢复图片槽继承', [{ kind: 'component.clear', pageId: page.id, componentId: component.id, paths: [`states.${state}.images`] }]);
      })}>恢复普通状态</CandidateButton>}
    </CandidateToolbar>
    {binding && <>
      <div className="candidate-property-grid">
        <PageChoiceField label={`${label} · 图像适配`} value={binding.mode} options={slot === 'frame' || binding.mode === 'nineSlice' ? modes : modes.slice(0, 3)} disabled={action.busy}
          onChange={mode => void action.run(() => adjust(mode === 'nineSlice'
            ? { mode, slices: binding.slices ?? insets(8), borders: binding.borders ?? binding.slices ?? insets(8), fillCenter: true }
            : { mode, slices: null, borders: null, fillCenter: false }))}/>
        {number('opacity', '不透明度')}
        {number('positionX', '水平位置')}
        {number('positionY', '垂直位置')}
      </div>
      {binding.mode === 'nineSlice' && <>
        {(['slices', 'borders'] as const).map(group => <CandidateFieldGroup key={group} title={group === 'slices' ? '源图切线' : '显示边厚'}
          description={group === 'slices' ? '使用源图像素，SVG 使用 viewBox 单位。' : '使用设计像素，随舞台缩放。'}>
          <div className="candidate-property-grid">{edges.map(([key, side]) => <PageNumberProperty key={key} session={session} name={`${component.id}/${state}/images/${slot}/${group}/${key}`}
            label={`${group === 'slices' ? '源图切线' : '显示边厚'} · ${side}`} value={binding[group]?.[key] ?? 0} read={() => readBinding()?.[group]?.[key] ?? 0}
            min={0} commit={value => adjust({ [group]: { ...(readBinding()?.[group] ?? insets(0)), [key]: value } })}/>)}</div>
        </CandidateFieldGroup>)}
        <PageCheck label="填充中心" value={binding.fillCenter} onChange={fillCenter => void action.run(() => adjust({ fillCenter }))}/>
      </>}
    </>}
    <PagePropertyStatus fault={action.fault}/>
    <CandidateReviewDialog open={!!presets} title="常用图标" onDismiss={() => setPresets(undefined)} busy={presetBusy}>
      {!presets?.length && <p className="candidate-property-note">当前没有可用图标。</p>}
      {presets?.map(preset => <CandidateObjectRow key={preset.key} title={preset.names[store.controller.preferences.locale] ?? preset.key}
        icon={<img src={preset.previewUri} alt="" width={14} height={14}/>} onActivate={() => void pickPreset(preset)}/>)}
      <PagePropertyStatus fault={presetError}/>
    </CandidateReviewDialog>
  </>;
}
