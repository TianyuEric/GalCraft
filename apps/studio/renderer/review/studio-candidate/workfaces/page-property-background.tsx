import { useEffect, useState, type MouseEvent } from 'react';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import type { Background, PageConfig } from '@galcraft/contracts';
import type { AssetPickerChoice } from '../../../authoring/asset-picker.js';
import type { WorkbenchFieldPreview } from '../../../authoring/page-designer.js';
import { openCandidateAssetPicker } from '../components/CandidateAssetPicker.js';
import { CandidateButton, CandidateIconButton, CandidateSection, CandidateToolbar } from '../components/controls/index.js';
import { editPage, type PageStore } from './page-edit.js';
import { currentPropertyPage, PageChoiceField, PageNumberProperty, PagePropertyStatus, PageTextProperty, usePagePropertyAction, type PagePropertySession } from './page-property-fields.js';

export const backgroundFits = [{ value: 'cover', label: '填满裁剪' }, { value: 'contain', label: '完整显示' }, { value: 'native', label: '原始大小' }] as const;

export async function choosePageImage(store: PageStore, event: MouseEvent<HTMLButtonElement>, purpose: string, imageId: string | null, variantId: string | null, apply: (value: AssetPickerChoice) => Promise<unknown>, chooseVersion = true) {
  const projectId = store.controller.source?.project.projectId;
  if (!projectId) throw new Error('作品正在加载，请稍后选择图片。');
  const trigger = event.currentTarget;
  await openCandidateAssetPicker({ services: store.services, projectId, allowedKinds: ['image'], locale: store.controller.preferences.locale,
    scope: trigger.closest<HTMLElement>('.gc-candidate') ?? undefined, returnFocus: trigger, currentAssetId: imageId, currentVariantId: variantId,
    purpose, mode: 'compact', chooseVersion, onApply: async choice => { await apply(choice); return { ok: true, value: undefined, warnings: [] }; } });
}

export function usePageImage(store: PageStore, assetId: string | null, variantId?: string) {
  const [image, setImage] = useState<{ name: string; uri?: string; fault?: string }>();
  const revision = store.controller.source?.assetIndexRevision;
  useEffect(() => {
    setImage(undefined);
    if (!assetId) return;
    let active = true;
    const resources = store.services.runtimeAssets;
    let release: (() => void) | undefined;
    void (async () => {
      const info = await store.services.getAsset?.(assetId);
      if (!active) return;
      if (!info?.ok || !info.value) { setImage({ name: assetId, fault: '图片素材不可用。' }); return; }
      const { name, activeVariantId } = info.value;
      setImage({ name });
      const result = await resources?.resolveRuntime(assetId, variantId ?? activeVariantId);
      if (!result?.ok || !resources) return;
      release = () => { void resources.releaseRuntime(result.value.leaseId); };
      if (!active) { release(); return; }
      setImage({ name, uri: result.value.uri });
    })().catch(() => { if (active) setImage({ name: assetId, fault: '暂时无法读取图片预览。' }); });
    return () => { active = false; release?.(); };
  }, [store, assetId, variantId, revision]);
  return image;
}

export const validColor = (value: string) => /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);

export function PageBackgroundProperties({ session, page, previewField }: {
  session: PagePropertySession; page: PageConfig; previewField: (value: WorkbenchFieldPreview | null) => void;
}) {
  const { store } = session, { background } = page;
  const image = usePageImage(store, background.imageId);
  const action = usePagePropertyAction();
  const read = () => currentPropertyPage(store, page.id).background;
  const update = (changes: Partial<Background>) => editPage(store, '修改页面背景', [{ kind: 'page.update', pageId: page.id, background: { ...read(), ...changes } }]);
  const preview = (color: string, opacity: number) => previewField({ kind: 'background', color, opacity });
  const number = (key: 'colorOpacity' | 'imageOpacity' | 'positionX' | 'positionY', label: string) => <PageNumberProperty session={session}
    name={`background/${key}`} label={label} value={background[key]} read={() => read()[key]} commit={value => update({ [key]: value })} min={0} max={1} step={0.05}
    preview={key === 'colorOpacity' ? value => value === null ? previewField(null) : preview(background.color, value) : undefined}/>;
  return <CandidateSection title="页面背景">
    <div className="candidate-property-grid">
      <PageTextProperty session={session} name="background/color" label="底色" value={background.color} read={() => read().color} short swatch
        preview={value => value && validColor(value) ? preview(value, background.colorOpacity) : previewField(null)}
        commit={value => { if (!validColor(value)) throw new Error('请输入十六进制颜色，例如 #223344。'); return update({ color: value }); }}/>
      {number('colorOpacity', '底色不透明度')}
    </div>
    <div className="candidate-property-media">
      <span className="candidate-property-thumb">{image?.uri ? <img src={image.uri} alt=""/> : <ImageIcon size={18} aria-hidden="true"/>}</span>
      <div><strong>{image?.name ?? (background.imageId ? '正在读取图片' : '使用底色')}</strong><p className="candidate-property-note">{image?.fault ?? '页面背景图片'}</p></div>
    </div>
    <CandidateToolbar label="背景图片操作">
      <CandidateButton variant="outline" disabled={action.busy} onClick={event => {
        const expected = background.imageId;
        void action.run(() => choosePageImage(store, event, '页面背景', expected, null, choice => {
          if (read().imageId !== expected) throw new Error('背景图片已变化，请重新打开素材选择器。');
          return update({ imageId: choice.assetId });
        }, false));
      }}>{background.imageId ? '更换背景图片' : '选择背景素材'}</CandidateButton>
      {background.imageId && <CandidateIconButton label="清除背景图片" disabled={action.busy} onClick={() => void action.run(() => update({ imageId: null }))}><Trash2 size={14}/></CandidateIconButton>}
    </CandidateToolbar>
    {background.imageId && <div className="candidate-property-grid">
      <PageChoiceField label="图片适配" value={background.fit} options={backgroundFits} onChange={fit => void action.run(() => update({ fit }))} disabled={action.busy}/>
      {number('imageOpacity', '图片不透明度')}
      {number('positionX', '图片水平位置')}
      {number('positionY', '图片垂直位置')}
    </div>}
    <PagePropertyStatus fault={action.fault}/>
  </CandidateSection>;
}
