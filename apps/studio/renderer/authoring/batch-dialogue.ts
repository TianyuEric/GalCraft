import { createId, type Id } from '@galcraft/contracts';
import { mergeDialoguePaste, previewDialoguePaste } from './controller.js';
type Speaker = { kind: 'character'; id: Id } | { kind: 'narrator' };
export type BatchDialogueGuiDraft = { source: string; selections: [string,string][]; created: [string,Id][]; edits: {text:string;merge:boolean}[] };
export function createBatchDialogueEditor(input: { locale?: string; characters: {id:Id;name:string}[]; guiDraft?: BatchDialogueGuiDraft; apply(lines: {speaker:Speaker;text:string}[], characters: {id:Id;name:string}[]): Promise<void> }) {
  const t=(zh:string,en:string,ja:string)=>input.locale==='en'?en:input.locale==='ja'?ja:zh;
  const root=document.createElement('section');root.className='batch-dialogue-workspace';
  const intro=document.createElement('p');intro.textContent=t('输入 → 匹配角色 → 复核。插入将作为一组修改提交，可一起撤销。','Input → Match speakers → Review. Insert as one undoable change.','入力 → 話者を選択 → 確認。一括で挿入し、まとめて元に戻せます。');
  const columns=document.createElement('div');columns.className='batch-dialogue-columns';
  const source=document.createElement('textarea');source.ariaLabel=t('批量对白原文','Dialogue source','台詞の原文');source.placeholder=t('角色名：对白\n旁白：场景描述','Character: Dialogue\nNarrator: Description','キャラクター: 台詞\nナレーション: 描写');
  const review=document.createElement('div'), mapping=document.createElement('div'), linesView=document.createElement('div');review.append(mapping,linesView);columns.append(source,review);
  const error=document.createElement('p');error.setAttribute('role','alert');
  const apply=document.createElement('button');apply.type='button';apply.className='studio-button authoring-primary';apply.disabled=true;
  root.append(intro,columns,error,apply);
  const selections=new Map<string,string>(input.guiDraft?.selections), created=new Map<string,Id>(input.guiDraft?.created);let edits:{speaker:Speaker;text:HTMLTextAreaElement;merge:HTMLInputElement}[]=[],newCharacters:{id:Id;name:string}[]=[],busy=false;
  const countLabel=(count:number)=>t(`插入 ${count} 条`,`Insert ${count} lines`,`${count} 行を挿入`);
  const updateCount=()=>{apply.textContent=countLabel(edits.filter(edit=>!edit.merge.checked).length);};
  const parsed=(preserve=false)=>{
    const previous=preserve?edits.map(edit=>({text:edit.text.value,merge:edit.merge.checked})):[];
    if(busy)return;error.textContent='';mapping.replaceChildren();linesView.replaceChildren();edits=[];newCharacters=[];
    const names=[...new Set(source.value.split(/\r?\n/).map(line=>/^([^：:]+)[：:]/.exec(line.trim())?.[1]?.trim()).filter((name):name is string=>!!name))].filter(name=>!['旁白','Narrator','ナレーション'].includes(name));
    const speakers:Record<string,Speaker>={};
    for(const name of names){
      const row=document.createElement('label');row.textContent=name;const select=document.createElement('select');select.ariaLabel=t(`匹配角色 ${name}`,`Match speaker ${name}`,`話者 ${name}`);
      for(const [value,label] of [['new',t('创建同名角色','Create character','同名キャラクターを作成')],['narrator',t('作为旁白','Narrator','ナレーション')],...input.characters.map(c=>[c.id,c.name])]){const option=document.createElement('option');option.value=value!;option.textContent=label!;select.append(option);}
      const value=selections.get(name)??input.characters.find(c=>c.name===name)?.id??'new';select.value=value;
      if(value==='new'){if(!created.has(name))created.set(name,createId());newCharacters.push({id:created.get(name)!,name});speakers[name]={kind:'character',id:created.get(name)!};}else speakers[name]=value==='narrator'?{kind:'narrator'}:{kind:'character',id:value};
      select.onchange=()=>{selections.set(name,select.value);parsed(true);};row.append(select);mapping.append(row);
    }
    const result=previewDialoguePaste(source.value,input.characters,speakers);
    if(!result.ok){error.textContent=source.value?result.error.message:'';apply.disabled=true;apply.textContent=countLabel(0);return;}
    result.value.forEach((line,index)=>{const row=document.createElement('article'),name=document.createElement('strong'),text=document.createElement('textarea'),merge=document.createElement('input'),label=document.createElement('label');
      name.textContent=line.speaker.kind==='narrator'?t('旁白','Narrator','ナレーション'):[...input.characters,...newCharacters].find(c=>line.speaker.kind==='character'&&c.id===line.speaker.id)?.name??'';
      text.value=previous[index]?.text??line.text;text.ariaLabel=t(`复核对白 ${index+1}`,`Review dialogue ${index+1}`,`台詞 ${index+1} を確認`);merge.type='checkbox';merge.disabled=index===0||JSON.stringify(result.value[index-1]!.speaker)!==JSON.stringify(line.speaker);merge.checked=!merge.disabled&&(previous[index]?.merge??false);merge.onchange=updateCount;label.textContent=t('与上一句合并','Merge with previous line','前の行と結合');label.prepend(merge);row.append(name,text,label);linesView.append(row);edits.push({speaker:line.speaker,text,merge});
    });apply.disabled=!edits.length;updateCount();
  };
  source.oninput=()=>parsed();source.value=input.guiDraft?.source??'';parsed();
  input.guiDraft?.edits.forEach((value,index)=>{const edit=edits[index];if(edit){edit.text.value=value.text;edit.merge.checked=value.merge&&!edit.merge.disabled;}});updateCount();
  apply.onclick=()=>{void(async()=>{if(busy)return;const merged=mergeDialoguePaste(edits.map(edit=>({speaker:edit.speaker,text:edit.text.value})),edits.map(edit=>edit.merge.checked));if(!merged.ok){error.textContent=merged.error.message;return;}
    busy=true;apply.disabled=true;error.textContent='';try{await input.apply(merged.value,newCharacters);}catch(reason){error.textContent=reason instanceof Error?reason.message:String(reason);}finally{busy=false;apply.disabled=false;}
  })();};
  return {root,dirty:()=>Boolean(source.value.trim()),capture:():BatchDialogueGuiDraft=>({source:source.value,selections:[...selections],created:[...created],edits:edits.map(edit=>({text:edit.text.value,merge:edit.merge.checked}))})};
}
