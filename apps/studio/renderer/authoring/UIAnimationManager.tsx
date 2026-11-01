import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createId, type Id, type RuntimeTemplate, type UIAnimation } from '@galcraft/contracts';
import { createUIAnimationPreset, putUIAnimation, removeUIAnimation, UIAnimationPresets, uiAnimationUses, type UIAnimationBinding } from '@galcraft/templates';
import { animationFrames } from '@galcraft/player-ui';
import { Button, Choice } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { StudioNumberField } from '../components/editor-fields/StudioNumberField.js';
import { designerPageName, designerComponentName } from './designer-labels.js';
import { findComponent } from '@galcraft/templates';
import './ui-animation-manager.css';

type AnimationTarget={componentId:Id;event:UIAnimationBinding};
export type UIAnimationManagerState={target?:AnimationTarget;selected:string;draft:UIAnimation;baseline:string;shared:boolean};
export type UIAnimationManagerHandle={open(target?:AnimationTarget):void;capture():UIAnimationManagerState};
export const UIAnimationManager=forwardRef<UIAnimationManagerHandle,{template:RuntimeTemplate;locale:string;target?:AnimationTarget;resume?:UIAnimationManagerState|null;apply(next:RuntimeTemplate,label:string):Promise<void>;close():void;onDraftChange?():void}>(function UIAnimationManager({template,locale,target:initialTarget,resume,apply,close,onDraftChange},ref) {
  const [target,setTarget]=useState(resume?.target??initialTarget);
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const initial=target?findComponent(template,target.componentId)?.animations[target.event]:template.animations[0]?.id;
  const [selected,setSelected]=useState(resume?.selected??initial??''),[draft,setDraft]=useState<UIAnimation>(()=>structuredClone(resume?.draft??template.animations.find(item=>item.id===initial)??createUIAnimationPreset('fadeIn',createId(template),locale)));
  const [shared,setShared]=useState(resume?.shared??false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[deleting,setDeleting]=useState(false);
  const specimen=useRef<HTMLButtonElement>(null),playing=useRef<Animation|null>(null),submitting=useRef(false);
  const baseline=useRef(resume?.baseline??JSON.stringify(draft)),[leave,setLeave]=useState<(()=>void)|null>(null);
  const guard=(run:()=>void)=>{if(JSON.stringify(draft)!==baseline.current)setLeave(()=>run);else run();};
  useImperativeHandle(ref,()=>({capture:()=>structuredClone({target,selected,draft,baseline:baseline.current,shared}),open:next=>{if(submitting.current)return;guard(()=>{
    const id=next?findComponent(template,next.componentId)?.animations[next.event]:template.animations[0]?.id;
    const value=structuredClone(template.animations.find(item=>item.id===id)??createUIAnimationPreset('fadeIn',createId(template),locale));
    baseline.current=JSON.stringify(value);setTarget(next);setSelected(id??'');setDraft(value);setShared(false);setDeleting(false);setError('');
  });}}));
  const uses=uiAnimationUses(template,draft.id),existing=template.animations.some(item=>item.id===draft.id);
  useEffect(()=>()=>playing.current?.cancel(),[]);
  useEffect(()=>{onDraftChange?.();},[draft,onDraftChange]);
  const select=(id:string)=>guard(()=>{const value=template.animations.find(item=>item.id===id);if(value){baseline.current=JSON.stringify(value);setSelected(id);setDraft(structuredClone(value));setShared(false);setDeleting(false);setError('');}});
  const perform=async(next:RuntimeTemplate,label:string)=>{if(submitting.current)return;submitting.current=true;setBusy(true);setError('');try{await apply(next,label);setDeleting(false);const id=target?findComponent(next,target.componentId)?.animations[target.event]:draft.id;const value=next.animations.find(item=>item.id===id);if(value){baseline.current=JSON.stringify(value);setSelected(value.id);setDraft(structuredClone(value));}else{const fresh=createUIAnimationPreset('fadeIn',createId(next),locale);baseline.current=JSON.stringify(fresh);setSelected('');setDraft(fresh);}}catch(error){setError(String(error));}finally{submitting.current=false;setBusy(false);}};
  const preview=()=>{playing.current?.cancel();if(!specimen.current)return;const data=animationFrames(draft,matchMedia('(prefers-reduced-motion:reduce)').matches);playing.current=specimen.current.animate(data.frames,{duration:data.duration,fill:'none'});};
  const locations=uses.map(use=>{const component=findComponent(template,use.componentId)!;return `${designerPageName(use.page,locale,template.locales)} / ${designerComponentName(component,locale,template.locales)} · ${use.event}`;});
  const editSegment=(index:number,key:'durationMs'|'opacity'|'translateX'|'translateY'|'scale',value:number)=>setDraft(current=>({...current,segments:current.segments.map((segment,i)=>i===index?{...segment,[key]:value}:segment)}));
  return <section className="designer-animation-manager" aria-label={t('界面动画','Interface animations','UIアニメーション')}>
    <header><div><h2>{t('界面动画','Interface animations','UIアニメーション')}</h2><p>{t('预览后应用；页面与部件共用同一作品目录。','Preview, then apply to the shared project catalog.','プレビューしてから作品の共通カタログに適用します。')}</p></div><Button disabled={busy} onClick={()=>guard(close)}>{t('返回页面设计','Back to page design','ページデザインに戻る')}</Button></header>
    {leave&&<section role="alertdialog" aria-label={t('动画有未应用修改','Unapplied animation changes','未適用の変更')}><p>{t('当前动画有未应用修改。继续切换会放弃这些修改。','This animation has unapplied changes. Continuing discards them.','このアニメーションには未適用の変更があります。切り替えると破棄されます。')}</p><Button onClick={()=>{const run=leave;setLeave(null);run();}}>{t('放弃修改并继续','Discard and continue','破棄して続行')}</Button><Button onClick={()=>setLeave(null)}>{t('继续编辑','Keep editing','編集を続ける')}</Button></section>}
    <div className="designer-animation-columns"><nav aria-label={t('作品动画','Project animations','作品アニメーション')}>
      <Button disabled={busy} onClick={()=>guard(()=>{setSelected('');setDraft(createUIAnimationPreset('fadeIn',createId(template),locale));setShared(false);setDeleting(false);})}>{t('新建动画','New animation','新規アニメーション')}</Button>
      {template.animations.map(animation=><Button key={animation.id} disabled={busy} aria-pressed={selected===animation.id} onClick={()=>select(animation.id)}><span>{animation.name}</span><small>{uiAnimationUses(template,animation.id).length} {t('处引用','uses','箇所')}</small></Button>)}
    </nav><div className="designer-animation-editor"><div className="designer-animation-specimen"><button type="button" ref={specimen}>{t('预览部件','Preview component','プレビュー部品')}</button><Button disabled={busy} onClick={preview}>{t('预览动画','Preview animation','アニメーションを再生')}</Button></div>
      <Choice label={t('基础预设','Preset','基本プリセット')} value="" disabled={busy} options={[{value:'',label:t('选择预设并预览','Choose a preset','プリセットを選択')},...UIAnimationPresets.map(item=>({value:item.key,label:item.name[locale as keyof typeof item.name]??item.name['zh-CN']}))]} onChange={key=>{setDraft({...createUIAnimationPreset(key,draft.id,locale)});}}/>
      <label>{t('动画名称','Animation name','アニメーション名')}<Input disabled={busy} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
      <Choice label={t('减弱动画','Reduced motion','動きを減らす')} value={draft.reduced} disabled={busy} options={[{value:'finish',label:t('直接完成','Finish immediately','すぐに完了')},{value:'fade',label:t('短淡变','Short fade','短いフェード')}]} onChange={value=>setDraft({...draft,reduced:value as UIAnimation['reduced']})}/>
      {draft.segments.map((segment,index)=><fieldset key={index} disabled={busy}><legend>{t('动画段','Segment','区間')} {index+1}</legend><div className="designer-animation-values">
        {([['durationMs',t('时长 ms','Duration ms','時間 ms')],['opacity',t('不透明度','Opacity','不透明度')],['translateX',t('水平位移','Horizontal','水平移動')],['translateY',t('垂直位移','Vertical','垂直移動')],['scale',t('缩放','Scale','拡大率')]] as const).map(([key,label])=><StudioNumberField key={key} label={label} value={segment[key]??(key==='opacity'||key==='scale'?1:0)} min={key==='durationMs'||key==='opacity'?0:undefined} max={key==='opacity'?1:undefined} step={key==='opacity'||key==='scale'?.01:1} locale={locale} unit={key==='durationMs'?'ms':key.startsWith('translate')?'px':''} onPreview={value=>editSegment(index,key,value)} onCommit={value=>editSegment(index,key,value)}/>)}
        <Choice label={t('缓动','Easing','イージング')} value={segment.easing.family} options={['linear','sine','quad','cubic'].map(value=>({value,label:value}))} onChange={value=>setDraft({...draft,segments:draft.segments.map((item,i)=>i===index?{...item,easing:{...item.easing,family:value as typeof segment.easing.family}}:item)})}/>
        <Choice label={t('方向','Direction','方向')} value={segment.easing.direction} options={['in','out','inOut'].map(value=>({value,label:value}))} onChange={value=>setDraft({...draft,segments:draft.segments.map((item,i)=>i===index?{...item,easing:{...item.easing,direction:value as typeof segment.easing.direction}}:item)})}/>
      </div><div className="gc-actions"><Button disabled={index===0||busy} onClick={()=>{const segments=[...draft.segments];[segments[index-1],segments[index]]=[segments[index]!,segments[index-1]!];setDraft({...draft,segments});}}>{t('上移','Move up','上へ')}</Button><Button disabled={busy} onClick={()=>setDraft({...draft,segments:draft.segments.filter((_,i)=>i!==index)})}>{t('移除段','Remove segment','区間を削除')}</Button></div></fieldset>)}
      <Button disabled={busy} onClick={()=>setDraft({...draft,segments:[...draft.segments,{durationMs:120,opacity:1,easing:{family:'cubic',direction:'out'}}]})}>{t('添加动画段','Add segment','区間を追加')}</Button>
      <section><h3>{t('使用位置','Used by','使用箇所')}</h3>{locations.length?<ul>{locations.map(value=><li key={value}>{value}</li>)}</ul>:<p>{t('尚未绑定','No bindings','未使用')}</p>}
      {target&&uses.length>1&&<Choice label={t('修改范围','Edit scope','変更範囲')} value={shared?'shared':'local'} options={[{value:'local',label:t('只改此处（独立副本）','This binding only (copy)','この箇所のみ（コピー）')},{value:'shared',label:t('修改共享动画','Edit shared animation','共有アニメーションを変更')}]} onChange={value=>setShared(value==='shared')}/>}</section>
      {deleting&&<section role="alert"><p>{t('删除将解绑以上全部位置。一次撤销可恢复定义与绑定。','Deleting unbinds every location above. One undo restores the definition and bindings.','削除すると上記すべての参照を解除します。一度の取り消しで復元できます。')}</p><Button tone="danger" disabled={busy} onClick={()=>void perform(removeUIAnimation(template,draft.id,true),t('解绑并删除界面动画','Unbind and delete UI animation','参照解除してUIアニメーションを削除'))}>{t('解绑后删除','Unbind and delete','参照解除して削除')}</Button><Button disabled={busy} onClick={()=>setDeleting(false)}>{t('取消','Cancel','キャンセル')}</Button></section>}
      {error&&<p role="alert">{error}</p>}
      <footer><Button tone="primary" disabled={busy||!draft.name.trim()||!draft.segments.length} onClick={()=>void perform(putUIAnimation(template,draft,target?{...target,shared}:undefined),t('应用界面动画','Apply UI animation','UIアニメーションを適用'))}>{busy?t('正在应用…','Applying…','適用中…'):t('应用动画','Apply animation','適用')}</Button>
        <Button disabled={busy} onClick={()=>{setSelected('');setDraft({...structuredClone(draft),id:createId(template),name:`${draft.name} · ${t('副本','Copy','コピー')}`});setDeleting(false);}}>{t('复制为新动画','Duplicate','複製')}</Button>
        <Button tone="danger" disabled={busy||!existing} onClick={()=>{if(uses.length)setDeleting(true);else void perform(removeUIAnimation(template,draft.id),t('删除界面动画','Delete UI animation','UIアニメーションを削除'));}}>{t('删除定义','Delete definition','定義を削除')}</Button>
      </footer></div></div></section>;
});
