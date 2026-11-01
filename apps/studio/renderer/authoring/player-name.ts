import type { AuthoringController } from './controller.js';
import { countNameCharacters, type PlayerName } from '@galcraft/contracts';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { StudioNumberField, type NumberInputDraft } from '../components/editor-fields/StudioNumberField.js';

export type PlayerNameGuiDraft = { values: string[]; baseline: string[]; numberDraft?: NumberInputDraft | null };
export function createPlayerNameEditor(controller: Pick<AuthoringController, 'source' | 'preferences' | 'setPlayerName'>, changed: () => void, pending: (dirty: boolean) => void = () => {}, openCharacters: () => void = () => {}, guiDraft?: PlayerNameGuiDraft | null) {
  const source=controller.source;if(!source)return;
  const locale=controller.preferences.locale;
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const dialog=document.createElement('section');dialog.className='player-name-editor';
  const heading=document.createElement('h2');heading.textContent=t('主角姓名','Protagonist name','主人公の名前');
  const description=document.createElement('p');description.textContent=t('姓名用于玩家视角角色的对白，并随正篇存档保存。允许玩家改名时，可选择何时确认姓名。','The name appears in viewpoint dialogue and is retained in main-story saves. Choose when players confirm a custom name.','名前はプレイヤー視点の台詞に表示され、本編セーブに保存されます。変更可能な場合は確認するタイミングを選べます。');
  const form=document.createElement('form');form.className='player-name-form';
  const field=(label:string,input:HTMLElement)=>{const row=document.createElement('label');row.className='authoring-field';const title=document.createElement('span');title.textContent=label;input.setAttribute('aria-label', label);row.append(title,input);form.append(row);return row;};
  const current=source.project.player.name;
  let applying:Promise<void>|null=null;
  const viewpoints=source.characters.filter(item=>item.narrativeRole==='viewpoint');
  const mode=document.createElement('select');for(const [value,label] of [['off',t('保持角色原名','Use character names','キャラクターの名前を使用')],['fixed',t('固定主角姓名','Fixed protagonist name','固定の主人公名')],['custom',t('玩家可自定义','Player can customize','プレイヤーが変更可能')]]){const option=document.createElement('option');option.value=value!;option.textContent=label!;mode.append(option);}mode.value=current?current.allowCustom?'custom':'fixed':'off';field(t('姓名方式','Name mode','名前の方式'),mode);
  const character=document.createElement('select');for(const item of viewpoints){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;character.append(option);}
  if(current&&!viewpoints.some(item=>item.id===current.characterId)){const option=document.createElement('option');option.value=current.characterId;option.textContent=t('原关联角色需要先设为玩家视角','Classify the linked character as viewpoint first','関連キャラクターをプレイヤー視点に分類してください');option.disabled=true;character.append(option);}
  if(current)character.value=current.characterId;field(t('玩家视角角色','Viewpoint character','プレイヤー視点のキャラクター'),character);
  if(!viewpoints.length){const create=document.createElement('button');create.type='button';create.textContent=t('创建或设置视角角色','Set up a viewpoint character','視点キャラクターを設定');create.onclick=openCharacters;form.append(create);const help=document.createElement('p');help.className='authoring-hint';help.textContent=t('先在“角色与路线”中将一位角色设为玩家视角。','First classify a character as Viewpoint in Characters & routes.','「キャラクターとルート」でプレイヤー視点のキャラクターを指定してください。');form.append(help);}
  const name=document.createElement('input');name.value=current?.defaultName??viewpoints[0]?.name??'';name.placeholder=t('例如：春树','For example: Haruki','例：春樹');field(t('默认姓名','Default name','既定の名前'),name);
  const max=document.createElement('div'),maxRoot=createRoot(max);form.append(max);
  let maxValue=current?.maxLength??24,maxRaw=String(maxValue),numberDraft:NumberInputDraft|null=null,maxGeneration=0;
  const restoreMax=()=>{const next=Number(maxRaw);maxValue=Number.isFinite(next)?next:24;numberDraft=maxRaw===String(maxValue)?null:{value:Number.isFinite(next)?next:null,raw:maxRaw};maxGeneration++;};
  const counter=document.createElement('p');counter.className='authoring-hint';counter.setAttribute('aria-live','polite');form.append(counter);
  const policy=document.createElement('select');
  for(const [value,label] of [['always',t('每次新游戏确认','Every new game','新規ゲームのたびに確認')],['firstAndAfterCompletion',t('首次及正篇结束后确认','First game and after main-story completion','初回と本編終了後に確認')]]){const option=document.createElement('option');option.value=value!;option.textContent=label!;policy.append(option);}
  policy.value=current?.promptPolicy??'always';const policyRow=field(t('何时确认姓名','When to confirm the name','名前を確認するタイミング'),policy);
  const variable=document.createElement('select');const automatic=document.createElement('option');automatic.value='';automatic.textContent=t('自动创建或复用「主角姓名」变量','Create or reuse the protagonist name variable','主人公名の変数を自動作成・再利用');variable.append(automatic);
  for(const item of source.variables??[]){if(item.scope!=='progress'||item.type!=='string')continue;const option=document.createElement('option');option.value=item.id;option.textContent=item.name;variable.append(option);}variable.value=current?.variableId??'';const variableRow=field(t('保存姓名的变量','Name storage variable','名前の保存先変数'),variable);
  const summary=()=>{counter.hidden=mode.value==='off';counter.textContent=t(`默认姓名 ${countNameCharacters(name.value)} / ${maxRaw} 个可见字符；至少 1 个。`,`Default name: ${countNameCharacters(name.value)} / ${maxRaw} visible characters. At least 1.`,`既定名：${countNameCharacters(name.value)} / ${maxRaw}文字。1文字以上。`);};
  const sync=()=>{const active=mode.value!=='off';mode.disabled=policy.disabled=variable.disabled=!!applying;character.disabled=name.disabled=!active||!!applying;name.required=active;variableRow.hidden=policyRow.hidden=mode.value!=='custom';dialog.setAttribute('aria-busy',String(!!applying));summary();
    maxRoot.render(createElement(StudioNumberField,{key:maxGeneration,label:t('姓名长度上限','Maximum name length','名前の最大文字数'),value:maxValue,min:1,max:100,step:1,unit:t('字符','characters','文字'),buttons:true,locale,disabled:!active||!!applying,inputDraft:numberDraft,
      onPreview:(value:number)=>{maxValue=value;maxRaw=String(value);summary();report();},
      onCommit:(value:number)=>{if(!Number.isInteger(value))throw new Error(t('请输入 1～100 的整数。','Enter an integer from 1 to 100.','1～100の整数を入力してください。'));maxValue=value;maxRaw=String(value);numberDraft=null;summary();report();},
      onInputDraftChange:draft=>{numberDraft=draft;maxRaw=draft?.raw??String(maxValue);summary();report();}}));};mode.onchange=sync;
  const error=document.createElement('p');error.className='field-error';error.setAttribute('role','alert');form.append(error);
  const footer=document.createElement('footer');footer.className='dialog-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('还原未应用输入','Reset unapplied input','未適用の入力を戻す');
  const apply=document.createElement('button');apply.type='button';apply.className='authoring-primary';apply.textContent=t('应用姓名设置','Apply name settings','名前設定を適用');
  apply.onclick=()=>{if(applying)return;applying=(async()=>{if(!form.reportValidity())return;
    if(mode.value!=='off'&&(!Number.isInteger(Number(maxRaw))||Number(maxRaw)<1||Number(maxRaw)>100)){error.textContent=t('姓名长度上限须为 1～100 的整数。','Set the maximum name length to an integer from 1 to 100.','名前の最大文字数は1～100の整数にしてください。');return;}
    if(mode.value!=='off'&&(!name.value.trim()||countNameCharacters(name.value)>Number(maxRaw))){error.textContent=!name.value.trim()?t('请填写默认姓名。','Enter a default name.','既定の名前を入力してください。'):t(`默认姓名最多 ${maxRaw} 个可见字符，请缩短姓名或提高上限。`,`Use at most ${maxRaw} visible characters, or increase the maximum.`,`既定名は${maxRaw}文字以内にするか、上限を増やしてください。`);return;}
    try{const result=await controller.setPlayerName(mode.value==='off'?null:{characterId:character.value,defaultName:name.value.trim(),allowCustom:mode.value==='custom',variableId:mode.value==='custom'?variable.value||null:null,maxLength:Number(maxRaw),promptPolicy:policy.value as PlayerName['promptPolicy']});if(!result.ok){error.textContent=result.error.message;return;}error.textContent='';maxRaw=String(Number(maxRaw));restoreMax();sync();baseline=values();report();changed();}catch(reason){error.textContent=reason instanceof Error?reason.message:String(reason);}})().finally(()=>{applying=null;if(!disposed){sync();report();}});sync();report();};footer.append(cancel,apply);
  form.onsubmit=event=>{event.preventDefault();apply.click();};
  const values=()=>[mode.value,character.value,name.value,maxRaw,variable.value,policy.value];let baseline=values(), dirty=false,disposed=false;
  if(guiDraft){baseline=guiDraft.baseline;[mode.value,character.value,name.value,maxRaw,variable.value,policy.value]=guiDraft.values;restoreMax();numberDraft=guiDraft.numberDraft??numberDraft;}
  const report=()=>{dirty=values().some((value,index)=>value!==baseline[index]);apply.disabled=cancel.disabled=!dirty||!!applying;apply.textContent=applying?t('正在应用姓名设置…','Applying name settings…','名前設定を適用中…'):t('应用姓名设置','Apply name settings','名前設定を適用');pending(dirty);};
  form.addEventListener('input',event=>{if(max.contains(event.target as Node))return;sync();report();});form.addEventListener('change',event=>{if(max.contains(event.target as Node))return;sync();report();});cancel.onclick=()=>{[mode.value,character.value,name.value,maxRaw,variable.value,policy.value]=baseline;restoreMax();sync();error.textContent='';report();};
  dialog.append(heading,description,form,footer);sync();report();
  return { root:dialog, get dirty(){return dirty;}, waitForApply:()=>applying??Promise.resolve(), capture:():PlayerNameGuiDraft=>({values:values(),baseline,numberDraft}), discard(){cancel.click();}, dispose(){if(!disposed){disposed=true;maxRoot.unmount();}}, refresh(){
    const selected=character.value, selectedVariable=variable.value;variable.replaceChildren(automatic,...(controller.source?.variables??[]).filter(item=>item.scope==='progress'&&item.type==='string').map(item=>new Option(item.name,item.id)));variable.value=selectedVariable;
    const candidates=controller.source?.characters.filter(item=>item.narrativeRole==='viewpoint')??[];
    character.replaceChildren(...candidates.map(item=>new Option(item.name,item.id)));
    if(selected&&!candidates.some(item=>item.id===selected)){const missing=new Option(t('原关联角色需要先设为玩家视角','Linked character needs viewpoint role','関連キャラクターの視点設定が必要'),selected);missing.disabled=true;character.append(missing);}character.value=selected||candidates[0]?.id||'';
    if(!dirty){const saved=controller.source?.project.player.name;mode.value=saved?saved.allowCustom?'custom':'fixed':'off';character.value=saved?.characterId??candidates[0]?.id??'';name.value=saved?.defaultName??candidates[0]?.name??'';maxRaw=String(saved?.maxLength??24);restoreMax();variable.value=saved?.variableId??'';policy.value=saved?.promptPolicy??'always';baseline=values();sync();report();}
  } };

}
