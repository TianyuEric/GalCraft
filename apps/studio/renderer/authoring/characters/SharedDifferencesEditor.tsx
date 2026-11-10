import React, {useEffect,useRef,useState} from 'react';
import {createId} from '@galcraft/contracts';
import type {Asset,CharacterDifference,Id,StudioBridge} from '@galcraft/contracts';
import {Button,Choice,Field} from '../../components/controls.js';
import {Input} from '../../components/ui/input.js';
import {Plus,Trash2,ScanFace} from 'lucide-react';
import { defaultDifferenceCrop, differenceVersionLabel } from './model.js';
import './SharedDifferencesEditor.css';
export type DifferenceResources=Pick<StudioBridge['assets'],'resolveRuntime'|'releaseRuntime'>;
type Crop=Extract<NonNullable<CharacterDifference['avatar']>,{kind:'crop'}>['crop'];
type CropHandle='move'|'nw'|'ne'|'sw'|'se';
const defaultCrop:Crop=defaultDifferenceCrop;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
function movedCrop(start:Crop,handle:CropHandle,dx:number,dy:number):Crop{
  if(handle==='move')return {...start,x:clamp(start.x+dx,0,1-start.width),y:clamp(start.y+dy,0,1-start.height)};
  let left=start.x,top=start.y,right=Math.min(1,start.x+start.width),bottom=Math.min(1,start.y+start.height);
  if(handle.includes('w'))left=clamp(left+dx,0,right-.001);else right=clamp(right+dx,left+.001,1);
  if(handle.includes('n'))top=clamp(top+dy,0,bottom-.001);else bottom=clamp(bottom+dy,top+.001,1);
  return {x:left,y:top,width:right-left,height:bottom-top};
}
export function FigureCropEditor({difference,assets,resources,crop,change,locale,disabled,resetCrop=defaultCrop}:{difference:CharacterDifference;assets:Asset[];resources?:DifferenceResources;crop:Crop;change(crop:Crop):void;locale:string;disabled?:boolean;resetCrop?:Crop}){
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const canvas=useRef<HTMLCanvasElement>(null),frame=useRef<HTMLDivElement>(null),gesture=useRef<{start:Crop;handle:CropHandle;x:number;y:number;width:number;height:number;pointerId:number}|null>(null);
  const [draft,setDraft]=useState(crop),draftRef=useRef(crop),[size,setSize]=useState({width:1,height:1}),[error,setError]=useState('');
  const asset=assets.find(asset=>asset.id===difference.figure.assetId),variantId=difference.figure.variantId??asset?.activeVariantId;
  const variant=asset?.variants.find(item=>item.id===variantId);
  const [ready,setReady]=useState(false);
  const show=(value:Crop)=>{draftRef.current=value;setDraft(value);};
  useEffect(()=>{if(!gesture.current)show(crop);},[crop.x,crop.y,crop.width,crop.height]);
  useEffect(()=>{let active=true,lease:string|undefined;setError('');setReady(false);if(canvas.current)canvas.current.getContext('2d')?.clearRect(0,0,canvas.current.width,canvas.current.height);
    if(!resources||!asset||!variantId||!variant){setError(t('裁剪源图不可用','Crop source is unavailable','切り抜きの元画像を利用できません'));return;}
    void resources.resolveRuntime(asset.id,variantId).then(async result=>{if(!result.ok){if(active)setError(result.error.message);return;}if(!active){void resources.releaseRuntime(result.value.leaseId);return;}lease=result.value.leaseId;
      const image=new window.Image();image.crossOrigin='anonymous';image.src=result.value.uri;
      await image.decode();if(!active||!canvas.current)return;const width=variant.canvas?.width??image.naturalWidth,height=variant.canvas?.height??image.naturalHeight;
      canvas.current.width=width;canvas.current.height=height;canvas.current.getContext('2d')?.drawImage(image,variant.canvas?.offsetX??0,variant.canvas?.offsetY??0);setSize({width,height});setReady(true);
    }).catch(()=>{if(active)setError(t('裁剪源图解码失败','Crop source could not be loaded','切り抜き元画像を読み込めません'));});
    return()=>{active=false;if(lease)void resources.releaseRuntime(lease);};
  },[asset,variantId,variant,resources,locale]);
  const cancel=()=>{const current=gesture.current;if(!current)return;gesture.current=null;show(current.start);if(frame.current?.hasPointerCapture(current.pointerId))frame.current.releasePointerCapture(current.pointerId);};
  return <div className="shared-difference-crop"><p>{t('拖动选框或角点；方向键微调 1 像素，Shift 加速至 10 像素。Esc 取消本次拖动。','Drag the frame or corners. Arrow keys adjust by 1 source pixel; Shift adjusts by 10. Esc cancels a drag.','枠や角をドラッグし、矢印キーで元画像の1ピクセル、Shift併用で10ピクセル調整します。Escでドラッグを取り消します。')}</p>
    <div ref={frame} className="shared-difference-crop-source" style={{aspectRatio:`${size.width}/${size.height}`,maxWidth:Math.min(560,420*size.width/size.height)}} role="group" aria-label={t('源图裁剪','Source-image crop','元画像の切り抜き')}
      onPointerDown={event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-crop-handle]');if(disabled||!ready||gesture.current||event.button!==0||!target)return;event.preventDefault();target.focus();const rect=event.currentTarget.getBoundingClientRect();gesture.current={start:{...crop},handle:target.dataset.cropHandle as CropHandle,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,pointerId:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{const current=gesture.current;if(!current||current.pointerId!==event.pointerId)return;show(movedCrop(current.start,current.handle,(event.clientX-current.x)/current.width,(event.clientY-current.y)/current.height));}}
      onPointerUp={event=>{const current=gesture.current;if(!current||current.pointerId!==event.pointerId)return;gesture.current=null;const next=draftRef.current;if(next.x!==current.start.x||next.y!==current.start.y||next.width!==current.start.width||next.height!==current.start.height)change(next);}}
      onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();event.stopPropagation();cancel();return;}if(disabled||gesture.current||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;const target=(event.target as HTMLElement).closest<HTMLElement>('[data-crop-handle]');if(!target)return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1,dx=(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)/size.width,dy=(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)/size.height;change(movedCrop(crop,target.dataset.cropHandle as CropHandle,dx,dy));}}>
      <canvas ref={canvas} aria-label={t('裁剪源图','Crop source','切り抜き元画像')}/>{ready && <div className="shared-difference-crop-selection" style={{left:`${draft.x*100}%`,top:`${draft.y*100}%`,width:`${draft.width*100}%`,height:`${draft.height*100}%`}}>
        <button type="button" data-slot="crop-control" className="shared-difference-crop-move" data-crop-handle="move" disabled={disabled} aria-label={t('移动裁剪框','Move crop frame','切り抜き枠を移動')}/>
        {(['nw','ne','sw','se']as const).map((handle,index)=><button key={handle} type="button" data-slot="crop-control" className={`shared-difference-crop-corner shared-difference-crop-${handle}`} data-crop-handle={handle} disabled={disabled} aria-label={[t('调整左上角','Resize top-left corner','左上の角を調整'),t('调整右上角','Resize top-right corner','右上の角を調整'),t('调整左下角','Resize bottom-left corner','左下の角を調整'),t('调整右下角','Resize bottom-right corner','右下の角を調整')][index]}/>)}
      </div>}
    </div>{error&&<p role="status">{error}</p>}<Button disabled={disabled} onClick={()=>change({...resetCrop})}>{t('重置裁剪','Reset crop','切り抜きをリセット')}</Button>
  </div>;
}
const fullImage: Crop = { x: 0, y: 0, width: 1, height: 1 };
function AvatarPreview({ difference, assets, resources, locale }: { difference: CharacterDifference; assets: Asset[]; resources?: DifferenceResources; locale: string }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement>(), [error, setError] = useState('');
  const source = difference.avatar?.kind === 'image' ? difference.avatar : difference.figure;
  const asset = assets.find(item => item.id === source.assetId);
  const variant = asset?.variants.find(item => item.id === (source.variantId ?? asset.activeVariantId));
  const crop = difference.avatar?.kind === 'crop' ? difference.avatar.crop : fullImage;
  const assetId = asset?.id;
  useEffect(() => {
    let active = true, lease: string | undefined;
    setImage(undefined);
    setError('');
    if (!resources || !assetId || !variant) {
      setError(t('差分图片或版本不可用', 'Difference image or version is unavailable', '差分画像またはバージョンを利用できません'));
      return;
    }
    void resources.resolveRuntime(assetId, variant.id).then(async result => {
      if (!result.ok) { if (active) setError(result.error.message); return; }
      if (!active) { void resources.releaseRuntime(result.value.leaseId); return; }
      lease = result.value.leaseId;
      const next = new window.Image();
      next.crossOrigin = 'anonymous';
      next.src = result.value.uri;
      await next.decode();
      if (active) setImage(next);
    }).catch(() => { if (active) setError(t('差分头像图片读取失败', 'The portrait image could not be loaded', 'アバター画像を読み込めません')); });
    return () => { active = false; if (lease) void resources.releaseRuntime(lease); };
  }, [assetId, variant, resources, locale]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    context?.clearRect(0, 0, 300, 300);
    if (!image || !context) return;
    const width = variant?.canvas?.width ?? image.naturalWidth, height = variant?.canvas?.height ?? image.naturalHeight;
    const sw = width * crop.width, sh = height * crop.height, scale = Math.min(300 / sw, 300 / sh);
    const offsetX = variant?.canvas?.offsetX ?? 0, offsetY = variant?.canvas?.offsetY ?? 0, x = crop.x * width, y = crop.y * height;
    const left = Math.max(x, offsetX), top = Math.max(y, offsetY), right = Math.min(x + sw, offsetX + image.naturalWidth), bottom = Math.min(y + sh, offsetY + image.naturalHeight);
    if (right > left && bottom > top) context.drawImage(image, left - offsetX, top - offsetY, right - left, bottom - top, (300 - sw * scale) / 2 + (left - x) * scale, (300 - sh * scale) / 2 + (top - y) * scale, (right - left) * scale, (bottom - top) * scale);
  }, [image, crop, variant]);
  const label = t('共同差分头像预览', 'Shared difference portrait preview', '共通差分のアバタープレビュー');
  return <figure className="shared-difference-portrait"><canvas ref={canvas} width={300} height={300} aria-label={label} /><figcaption>{label}</figcaption>{error && <p role="status">{error}</p>}</figure>;
}
export function SharedDifferencesEditor({ value, initialId, change, assets, locale, disabled, resources, previewAsset, produceDifference, removeDifference, persistedIds, selectedId, onSelect }: {
  value: CharacterDifference[]; initialId: Id | null; change(value: CharacterDifference[], initialId: Id | null): void;
  assets: Asset[]; locale: string; disabled?: boolean; resources?: DifferenceResources;
  previewAsset?(id: Id, variantId?: Id): void; removeDifference?(id: Id, replacementId?: Id): Promise<void>;
  produceDifference?(differenceId: Id, assetId: Id, variantId: Id): void;
  persistedIds?: readonly Id[]; selectedId?: Id; onSelect?(id: Id): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [localId, setLocalId] = useState<Id>();
  const [replacement, setReplacement] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [removing, setRemoving] = useState(false);
  const difference = value.find(item => item.id === (selectedId ?? localId)) ?? value.find(item => item.id === initialId) ?? value[0];
  const images = assets.filter(asset => asset.kind === 'image');
  const referenceAsset = images.find(asset => asset.id === difference?.figure.assetId);
  const referenceVersion = referenceAsset?.variants.find(variant => variant.id === (difference?.figure.variantId ?? referenceAsset.activeVariantId));
  const availableImage = images.find(asset => asset.variants.some(variant => variant.id === asset.activeVariantId));
  const blocked = disabled || removing;
  const persisted = !!removeDifference && !!difference && (persistedIds?.includes(difference.id) ?? true);
  const select = (id: Id) => { setLocalId(id); onSelect?.(id); setReplacement(''); setRemoveError(''); };
  const update = (patch: Partial<CharacterDifference>) => change(value.map(item => item.id === difference?.id ? { ...item, ...patch } : item), initialId);
  const add = () => {
    if (!availableImage) return;
    const item: CharacterDifference = { id: createId(value), name: t('新差分', 'New difference', '新しい差分'),
      figure: { assetId: availableImage.id, variantId: availableImage.activeVariantId }, avatar: { kind: 'crop', crop: { ...defaultCrop } } };
    change([...value, item], initialId ?? item.id);
    select(item.id);
  };
  const remove = async () => {
    if (!difference) return;
    setRemoveError('');
    if (persisted && removeDifference) {
      setRemoving(true);
      try { await removeDifference(difference.id, replacement || undefined); }
      catch (reason) { setRemoveError(reason instanceof Error ? reason.message : String(reason)); return; }
      finally { setRemoving(false); }
    } else {
      const next = value.filter(item => item.id !== difference.id);
      change(next, initialId === difference.id ? next[0]?.id ?? null : initialId);
    }
    setReplacement('');
  };
  const assetField = (label: string, versionLabel: string, source: CharacterDifference['figure'], set: (source: CharacterDifference['figure']) => void) => {
    const asset = images.find(item => item.id === source.assetId);
    const missingVersion = source.variantId && !asset?.variants.some(item => item.id === source.variantId) ? source.variantId : null;
    return <div className="shared-difference-image-fields">
      <Field label={label}><Choice label={label} disabled={blocked} value={source.assetId} options={[
        ...(!source.assetId ? [{ value: '', label: t('选择图片', 'Choose image', '画像を選択') }] : []),
        ...images.map(item => ({ value: item.id, label: item.name })),
        ...(!asset && source.assetId ? [{ value: source.assetId, label: t('原图片缺失', 'Original image missing', '元の画像なし') }] : []),
      ]} onChange={assetId => set({ assetId, variantId: images.find(item => item.id === assetId)?.activeVariantId ?? null })} /></Field>
      {asset && <Field label={versionLabel}><Choice label={versionLabel} disabled={blocked} value={source.variantId ?? ''} options={[
        { value: '', label: t('跟随采用版本', 'Follow active version', '採用バージョンに追従') },
        ...asset.variants.map(variant => ({ value: variant.id, label: differenceVersionLabel(asset, variant.id, locale) })),
        ...(missingVersion ? [{ value: missingVersion, label: differenceVersionLabel(asset, missingVersion, locale) }] : []),
      ]} onChange={variantId => set({ ...source, variantId: variantId || null })} /></Field>}
    </div>;
  };
  const avatar = difference?.avatar;
  const crop = avatar?.kind === 'crop' ? avatar.crop : undefined;
  const portraitLabel = t('头像来源', 'Portrait source', 'アバターの種類');
  const replaceLabel = t('删除时引用替换为', 'Replace references on removal', '削除時の参照置換先');
  return <section className="shared-differences">
    <header className="shared-difference-heading">
      <h3><ScanFace size={16} aria-hidden="true" />{t('共同差分', 'Shared differences', '共通差分')}</h3>
      <Button disabled={blocked || !availableImage} onClick={add}><Plus size={15} />{t('添加共同差分', 'Add difference', '共通差分を追加')}</Button>
    </header>
    <p className="shared-difference-hint">{t('舞台立绘与阅读头像共享同一命名差分。场景中的当前差分与实例变换由演出指令控制。', 'The stage figure and reading portrait share a named difference. Scene commands control the current difference and instance transform.', '舞台の立ち絵と会話アバターは同じ差分を使います。現在の差分とインスタンスの変形はシーンの演出命令で制御します。')}</p>
    {!availableImage && <p className="shared-difference-hint">{t('先导入角色图片，再配置命名差分。', 'Import a character image to configure differences.', 'キャラクター画像を読み込んでください。')}</p>}
    {availableImage && !difference && <p className="shared-difference-hint">{t('添加差分后可选择立绘版本、阅读头像与取景。', 'Add a difference to select a figure version, reading portrait and framing.', '差分を追加すると立ち絵のバージョン、アバター、構図を選べます。')}</p>}
    {difference && <div className="shared-difference-layout">
      <nav className="shared-difference-list" aria-label={t('差分列表', 'Difference list', '差分一覧')}>
        {value.map(item => <Button key={item.id} tone="quiet" disabled={blocked} aria-current={item.id === difference.id ? 'true' : undefined} onClick={() => select(item.id)}>
          <span>{item.name || t('未命名差分', 'Untitled difference', '名称未設定の差分')}</span>
          {item.id === initialId && <small>{t('初始', 'Initial', '開始時')}</small>}
        </Button>)}
      </nav>
      <div className="shared-difference-detail" key={difference.id}>
        <Field label={t('差分名称', 'Difference name', '差分名')} required><Input disabled={blocked} value={difference.name} onChange={event => update({ name: event.target.value })} /></Field>
        <div className="shared-difference-actions">
          {difference.id === initialId ? <span className="shared-difference-hint">{t('新会话初始差分', 'Initial difference for new sessions', '開始時の差分')}</span>
            : <Button disabled={blocked} onClick={() => change(value, difference.id)}>{t('设为新会话初始差分', 'Set as initial difference', '開始時の差分にする')}</Button>}
          {previewAsset && <Button disabled={blocked || !images.some(asset => asset.id === difference.figure.assetId && (!difference.figure.variantId || asset.variants.some(variant => variant.id === difference.figure.variantId)))} onClick={() => previewAsset(difference.figure.assetId, difference.figure.variantId ?? undefined)}>{t('查看源图', 'View source', '元画像を表示')}</Button>}
          {produceDifference && referenceAsset && referenceVersion && <Button disabled={blocked} onClick={() => produceDifference(difference.id, referenceAsset.id, referenceVersion.id)}>{t('制作整图差分', 'Create figure variation', '全身差分を制作')}</Button>}
        </div>
        {assetField(t('立绘源图', 'Figure source', '立ち絵の元画像'), t('立绘版本', 'Figure version', '立ち絵のバージョン'), difference.figure, figure => update({ figure }))}
        <Field label={portraitLabel}><Choice label={portraitLabel} disabled={blocked} value={avatar?.kind ?? 'default'} options={[
          { value: 'default', label: t('角色默认头像', 'Character default', '標準アバター') },
          { value: 'image', label: t('独立图片', 'Separate image', '別画像') },
          { value: 'crop', label: t('裁剪此立绘', 'Crop this figure', '立ち絵から切り抜く') },
        ]} onChange={kind => update({ avatar: kind === 'image' ? { kind, ...difference.figure } : kind === 'crop' ? { kind, crop: { ...defaultCrop } } : null })} /></Field>
        {avatar?.kind === 'image' && assetField(t('头像图片', 'Portrait image', 'アバター画像'), t('头像版本', 'Portrait version', 'アバターのバージョン'), avatar, source => update({ avatar: { kind: 'image', ...source } }))}
        {crop && <>
          <FigureCropEditor difference={difference} assets={assets} resources={resources} crop={crop} change={crop => update({ avatar: { kind: 'crop', crop } })} locale={locale} disabled={blocked} />
          <div className="shared-difference-image-fields">{([
            ['x', t('横坐标', 'Left', '左')], ['y', t('纵坐标', 'Top', '上')],
            ['width', t('宽度', 'Width', '幅')], ['height', t('高度', 'Height', '高さ')],
          ] as const).map(([key, label]) => <Field key={key} label={label}><Input type="number" min={key === 'width' || key === 'height' ? .001 : 0} max={1} step={.001}
            disabled={blocked} value={crop[key]} onChange={event => {
              const value = event.currentTarget.valueAsNumber;
              const min = key === 'width' || key === 'height' ? .001 : 0;
              if (Number.isFinite(value)) update({ avatar: { kind: 'crop', crop: { ...crop, [key]: clamp(value, min, 1) } } });
            }} /></Field>)}</div>
        </>}
        {avatar && <AvatarPreview difference={difference} assets={assets} resources={resources} locale={locale} />}
        <details className="shared-difference-remove">
          <summary>{t('移除差分', 'Remove difference', '差分を削除')}</summary>
          {persisted && <Field label={replaceLabel}><Choice label={replaceLabel} disabled={blocked} value={replacement} options={[
            { value: '', label: t('无替代，需先解除引用', 'None. References must be clear', 'なし。参照の解除が必要') },
            ...value.filter(item => item.id !== difference.id).map(item => ({ value: item.id, label: item.name })),
          ]} onChange={setReplacement} /></Field>}
          <Button tone="danger" disabled={blocked} onClick={() => void remove()}><Trash2 size={15} />{t('移除此差分', 'Remove this difference', 'この差分を削除')}</Button>
          {removeError && <p role="alert" className="character-error">{removeError}</p>}
        </details>
      </div>
    </div>}
  </section>;
}
