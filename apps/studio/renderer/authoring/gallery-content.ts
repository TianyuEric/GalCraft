import { createId, GalleryEntrySchema } from '@galcraft/contracts';
import type { DocumentView, EditInput, GalleryEntry, Id, Json, Source } from '@galcraft/contracts';
import { parse, patchFields, toDocumentPatch } from '@galcraft/dsl';
import { domButton } from '../components/dom-button.js';
import { openAssetPicker } from './asset-picker.js';
import type { AuthoringServices } from './controller.js';

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='')=>{const value=document.createElement(tag);value.textContent=text;return value;};
export function galleryDocuments(documents:DocumentView[]) {
  return documents.flatMap(document=>Object.entries(document.files).filter(([path])=>path.startsWith('gallery/')&&path.endsWith('.json')).map(([path,raw])=>({document,path,entry:GalleryEntrySchema.parse(JSON.parse(raw).data)})));
}
export function galleryContentEdit(documents:DocumentView[],entry:GalleryEntry,remove=false):EditInput {
  const old=galleryDocuments(documents).find(item=>item.entry.id===entry.id);
  const edit:EditInput={label:remove?'移除鉴赏条目':'编辑鉴赏内容',origin:'field',expected:[],patches:[],preparedAssets:[],requiredRefs:[]};
  if(old){edit.expected.push({ref:{kind:'document',id:old.document.documentId},revision:old.document.revision});
    if(remove)edit.patches.push({kind:'document',documentId:old.document.documentId,op:'delete',before:{documentId:old.document.documentId,format:old.document.format,files:old.document.files} as Json,after:null});
    else edit.patches.push({kind:'json',documentId:old.document.documentId,changes:[{path:'/data',before:JSON.parse(old.document.files[old.path]!).data as Json,after:GalleryEntrySchema.parse(entry) as unknown as Json,op:'set'}]});
  }else{const id=entry.id;edit.patches.push({kind:'document',documentId:id,op:'create',before:null,after:{documentId:id,format:'json',files:{[`gallery/${id}.json`]:JSON.stringify({schemaVersion:1,documentId:id,revision:1,data:entry},null,2)+'\n'}}});}
  return edit;
}
export class GalleryContent {
  readonly root=node('section');
  private selected:Id|null=null;
  private kind:GalleryEntry['kind']='cg';
  private error=node('p');
  constructor(private options:{services:AuthoringServices;documents():DocumentView[];inspector:HTMLElement;locale:string;
    apply(edit:EditInput):Promise<void>;save():Promise<void>;locate(source:Source):void;origin():Source|null;close():void}) {
    this.root.className='designer-gallery-content';this.draw();
  }
  selectEntry(id:Id){const entry=galleryDocuments(this.options.documents()).map(item=>item.entry).find(entry=>entry.id===id||entry.differences?.some(difference=>difference.id===id));if(entry){this.kind=entry.kind;this.selected=entry.id;this.draw();}}
  documentId(){return galleryDocuments(this.options.documents()).find(item=>item.entry.id===this.selected)?.document.documentId??null;}
  private t(zh:string,en:string,ja:string){return this.options.locale==='en'?en:this.options.locale==='ja'?ja:zh;}
  private button(label:string,run:()=>void|Promise<void>){return domButton(label,()=>{void this.run(run);});}
  private async run(action:()=>void|Promise<void>){try{await action();this.error.textContent='';if(this.root.isConnected)this.draw();}catch(error){this.error.textContent=String(error);}}
  private references(entry:GalleryEntry) {
    return this.options.documents().flatMap(document=>Object.entries(document.files).filter(([path])=>path.endsWith('/script.gal')).flatMap(([,text])=>parse({documentId:document.documentId,revision:document.revision,text}).statements.filter(statement=>statement.args.entryId===entry.id||statement.args.galleryId===entry.id).map(statement=>({document,statement}))));
  }
  private originStatement(){const source=this.options.origin();if(!source)return null;const document=this.options.documents().find(item=>item.documentId===source.documentId);const text=document&&Object.entries(document.files).find(([path])=>path.endsWith('/script.gal'))?.[1];if(!document||!text)return null;const parsed=parse({documentId:document.documentId,revision:document.revision,text});return {document,parsed,statement:parsed.statements.find(item=>item.id===source.statementId)};}
  private associate(edit:EditInput,entry:GalleryEntry,differenceIds:Id[]) {
    const origin=this.originStatement();if(!origin?.statement)throw new Error(this.t('请先在创作页选择要关联的指令','Select an instruction in the writing page first','創作ページで関連付ける命令を選択してください'));
    const command=origin.statement.command,expected=command==='changeBg'||command==='unlockCg'?'cg':command==='bgm'||command==='unlockBgm'?'music':command==='video'||command==='unlockVideo'?'video':null;
    if(expected!==entry.kind)throw new Error(this.t('当前指令与条目类型不同','The current instruction has a different media type','現在の命令と項目の種類が異なります'));
    const linked=command.startsWith('unlock');
    if(command==='changeBg'&&differenceIds.length!==1)throw new Error(this.t('背景指令需要选择一张匹配差分','Choose one matching variation for this background','背景命令には対応する差分を一つ選択してください'));
    const changes:{field:string;op:'set';value:Json}[]=[{field:linked?'entryId':'galleryId',op:'set',value:entry.id}];
    if(entry.kind==='cg')changes.push({field:linked?'differenceIds':'differenceId',op:'set',value:linked?differenceIds:differenceIds[0]!});
    const result=patchFields(origin.parsed,{documentId:origin.document.documentId,revision:origin.document.revision,statementIds:[origin.statement.id!],changes});if(!result.ok)throw new Error(result.error.message);
    edit.expected.push({ref:{kind:'document',id:origin.document.documentId},revision:origin.document.revision});edit.patches.push(toDocumentPatch(origin.document.documentId,result.value));
  }
  private async insertUnlock(entry:GalleryEntry,differenceIds:Id[]){
    if(entry.kind==='cg'&&!differenceIds.length)throw new Error(this.t('请选择至少一张差分','Select at least one variation','差分を一つ以上選択してください'));
    const origin=this.originStatement();if(!origin)throw new Error(this.t('请先在创作页选择插入位置','Select an insertion point in the writing page first','創作ページで挿入位置を選択してください'));
    const current=origin.parsed.cst.find(node=>node.id===origin.statement?.id),position=current?.end??origin.parsed.text.length;
    const opcode=entry.kind==='cg'?'unlockCg':entry.kind==='music'?'unlockBgm':'unlockVideo';
    const args=entry.kind==='cg'?{entryId:entry.id,differenceIds}:{entryId:entry.id};
    const edit:EditInput={label:this.t('插入鉴赏解锁','Insert gallery unlock','鑑賞の解放命令を挿入'),origin:'field',expected:[{ref:{kind:'document',id:origin.document.documentId},revision:origin.document.revision}],patches:[{kind:'text',documentId:origin.document.documentId,edits:[{start:position,end:position,before:'',after:`\n${opcode} ${JSON.stringify(args)} @${createId(this.options.documents())};`}]}],preparedAssets:[],requiredRefs:[]};
    await this.options.apply(edit);
  }
  private async create(){
    const origin=this.originStatement()?.statement;
    const matching=origin&&((this.kind==='cg'&&['changeBg','unlockCg'].includes(origin.command))||(this.kind==='music'&&['bgm','unlockBgm'].includes(origin.command))||(this.kind==='video'&&['video','unlockVideo'].includes(origin.command)));
    const id=createId(this.options.documents()),assetId=matching&&typeof origin.args.assetId==='string'?origin.args.assetId:null;
    const entry:GalleryEntry={id,kind:this.kind,name:this.t('新鉴赏条目','New gallery item','新しい鑑賞項目'),series:this.t('默认系列','Default series','既定のシリーズ'),seriesOrder:0,order:galleryDocuments(this.options.documents()).length,cover:null,lockedView:'placeholder',assets:this.kind==='cg'||!assetId?[]:[assetId],...(this.kind==='cg'?{differences:assetId?[{id:createId(),assetId,name:this.t('差分 1','Variation 1','差分 1'),order:0}]:[],coverDifferenceId:null}:{})};
    const edit=galleryContentEdit(this.options.documents(),entry);
    if(matching&&(this.kind!=='cg'||entry.differences?.length))this.associate(edit,entry,entry.differences?.map(diff=>diff.id)??[]);
    this.selected=id;await this.options.apply(edit);
  }
  draw(){
    const entries=galleryDocuments(this.options.documents()).map(item=>item.entry).filter(entry=>entry.kind===this.kind).sort((a,b)=>a.order-b.order);
    const selected=entries.find(entry=>entry.id===this.selected)??entries[0];this.selected=selected?.id??null;
    this.root.replaceChildren();this.error.setAttribute('role','alert');
    const header=node('header');header.append(node('h2',this.t('鉴赏内容','Gallery content','鑑賞コンテンツ')),this.button(this.t('新建条目','New item','項目を作成'),()=>this.create()),this.button(this.t('保存','Save','保存'),this.options.save),this.button(this.t('返回页面设计','Back to page design','ページデザインに戻る'),this.options.close));this.root.append(header,this.error);
    const hasEnding=this.options.documents().some(document=>Object.entries(document.files).some(([path,text])=>path.endsWith('/script.gal')&&parse({documentId:document.documentId,revision:document.revision,text}).statements.some(statement=>statement.command==='end'&&typeof statement.args.endingId==='string'&&statement.args.endingId.trim())));
    if(!hasEnding)this.root.append(node('p',this.t('鉴赏需要至少一个带结局标识的 end；请在路线结束处设置。','Gallery access requires at least one end instruction with an ending ID.','鑑賞には結末 ID を指定した end 命令が必要です。')));
    const tabs=node('nav');for(const [kind,label] of [['cg','CG'],['video',this.t('影片','Videos','映像')],['music',this.t('音乐','Music','音楽')]] as const){const button=this.button(label,()=>{this.kind=kind;this.selected=null;});button.setAttribute('aria-pressed',String(this.kind===kind));tabs.append(button);}this.root.append(tabs);
    const list=node('section');list.className='designer-gallery-list';
    for(const entry of entries){const row=this.button(`${entry.name} · ${entry.series}`,()=>{this.selected=entry.id;});row.setAttribute('aria-pressed',String(this.selected===entry.id));list.append(row);}if(!entries.length)list.append(node('p',this.t('新建条目并选择素材，随后关联剧情解锁点。','Create an item, choose media, then link its story unlocks.','項目を作成し、素材と物語の解放ポイントを設定します。')));this.root.append(list);
    const inspector=this.options.inspector;inspector.replaceChildren(node('h2',selected?.name??this.t('鉴赏内容','Gallery content','鑑賞コンテンツ')));if(!selected)return;
    const edit=async(run:(entry:GalleryEntry)=>void)=>{const entry=structuredClone(selected);run(entry);await this.options.apply(galleryContentEdit(this.options.documents(),entry));};
    const field=(title:string,value:string|number,run:(value:string)=>Promise<void>,type='text')=>{const label=node('label',title),input=node('input');input.type=type;input.value=String(value);input.ariaLabel=title;input.onchange=()=>void this.run(()=>run(input.value));label.append(input);inspector.append(label);};
    field(this.t('名称','Name','名前'),selected.name,value=>edit(entry=>{entry.name=value;}));field(this.t('系列','Series','シリーズ'),selected.series,value=>edit(entry=>{entry.series=value;}));field(this.t('系列顺序','Series order','シリーズ順'),selected.seriesOrder??0,value=>edit(entry=>{entry.seriesOrder=Number(value);}),'number');field(this.t('条目顺序','Item order','項目順'),selected.order,value=>edit(entry=>{entry.order=Number(value);}),'number');
    const policy=node('label',this.t('未解锁时隐藏','Hide when locked','未解放時は非表示')),checkbox=node('input');checkbox.type='checkbox';checkbox.checked=selected.lockedView==='hidden';checkbox.onchange=()=>void this.run(()=>edit(entry=>{entry.lockedView=checkbox.checked?'hidden':'placeholder';}));policy.append(checkbox);inspector.append(policy);
    const media=Object.assign({},...this.options.documents().map(document=>document.files))['assets/index.json'];const assets=media?(JSON.parse(media).data.assets??[]):[];
    const describeMedia=(id:Id)=>{const asset=assets.find((item:{id:Id})=>item.id===id);const variant=asset?.variants?.find((item:{id:Id})=>item.id===asset.activeVariantId);return asset?`${asset.name}${variant?.metadata?.durationSec?` · ${variant.metadata.durationSec} s`:''}`:this.t('素材不可用','Media unavailable','素材を利用できません');};
    if(selected.kind!=='cg'&&selected.assets[0])inspector.append(node('p',describeMedia(selected.assets[0])));
    const pick=(purpose:string,kind:'image'|'audio'|'video',apply:(id:Id)=>Promise<void>)=>{const button=this.button(purpose,async()=>{const source=await this.options.services.read();if(!source.ok)throw new Error(source.error.message);await openAssetPicker({services:this.options.services,projectId:source.value.project.projectId,allowedKinds:[kind],locale:this.options.locale,purpose,returnFocus:button,onApply:async choice=>{await apply(choice.assetId);this.draw();return {ok:true,value:undefined,warnings:[]};}});});inspector.append(button);};
    if(selected.kind==='cg'){
      const chosen=new Set<Id>(selected.differences?.slice(0,1).map(diff=>diff.id));
      for(const diff of [...selected.differences??[]].sort((a,b)=>a.order-b.order)){
        const group=node('section');group.append(node('h3',diff.name),node('p',describeMedia(diff.assetId)));const choose=node('input');choose.type='checkbox';choose.checked=chosen.has(diff.id);choose.ariaLabel=this.t('纳入本次解锁','Include in this unlock','今回の解放に含める');choose.onchange=()=>choose.checked?chosen.add(diff.id):chosen.delete(diff.id);group.append(choose);inspector.append(group);
        field(this.t('差分名称','Variation name','差分名'),diff.name,value=>edit(entry=>{entry.differences!.find(item=>item.id===diff.id)!.name=value;}));field(this.t('差分顺序','Variation order','差分順'),diff.order,value=>edit(entry=>{entry.differences!.find(item=>item.id===diff.id)!.order=Number(value);}),'number');
        pick(this.t('更换差分素材','Replace variation image','差分素材を変更'),'image',id=>edit(entry=>{entry.differences!.find(item=>item.id===diff.id)!.assetId=id;}));inspector.append(this.button(this.t('设为封面','Use as cover','表紙に設定'),()=>edit(entry=>{entry.coverDifferenceId=diff.id;})));
        const refs=this.references(selected).filter(ref=>ref.statement.args.differenceId===diff.id||(ref.statement.args.differenceIds as Id[]|undefined)?.includes(diff.id));
        inspector.append(this.button(this.t('移除差分','Remove variation','差分を削除'),()=>{if(refs.length)throw new Error(this.t('请先处理该差分的解锁引用','Resolve this variation’s unlock references first','差分の解放参照を先に修正してください'));return edit(entry=>{entry.differences=entry.differences!.filter(item=>item.id!==diff.id);if(entry.coverDifferenceId===diff.id)entry.coverDifferenceId=null;});}));
      }
      pick(this.t('添加差分','Add variation','差分を追加'),'image',id=>edit(entry=>{entry.differences??=[];entry.differences.push({id:createId(this.options.documents()),assetId:id,name:this.t('新差分','New variation','新しい差分'),order:entry.differences.length});}));
      inspector.append(this.button(this.t('在当前句后插入独立解锁','Insert unlock after the current line','現在の文の後に解放命令を挿入'),()=>this.insertUnlock(selected,[...chosen])));
      inspector.append(this.button(this.t('关联当前指令所选差分','Link selected variations to current instruction','選択差分を現在の命令に関連付け'),async()=>{if(!chosen.size)throw new Error(this.t('请选择差分','Select variations','差分を選択してください'));const input=galleryContentEdit(this.options.documents(),selected);this.associate(input,selected,[...chosen]);await this.options.apply(input);}));
    }else{pick(this.t('选择媒体','Choose media','メディアを選択'),selected.kind==='music'?'audio':'video',id=>edit(entry=>{entry.assets=[id];}));pick(this.t('选择封面','Choose cover','表紙を選択'),'image',id=>edit(entry=>{entry.cover=id;}));inspector.append(this.button(this.t('关联当前指令','Link current instruction','現在の命令に関連付け'),async()=>{const input=galleryContentEdit(this.options.documents(),selected);this.associate(input,selected,[]);await this.options.apply(input);}));}
    if(selected.kind!=='cg')inspector.append(this.button(this.t('在当前句后插入独立解锁','Insert unlock after the current line','現在の文の後に解放命令を挿入'),()=>this.insertUnlock(selected,[])));
    const references=this.references(selected);inspector.append(node('h3',this.t('解锁位置','Unlock locations','解放位置')));for(const ref of references)inspector.append(this.button(`${ref.statement.command} · ${ref.document.files[Object.keys(ref.document.files).find(path=>path.endsWith('/scene.json'))??'']?JSON.parse(ref.document.files[Object.keys(ref.document.files).find(path=>path.endsWith('/scene.json'))!]!).data.name:''}`,()=>this.options.locate(ref.statement.source)));
    inspector.append(this.button(this.t('移除条目','Remove item','項目を削除'),async()=>{if(references.length)throw new Error(this.t('请先处理上方列出的解锁引用','Resolve the unlock references listed above first','上記の解放参照を先に修正してください'));await this.options.apply(galleryContentEdit(this.options.documents(),selected,true));this.selected=null;}));
    const details=node('details');details.append(node('summary',this.t('技术详情','Technical details','技術詳細')),node('code',selected.id));inspector.append(details);
  }
}
