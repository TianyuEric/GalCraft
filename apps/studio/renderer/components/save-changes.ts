import type { DocumentView, Json, SavePlan } from '@galcraft/contracts';
import { applyTextEdits,CoreCommandSpecs,parse,patchFields } from '@galcraft/dsl';
import type { ParseResult,StatementNode,ValueNode } from '@galcraft/dsl';
import { commandName } from '../authoring/command-picker.js';
import { readableFile } from './readable-files.js';

export type ValueChange = { field: string; before: unknown; after: unknown };
export type LogicalChange = { kind: 'add' | 'delete' | 'move' | 'update' | 'source'; label: string; statementId?: string; fields?: ValueChange[]; before?: string; after?: string };
export type SaveChangeGroup = { documentId: string; name: string; paths: string[]; changes: LogicalChange[] };
const same = (before: unknown, after: unknown) => JSON.stringify(before) === JSON.stringify(after);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function changedValues(before: unknown, after: unknown, path = ''): ValueChange[] {
  if (same(before,after)) return [];
  if (record(before) && record(after)) return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key => changedValues(before[key],after[key],path?`${path}.${key}`:key));
  return [{field:path,before,after}];
}

function movedIds(before: string[], after: string[]): Set<string> {
  const positions=new Map(before.map((id,index)=>[id,index]));
  const common=after.filter(id=>positions.has(id)), lengths:number[]=[], predecessors:number[]=[];
  for(let i=0;i<common.length;i++) {lengths[i]=1;predecessors[i]=-1;for(let j=0;j<i;j++)if(positions.get(common[j]!)!<positions.get(common[i]!)!&&lengths[j]!+1>lengths[i]!) {lengths[i]=lengths[j]!+1;predecessors[i]=j;}}
  let index=lengths.indexOf(Math.max(0,...lengths)); const stable=new Set<string>();
  while(index>=0){stable.add(common[index]!);index=predecessors[index]!;}
  return new Set(common.filter(id=>!stable.has(id)));
}

const commands=new Map(CoreCommandSpecs.map(spec=>[spec.key,spec]));
const commentsIn=(parsed:ParseResult,start:number,end:number)=>parsed.tokens.filter(token=>token.kind==='comment'&&token.start>=start&&token.end<=end).map(token=>token.text);

function fieldPatchedInsertion(documentId:string,node:StatementNode,text:string,dialogue=false,wholeValues=true):string|null {
  const changes:{field:string;op:'set';value:Json}[]=[];
  const originalValue=(value:ValueNode,path=''):Json=>{
    if(path&&wholeValues&&(value.kind==='object'||value.kind==='array')&&text.slice(value.start,value.end)!==JSON.stringify(value.value)) {
      changes.push({field:path,op:'set',value:value.value as Json});return null;
    }
    if(value.kind==='expression'){changes.push({field:path,op:'set',value:value.value as Json});return null;}
    if(value.kind==='array')return value.items!.map((item,index)=>originalValue(item,`${path}.${index}`));
    if(value.kind!=='object')return value.value as Json;
    const original:Record<string,Json>={};
    for(const field of value.fields??[]) {
      const fieldPath=path?`${path}.${field.key}`:field.key;
      const generated=dialogue&&!path?['speaker','text'].includes(field.key):text[field.keyStart]==='"';
      if(generated)original[field.key]=originalValue(field.valueNode,fieldPath);
      else changes.push({field:fieldPath,op:'set',value:field.valueNode.value as Json});
    }
    return original;
  };
  const args=originalValue(node.object!) as Record<string,Json>;
  if(!changes.length)return null;
  const source=dialogue?`say {speaker: ${JSON.stringify(args.speaker)}, text: ${JSON.stringify(args.text)}} @${node.id};`:
    `${node.command} ${JSON.stringify(args)} @${node.id};`;
  const parsed=parse({documentId,revision:0,text:source});
  const patched=patchFields(parsed,{documentId,revision:0,statementIds:[node.id!],changes});
  return patched.ok?applyTextEdits(source,patched.value):null;
}

export function scriptChanges(documentId: string, before: string, after: string, locale: string): LogicalChange[] {
  if(before===after)return [];
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const old=parse({documentId,revision:0,text:before}), current=parse({documentId,revision:1,text:after});
  if([...old.issues,...current.issues].some(issue=>issue.severity==='error'))return [{kind:'source',label:t('源码修改（当前原文含错误）','Source changes (source contains errors)','ソースの変更（構文エラーあり）'),before,after}];
  const oldNodes=old.cst.filter(node=>node.valid&&node.id), newNodes=current.cst.filter(node=>node.valid&&node.id);
  const oldById=new Map(oldNodes.map(node=>[node.id!,node])),newById=new Map(newNodes.map(node=>[node.id!,node]));
  const moved=movedIds(oldNodes.map(node=>node.id!),newNodes.map(node=>node.id!));
  const changes:LogicalChange[]=[];
  const structural=oldNodes.length!==newNodes.length||oldNodes.some((node,index)=>node.id!==newNodes[index]?.id);
  const oldPrefix=before.slice(0,oldNodes[0]?.start??before.length),newPrefix=after.slice(0,newNodes[0]?.start??after.length),oldSuffix=oldNodes.at(-1)?.trailingTrivia??'';
  let sourceChanged=oldPrefix!==newPrefix&&!(newNodes.length===0&&newPrefix===oldPrefix+oldSuffix);
  const label=(node:typeof oldNodes[number])=>{const spec=commands.get(node.command);const type=spec?commandName(spec,locale):t('扩展指令','Extension command','拡張コマンド');const text=(node.object?.value as Record<string,unknown>|undefined)?.text;return typeof text==='string'?`${type} · ${text.slice(0,60)}`:type;};
  for(const node of oldNodes)if(!newById.has(node.id!))changes.push({kind:'delete',statementId:node.id!,label:label(node)});
  for(const node of newNodes) {
    const prior=oldById.get(node.id!);
    if(!prior){
      changes.push({kind:'add',statementId:node.id!,label:label(node)});
      const args=node.object!.value as Record<string,unknown>;
      const commandRaw=`${node.command} ${JSON.stringify(args)} @${node.id};`;
      const dialogueRaw=node.command==='say'?`say {speaker: ${JSON.stringify(args.speaker)}, text: ${JSON.stringify(args.text)}} @${node.id};`:null;
      const copied=oldNodes.some(original=>original.command===node.command&&same(original.object?.value,args)&&
        applyTextEdits(original.raw,[{start:original.idStart!-original.start,end:original.idStart!-original.start+original.id!.length,text:node.id!,oldText:original.id!}])===node.raw);
      const comment=commentsIn(current,node.start,node.end).length>0;
      const generated=node.raw===commandRaw||node.raw===dialogueRaw||copied||
        !comment&&[false,true].some(dialogue=>(!dialogue||node.command==='say')&&[true,false].some(wholeValues=>node.raw===fieldPatchedInsertion(documentId,node,after,dialogue,wholeValues)));
      // Keep authored source beyond the command/dialogue insertion and saved copy formats.
      sourceChanged ||= comment||node.trailingTrivia!=='\n'||!generated;
      continue;
    }
    if(moved.has(node.id!))changes.push({kind:'move',statementId:node.id!,label:label(node),before:String(oldNodes.indexOf(prior)+1),after:String(newNodes.indexOf(node)+1)});
    const fields=changedValues(prior.object?.value,node.object?.value);
    sourceChanged ||= !same(commentsIn(old,prior.start,prior.end),commentsIn(current,node.start,node.end));
    const patched=patchFields(old,{documentId,revision:old.revision,statementIds:[node.id!],changes:fields.map(field=>({field:field.field,op:field.after===undefined?'inherit':'set',value:(field.after??null) as Json}))});
    if(patched.ok) {
      const edits=patched.value.map(edit=>({...edit,start:edit.start-prior.start,end:edit.end-prior.start}));
      if(prior.command!==node.command)edits.push({start:prior.commandStart-prior.start,end:prior.commandEnd-prior.start,text:node.command,oldText:prior.command});
      sourceChanged ||= applyTextEdits(prior.raw,edits)!==node.raw;
    } else sourceChanged=true;
    // Compare against the boundary trivia produced by the card operations as well.
    const last=node===newNodes.at(-1);
    const expectedTrivia=moved.size?(prior===oldNodes.at(-1)?'':prior.trailingTrivia.trimEnd())+(last?oldSuffix:'\n'):
      structural&&last&&prior!==oldNodes.at(-1)?prior.trailingTrivia+oldSuffix:prior.trailingTrivia;
    sourceChanged ||= node.trailingTrivia!==prior.trailingTrivia&&node.trailingTrivia!==expectedTrivia;
    if(prior.command!==node.command)fields.unshift({field:'command',before:prior.command,after:node.command});
    if(fields.length)changes.push({kind:'update',statementId:node.id!,label:label(node),fields});
  }
  if(sourceChanged||!changes.length)changes.push({kind:'source',label:t('源码文字与格式修改','Source text and formatting','ソースの文字・書式変更'),before,after});
  return changes;
}

export function buildSaveChanges(files: SavePlan['files'], documents: readonly DocumentView[] = [], names: Record<string,string> = {}, locale = 'zh-CN'): SaveChangeGroup[] {
  const grouped=new Map<string,SaveChangeGroup>();
  for(const file of files) {
    let group=grouped.get(file.documentId);
    if(!group){group={documentId:file.documentId,name:names[file.documentId]??readableFile(file.path,locale),paths:[],changes:[]};grouped.set(file.documentId,group);}
    group.paths.push(file.path);
    const document=documents.find(item=>item.documentId===file.documentId);
    if(!document)continue;
    const before=document.savedFiles[file.path],after=document.files[file.path];
    if(before===after)continue;
    if(/\.(gal|galdsl|dsl)$/.test(file.path)){group.changes.push(...scriptChanges(file.documentId,before??'',after??'',locale));continue;}
    if(before===undefined||after===undefined){group.changes.push({kind:after===undefined?'delete':'add',label:readableFile(file.path,locale)});continue;}
    if(file.path.endsWith('.json'))try{
      const old=JSON.parse(before),current=JSON.parse(after);
      const oldData = old.data ?? old, currentData = current.data ?? current;
      if (file.path === 'assets/index.json' && Array.isArray(oldData.assets) && Array.isArray(currentData.assets)) {
        const oldAssets = new Map<string, Record<string, unknown>>(oldData.assets.map((asset: Record<string, unknown>) => [String(asset.id), asset]));
        const currentAssets = new Map<string, Record<string, unknown>>(currentData.assets.map((asset: Record<string, unknown>) => [String(asset.id), asset]));
        const prefix = locale === 'en' ? 'Asset' : locale === 'ja' ? '素材' : '素材';
        for (const id of new Set([...oldAssets.keys(), ...currentAssets.keys()])) {
          const prior = oldAssets.get(id), next = currentAssets.get(id);
          if (same(prior, next)) continue;
          group.changes.push({ kind: !prior ? 'add' : !next ? 'delete' : 'update', label: `${prefix} · ${next?.name ?? prior?.name ?? id}`, fields: changedValues(prior, next) });
        }
        const { assets: oldAssetsValue, ...oldOther } = oldData, { assets: currentAssetsValue, ...currentOther } = currentData;
        const fields = changedValues(oldOther, currentOther);
        if (fields.length) group.changes.push({ kind: 'update', label: readableFile(file.path, locale), fields });
        if (!same(oldData.assets.map((asset: {id: string}) => asset.id), currentData.assets.map((asset: {id: string}) => asset.id))) {
          group.changes.push({ kind: 'source', label: locale === 'en' ? 'Asset index order and membership' : locale === 'ja' ? '素材索引の順序と構成' : '素材索引顺序与成员', before, after });
        }
        continue;
      }
      const fields=changedValues(oldData,currentData);
      if(fields.length)group.changes.push({kind:'update',label:readableFile(file.path,locale),fields});
      else if(before.replace(/("revision"\s*:\s*)\d+/,'$1')!==after.replace(/("revision"\s*:\s*)\d+/,'$1'))group.changes.push({kind:'source',label:readableFile(file.path,locale),before,after});
      continue;
    }catch{/* Invalid authored source remains visible below. */}
    group.changes.push({kind:'source',label:readableFile(file.path,locale),before,after});
  }
  for(const group of grouped.values())if(!documents.some(item=>item.documentId===group.documentId)) {
    const members=files.filter(item=>item.documentId===group.documentId);
    group.changes.push({kind:members.every(item=>!item.newExists)?'delete':members.every(item=>!item.oldExists)?'add':'update',label:group.name});
  }
  return [...grouped.values()].filter(group=>group.changes.length);
}

export function compactSourceDiff(before: string, after: string): { before: string; after: string } {
  const old=before.split('\n'),current=after.split('\n');let prefix=0,suffix=0;
  while(prefix<old.length&&prefix<current.length&&old[prefix]===current[prefix])prefix++;
  while(suffix<old.length-prefix&&suffix<current.length-prefix&&old.at(-1-suffix)===current.at(-1-suffix))suffix++;
  return {before:old.slice(prefix,old.length-suffix).join('\n'),after:current.slice(prefix,current.length-suffix).join('\n')};
}
