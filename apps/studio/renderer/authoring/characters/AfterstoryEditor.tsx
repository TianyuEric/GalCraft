import React from 'react';
import {createId} from '@galcraft/contracts';
import type {AfterstoryEntry,Asset,Id,Variable} from '@galcraft/contracts';
import {parse} from '@galcraft/dsl';
import {Button,Choice,Field} from '../../components/controls.js';
import {Input} from '../../components/ui/input.js';
import {BookOpen,Play,Plus,Trash2} from 'lucide-react';
export function AfterstoryEditor({value,change,assets,scenes,variables=[],endingIds,locale,disabled,previewScene}:{
  value:AfterstoryEntry|null;change(value:AfterstoryEntry|null):void;assets:Asset[];scenes:{sceneId:Id;name:string;text?:string}[];variables?:Variable[];endingIds:string[];locale:string;disabled?:boolean;previewScene?(sceneId:Id,entryId?:Id):void;
}){
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const scene=scenes.find(item=>item.sceneId===value?.entry.sceneId);
  const labels=scene?.text?parse({documentId:scene.sceneId,revision:0,text:scene.text}).cst.flatMap(node=>{const args=node.object?.value as {labelId?:string;name?:string}|undefined;return node.command==='label'&&args?.labelId?[{value:args.labelId,label:args.name||args.labelId}]:[];}):[];
  const update=(patch:Partial<AfterstoryEntry>)=>value&&change({...value,...patch});
  return <section className="space-y-3"><h3><BookOpen size={17}/>{t('普通后日谈','Ordinary afterstory','通常の後日談')}</h3><p>{t('每位主角色对应一个入口。正文使用现有场景，后日谈拥有独立继续位置；结束回主菜单。','Each main character has one entry. Use ordinary scenes; afterstory progress is independent and completion returns to the menu.','メインキャラクターごとに一つの入口を設定します。通常のシーンを使用し、進行を個別に保存して終了時はメニューへ戻ります。')}</p>
    {!value?<><p role="status">{t('可选：需要个人后日谈时，再配置起点、解锁结局和标题。','Optional: configure a starting scene, unlock endings and title when you want an afterstory.','任意：後日談が必要な場合に、開始シーン・解放条件・タイトルを設定します。')}</p><Button disabled={disabled||!scenes.length||!endingIds.length} onClick={()=>change({id:createId(),title:t('角色后日谈','Character afterstory','キャラクター後日談'),entry:{sceneId:scenes[0]!.sceneId,labelId:null},unlockEndingIds:[endingIds[0]!],initialProgress:{},lockedView:'locked'})}><Plus size={15}/>{t('配置普通后日谈','Configure afterstory','後日談を設定')}</Button></>:<>
      <Field label={t('入口标题','Entry title','入口タイトル')}><Input disabled={disabled} value={value.title} onChange={event=>update({title:event.target.value})}/></Field>
      <Field label={t('起始场景','Starting scene','開始シーン')}><Choice label="Afterstory scene" disabled={disabled} value={value.entry.sceneId} options={scenes.map(scene=>({value:scene.sceneId,label:scene.name}))} onChange={sceneId=>update({entry:{sceneId,labelId:null}})}/></Field>
      <Field label={t('起始标签','Starting label','開始ラベル')}><Choice label="Afterstory label" disabled={disabled} value={value.entry.labelId??''} options={[{value:'',label:t('从场景开头','Scene beginning','シーンの先頭')},...labels]} onChange={labelId=>update({entry:{...value.entry,labelId:labelId||null}})}/></Field>
      <fieldset><legend>{t('任一结局解锁','Unlock after any ending','いずれかの結末で解放')}</legend>{endingIds.map(id=><label className="flex items-center gap-2" key={id}><input type="checkbox" disabled={disabled} checked={value.unlockEndingIds.includes(id)} onChange={event=>update({unlockEndingIds:event.target.checked?[...value.unlockEndingIds,id]:value.unlockEndingIds.filter(item=>item!==id)})}/>{id}</label>)}</fieldset>
      {!value.unlockEndingIds.length&&<p role="alert">{t('至少选择一个所属路线结局。','Choose at least one personal-route ending.','個別ルートの結末を一つ以上選択してください。')}</p>}
      <Field label={t('锁定展示','Locked display','未解放時の表示')}><Choice label="Locked afterstory" disabled={disabled} value={value.lockedView} options={[{value:'locked',label:t('灰色剪影','Gray silhouette','グレーのシルエット')},{value:'hidden',label:t('隐藏入口','Hide entry','入口を隠す')}]} onChange={lockedView=>update({lockedView:lockedView as 'locked'|'hidden'})}/></Field>
      <details><summary>{t('后日谈独立初始变量','Independent initial variables','後日談の初期変数')}</summary><p>{t('未覆盖的进度变量使用作品初值；已获长期事实保持。','Unchanged variables use project defaults. Long-term facts remain available.','未指定の変数は作品の初期値を使用し、長期データは保持します。')}</p>
        {variables.filter(variable=>variable.scope==='progress').map(variable=><Field key={variable.id} label={variable.name}><label><input type="checkbox" checked={Object.hasOwn(value.initialProgress,variable.id)} onChange={event=>{const next={...value.initialProgress};if(event.target.checked)next[variable.id]=variable.initial;else delete next[variable.id];update({initialProgress:next});}}/>{t('独立覆盖','Override','上書き')}</label>{Object.hasOwn(value.initialProgress,variable.id)&&(variable.type==='boolean'?<input type="checkbox" checked={!!value.initialProgress[variable.id]} onChange={event=>update({initialProgress:{...value.initialProgress,[variable.id]:event.target.checked}})}/>:<Input type={variable.type==='number'?'number':'text'} value={String(value.initialProgress[variable.id])} onChange={event=>update({initialProgress:{...value.initialProgress,[variable.id]:variable.type==='number'?Number(event.target.value):event.target.value}})}/>)}</Field>)}
      </details><div className="gc-actions">{previewScene&&<Button disabled={disabled||!scene} onClick={()=>previewScene(value.entry.sceneId,value.id)}><Play size={15}/>{t('试玩后日谈场景','Play afterstory scene','後日談シーンを試す')}</Button>}<Button tone="quiet" disabled={disabled} onClick={()=>change(null)}><Trash2 size={15}/>{t('移除入口配置','Remove entry','入口設定を削除')}</Button></div>
    </>}
  </section>;
}
