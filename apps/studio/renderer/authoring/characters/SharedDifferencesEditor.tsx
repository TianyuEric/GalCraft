import React, {useEffect,useRef,useState} from 'react';
import {createId} from '@galcraft/contracts';
import type {Asset,CharacterDifference,Id,StudioBridge} from '@galcraft/contracts';
import {Button,Choice,Field} from '../../components/controls.js';
import {Input} from '../../components/ui/input.js';
import {Plus,Trash2,Image,ScanFace} from 'lucide-react';
import './SharedDifferencesEditor.css';
export type DifferenceResources=Pick<StudioBridge['assets'],'resolveRuntime'|'releaseRuntime'>;
type Crop=Extract<NonNullable<CharacterDifference['avatar']>,{kind:'crop'}>['crop'];
type CropHandle='move'|'nw'|'ne'|'sw'|'se';
const defaultCrop:Crop={x:.25,y:0,width:.5,height:.35};
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
  const show=(value:Crop)=>{draftRef.current=value;setDraft(value);};
  useEffect(()=>{if(!gesture.current)show(crop);},[crop.x,crop.y,crop.width,crop.height]);
  useEffect(()=>{let active=true,lease:string|undefined;setError('');if(canvas.current)canvas.current.getContext('2d')?.clearRect(0,0,canvas.current.width,canvas.current.height);const asset=assets.find(asset=>asset.id===difference.figure.assetId),variantId=difference.figure.variantId??asset?.activeVariantId;
    if(!resources||!asset||!variantId){setError(t('裁剪源图不可用','Crop source is unavailable','切り抜きの元画像を利用できません'));return;}
    void resources.resolveRuntime(asset.id,variantId).then(async result=>{if(!result.ok){if(active)setError(result.error.message);return;}if(!active){void resources.releaseRuntime(result.value.leaseId);return;}lease=result.value.leaseId;
      const image=new window.Image();image.crossOrigin='anonymous';image.src=result.value.uri;
      try{await image.decode();if(!active||!canvas.current)return;const variant=asset.variants.find(value=>value.id===variantId),width=variant?.canvas?.width??image.naturalWidth,height=variant?.canvas?.height??image.naturalHeight;
        canvas.current.width=width;canvas.current.height=height;canvas.current.getContext('2d')?.drawImage(image,variant?.canvas?.offsetX??0,variant?.canvas?.offsetY??0);setSize({width,height});
      }catch{if(active)setError(t('裁剪源图解码失败','Crop source could not be decoded','切り抜き元画像を読み込めません'));}});
    return()=>{active=false;if(lease)void resources.releaseRuntime(lease);};
  },[difference.figure.assetId,difference.figure.variantId,assets,resources,locale]);
  const cancel=()=>{const current=gesture.current;if(!current)return;gesture.current=null;show(current.start);if(frame.current?.hasPointerCapture(current.pointerId))frame.current.releasePointerCapture(current.pointerId);};
  return <div className="shared-difference-crop"><p>{t('拖动选框或角点；方向键微调 1 像素，Shift 加速至 10 像素。Esc 取消本次拖动。','Drag the frame or corners. Arrow keys adjust by 1 source pixel; Shift adjusts by 10. Esc cancels a drag.','枠や角をドラッグし、矢印キーで元画像の1ピクセル、Shift併用で10ピクセル調整します。Escでドラッグを取り消します。')}</p>
    <div ref={frame} className="shared-difference-crop-source" style={{aspectRatio:`${size.width}/${size.height}`,maxWidth:Math.min(560,420*size.width/size.height)}} role="group" aria-label={t('源图裁剪','Source-image crop','元画像の切り抜き')}
      onPointerDown={event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-crop-handle]');if(disabled||event.button!==0||!target||size.width===1)return;event.preventDefault();target.focus();const rect=event.currentTarget.getBoundingClientRect();gesture.current={start:{...crop},handle:target.dataset.cropHandle as CropHandle,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,pointerId:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{const current=gesture.current;if(!current||current.pointerId!==event.pointerId)return;show(movedCrop(current.start,current.handle,(event.clientX-current.x)/current.width,(event.clientY-current.y)/current.height));}}
      onPointerUp={event=>{const current=gesture.current;if(!current||current.pointerId!==event.pointerId)return;gesture.current=null;const next=draftRef.current;if(next.x!==current.start.x||next.y!==current.start.y||next.width!==current.start.width||next.height!==current.start.height)change(next);}}
      onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();event.stopPropagation();cancel();return;}if(disabled||gesture.current||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;const target=(event.target as HTMLElement).closest<HTMLElement>('[data-crop-handle]');if(!target)return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1,dx=(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)/size.width,dy=(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)/size.height;change(movedCrop(crop,target.dataset.cropHandle as CropHandle,dx,dy));}}>
      <canvas ref={canvas} aria-label={t('裁剪源图','Crop source','切り抜き元画像')}/><div className="shared-difference-crop-selection" style={{left:`${draft.x*100}%`,top:`${draft.y*100}%`,width:`${draft.width*100}%`,height:`${draft.height*100}%`}}>
        <button type="button" data-slot="crop-control" className="shared-difference-crop-move" data-crop-handle="move" disabled={disabled} aria-label={t('移动裁剪框','Move crop frame','切り抜き枠を移動')}/>
        {(['nw','ne','sw','se']as const).map((handle,index)=><button key={handle} type="button" data-slot="crop-control" className={`shared-difference-crop-corner shared-difference-crop-${handle}`} data-crop-handle={handle} disabled={disabled} aria-label={[t('调整左上角','Resize top-left corner','左上の角を調整'),t('调整右上角','Resize top-right corner','右上の角を調整'),t('调整左下角','Resize bottom-left corner','左下の角を調整'),t('调整右下角','Resize bottom-right corner','右下の角を調整')][index]}/>)}
      </div>
    </div>{error&&<p role="status">{error}</p>}<Button disabled={disabled} onClick={()=>change({...resetCrop})}>{t('重置裁剪','Reset crop','切り抜きをリセット')}</Button>
  </div>;
}
function AvatarPreview({difference,assets,resources}:{difference:CharacterDifference;assets:Asset[];resources?:DifferenceResources}){
  const canvas=useRef<HTMLCanvasElement>(null),[error,setError]=useState('');
  useEffect(()=>{let active=true,lease:string|undefined;setError('');const context=canvas.current?.getContext('2d');context?.clearRect(0,0,300,300);
    const source=difference.avatar?.kind==='image'?difference.avatar:difference.figure;
    const asset=assets.find(asset=>asset.id===source.assetId),variantId=source.variantId??asset?.activeVariantId;
    if(!resources||!asset||!variantId){setError(!resources?'预览需要作品素材服务':'差分图片或版本不可用');return;}
    void resources.resolveRuntime(source.assetId,variantId).then(async result=>{if(!result.ok){if(active)setError(result.error.message);return;}
      if(!active){void resources.releaseRuntime(result.value.leaseId);return;}lease=result.value.leaseId;const image=new window.Image();image.crossOrigin='anonymous';image.src=result.value.uri;
      try{await image.decode();if(!active||!context)return;const variant=asset.variants.find(value=>value.id===variantId),width=variant?.canvas?.width??image.naturalWidth,height=variant?.canvas?.height??image.naturalHeight;
        const crop=difference.avatar?.kind==='crop'?difference.avatar.crop:{x:0,y:0,width:1,height:1},sw=width*crop.width,sh=height*crop.height,scale=Math.min(300/sw,300/sh);
        const offsetX=variant?.canvas?.offsetX??0,offsetY=variant?.canvas?.offsetY??0,x=crop.x*width,y=crop.y*height;
        const left=Math.max(x,offsetX),top=Math.max(y,offsetY),right=Math.min(x+sw,offsetX+image.naturalWidth),bottom=Math.min(y+sh,offsetY+image.naturalHeight);
        if(right>left&&bottom>top)context.drawImage(image,left-offsetX,top-offsetY,right-left,bottom-top,(300-sw*scale)/2+(left-x)*scale,(300-sh*scale)/2+(top-y)*scale,(right-left)*scale,(bottom-top)*scale);
      }catch{if(active)setError('差分头像图片解码失败');}});
    return()=>{active=false;if(lease)void resources.releaseRuntime(lease);};
  },[JSON.stringify(difference),resources,assets]);
  return <div><canvas ref={canvas} width={300} height={300} aria-label="共同差分头像预览" style={{width:150,height:150,objectFit:'contain',background:'var(--workbench-inspector)',border:'1px solid var(--border)',borderRadius:6}}/>{error&&<p role="status">{error}</p>}</div>;
}
export function SharedDifferencesEditor({value,initialId,change,assets,locale,disabled,resources,previewAsset,removeDifference}:{
  value:CharacterDifference[];initialId:Id|null;change(value:CharacterDifference[],initialId:Id|null):void;assets:Asset[];locale:string;disabled?:boolean;resources?:DifferenceResources;previewAsset?(id:Id):void;removeDifference?(id:Id,replacementId?:Id):Promise<void>;
}){
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const [replacement,setReplacement]=useState<Record<string,string>>({}),[removeError,setRemoveError]=useState('');
  const images=assets.filter(asset=>asset.kind==='image');
  const update=(id:Id,patch:Partial<CharacterDifference>)=>change(value.map(item=>item.id===id?{...item,...patch}:item),initialId);
  const assetField=(label:string,source:{assetId:Id;variantId:Id|null},set:(source:{assetId:Id;variantId:Id|null})=>void)=>{
    const asset=images.find(asset=>asset.id===source.assetId);
    return <><Field label={label}><Choice label={label} disabled={disabled} value={source.assetId} options={[{value:'',label:t('选择图片','Choose image','画像を選択')},...images.map(asset=>({value:asset.id,label:asset.name})),...(!asset&&source.assetId?[{value:source.assetId,label:t('原图片缺失','Original image missing','元の画像なし')}]:[])]} onChange={assetId=>set({assetId,variantId:images.find(asset=>asset.id===assetId)?.activeVariantId??null})}/></Field>
      {asset&&<Field label={t('固定版本','Pinned version','固定バージョン')}><Choice label={`${label} version`} disabled={disabled} value={source.variantId??asset.activeVariantId} options={asset.variants.map((variant,index)=>({value:variant.id,label:`${index+1} · ${variant.role}${variant.id===asset.activeVariantId?' · '+t('当前采用','Current','現在'):''}`}))} onChange={variantId=>set({...source,variantId})}/></Field>}</>;
  };
  return <section className="space-y-4">{removeError&&<p role="alert" className="workbench-error">{removeError}</p>}<h3><ScanFace size={17}/>{t('共同差分','Shared differences','共通差分')}</h3><p>{t('舞台立绘与阅读头像使用同一命名差分。隐藏立绘保留角色表情；头像裁剪使用源图坐标。','The stage and reading portrait share a named difference. Hiding a figure retains its expression; cropping uses source-image coordinates.','舞台と会話アバターは同じ差分を使用します。非表示でも表情は保持し、元画像の座標で切り抜きます。')}</p>
    {value.map(difference=><section key={difference.id} className="space-y-3 rounded-md border p-3"><div className="gc-actions"><Image size={16}/><Input aria-label={t('差分名称','Difference name','差分名')} disabled={disabled} value={difference.name} onChange={event=>update(difference.id,{name:event.target.value})}/><Button aria-label={t('删除差分','Delete difference','差分を削除')} disabled={disabled} onClick={()=>{if(removeDifference){void removeDifference(difference.id,replacement[difference.id]||undefined).catch(reason=>setRemoveError(String(reason)));return;}const next=value.filter(item=>item.id!==difference.id);change(next,initialId===difference.id?next[0]?.id??null:initialId);}}><Trash2 size={15}/></Button></div>
      {removeDifference&&<Field label={t('删除时引用替换为','Replace references on removal','削除時の参照置換先')}><Choice label="Difference replacement" disabled={disabled} value={replacement[difference.id]??''} options={[{value:'',label:t('无替代，需先解除引用','None; references must be clear','なし・参照解除が必要')},...value.filter(item=>item.id!==difference.id).map(item=>({value:item.id,label:item.name}))]} onChange={id=>setReplacement(previous=>({...previous,[difference.id]:id}))}/></Field>}
      <label><input type="radio" name="initial-difference" checked={initialId===difference.id} disabled={disabled} onChange={()=>change(value,difference.id)}/>{t('新会话初始差分','Initial difference for new sessions','開始時の差分')}</label>
      {assetField(t('立绘源图','Figure source','立ち絵の元画像'),difference.figure,figure=>update(difference.id,{figure}))}
      <Field label={t('头像来源','Portrait source','アバターの種類')}><Choice label="Portrait source" disabled={disabled} value={difference.avatar?.kind??'default'} options={[{value:'default',label:t('角色默认头像','Character default','標準アバター')},{value:'image',label:t('独立图片','Separate image','別画像')},{value:'crop',label:t('裁剪此立绘','Crop this figure','立ち絵から切り抜く')}]} onChange={kind=>update(difference.id,{avatar:kind==='image'?{kind,assetId:images[0]?.id??'',variantId:images[0]?.activeVariantId??null}:kind==='crop'?{kind,crop:{x:.25,y:0,width:.5,height:.35}}:null})}/></Field>
      {difference.avatar?.kind==='image'&&assetField(t('头像图片','Portrait image','アバター画像'),difference.avatar,source=>update(difference.id,{avatar:{kind:'image',...source}}))}
      {difference.avatar?.kind==='crop'&&<><FigureCropEditor difference={difference} assets={assets} resources={resources} crop={difference.avatar.crop} change={crop=>update(difference.id,{avatar:{kind:'crop',crop}})} locale={locale} disabled={disabled}/><div className="grid grid-cols-2 gap-3">{(['x','y','width','height']as const).map(key=><Field key={key} label={key}><Input type="number" aria-label={`Crop ${key}`} min={key==='width'||key==='height' ? .001 : 0} max={1} step={.01} disabled={disabled} value={difference.avatar!.kind==='crop'?difference.avatar!.crop[key]:0} onChange={event=>difference.avatar?.kind==='crop'&&update(difference.id,{avatar:{kind:'crop',crop:{...difference.avatar.crop,[key]:Number(event.target.value)}}})}/></Field>)}</div></>}
      {difference.avatar&&<AvatarPreview difference={difference} assets={assets} resources={resources}/>}
      {previewAsset&&<Button disabled={disabled||!difference.figure.assetId} onClick={()=>previewAsset(difference.figure.assetId)}>{t('查看源图','View source','元画像を表示')}</Button>}
    </section>)}
    <Button disabled={disabled||!images.length} onClick={()=>{const item:CharacterDifference={id:createId(value),name:t('新差分','New difference','新しい差分'),figure:{assetId:images[0]!.id,variantId:images[0]!.activeVariantId},avatar:{kind:'crop',crop:{x:.25,y:0,width:.5,height:.35}}};change([...value,item],initialId??item.id);}}><Plus size={15}/>{t('添加共同差分','Add difference','共通差分を追加')}</Button>
    {!images.length&&<p>{t('先导入角色图片，再配置命名差分。','Import a character image to configure differences.','キャラクター画像を読み込んでください。')}</p>}
  </section>;
}
