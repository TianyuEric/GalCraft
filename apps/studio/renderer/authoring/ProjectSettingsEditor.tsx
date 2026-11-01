import { useEffect, useRef, useState } from 'react';
import type { DocumentView, EditReceipt, Project, Result } from '@galcraft/contracts';
import type { AuthorOperation } from '@galcraft/documents/authoring';
import { Button, Choice, Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Disclosure } from '../components/disclosure.js';
import { FieldConflictReview, type ConflictField } from './FieldConflictReview.js';
import './story-structure.css';

export type ProjectSettingsGuiDraft = { project: Project; baseline: Project; fields: Record<string, unknown> };
type Props = { documents: DocumentView[]; locale: string; read(): Promise<Result<DocumentView[]>>; apply(operation: AuthorOperation, baseline: DocumentView[]): Promise<Result<EditReceipt>>; pendingChanged?(pending: boolean): void; guiDraft?: ProjectSettingsGuiDraft; onGuiDraftChange?(draft: ProjectSettingsGuiDraft): void };
const projectOf = (documents: DocumentView[]) => JSON.parse(documents.find(document=>'project.json' in document.files)!.files['project.json']!).data as Project;
const get = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((item,key)=>(item as Record<string,unknown>|undefined)?.[key],value);
export function ProjectSettingsEditor({ documents, locale, read, apply, pendingChanged, guiDraft, onGuiDraftChange }: Props) {
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const [project,setProject]=useState(()=>guiDraft?.project??projectOf(documents)), [fields,setFields]=useState<Record<string,unknown>>(()=>guiDraft?.fields??{}), [error,setError]=useState(''), [status,setStatus]=useState(''), [busy,setBusy]=useState(false), [conflicts,setConflicts]=useState<ConflictField[]>([]);
  const base=useRef(guiDraft?.baseline??project);
  useEffect(()=>{pendingChanged?.(Object.keys(fields).length>0);},[fields,pendingChanged]);
  useEffect(()=>{onGuiDraftChange?.({project,baseline:base.current,fields});},[project,fields,onGuiDraftChange]);
  const value=(path:string,fallback:unknown='')=>fields[path]??get(project,path)??fallback;
  const change=(path:string,next:unknown)=>{if(!Object.keys(fields).length)base.current=structuredClone(project);setFields(previous=>({...previous,[path]:next}));setConflicts([]);setStatus('');setError('');};
  const labels:Record<string,string>={name:t('作品名称','Project name','作品名'),description:t('作品简介','Description','作品紹介'),releaseVersion:t('发行版本','Release version','公開バージョン'),'release.executableName':t('Windows 入口文件名','Windows executable name','Windows 実行ファイル名'),'release.publisher':t('发行者','Publisher','発行者'),'release.windowsSigning':t('Windows 签名方式','Windows signing','Windows 署名'),'canvas.width':t('宽度（像素）','Width (px)','幅（px）'),'canvas.height':t('高度（像素）','Height (px)','高さ（px）'),'canvas.stageColor':t('舞台底色','Stage color','舞台の背景色'),'player.emergencyKey':t('紧急回避快捷键','Emergency key','緊急回避キー'),'player.autosave':t('自动存档','Autosave','自動セーブ'),dynamicAssets:t('动态素材预载入','Dynamic asset preloading','動的素材の先読み')};
  const submit=async(resolution?:'draft'|'current')=>{
    setBusy(true);setError('');setStatus('');
    try {
      const listed=await read();if(!listed.ok)throw new Error(listed.error.message);const latest=projectOf(listed.value);
      const changed=Object.entries(fields).filter(([path,next])=>JSON.stringify(get(base.current,path))!==JSON.stringify(next));
      const collision=changed.filter(([path,next])=>JSON.stringify(get(base.current,path))!==JSON.stringify(get(latest,path))&&JSON.stringify(next)!==JSON.stringify(get(latest,path))).map(([path])=>path);
      if(collision.length&&!resolution){setConflicts(collision.map(path=>({path,label:labels[path]??path,baseline:get(base.current,path),current:get(latest,path),input:fields[path]})));throw new Error(t('这些字段已在工作区变化。输入已保留，请选择采用的内容。','These fields changed in the workspace. Your input is retained; choose the values to apply.','作業内容で同じ項目が変更されました。入力を保持しています。採用する値を選択してください。'));}
      const changes:Record<string,unknown>={};
      for(const [path,next] of changed){if(resolution==='current'&&collision.includes(path))continue;const [key,child]=path.split('.');if(child){changes[key!]??={};(changes[key!] as Record<string,unknown>)[child]=next;}else changes[key!]=next;}
      if(changes.release&&!latest.release)changes.release={executableName:'Game.exe',publisher:'',windowsSigning:'unsigned',...(changes.release as object)};
      if(Object.keys(changes).length){const result=await apply({op:'project.update',changes} as AuthorOperation,listed.value);if(!result.ok)throw new Error(result.error.message);}
      const refreshed=await read();if(!refreshed.ok)throw new Error(refreshed.error.message);setProject(projectOf(refreshed.value));setFields({});setConflicts([]);setStatus(t('已应用到作品工作区，可撤销。','Applied to the project workspace. Undo is available.','作品の作業内容に適用しました。元に戻せます。'));
    }catch(reason){setError(String(reason));}finally{setBusy(false);}
  };
  const text=(path:string,label:string,kind='text',fallback:unknown='')=><Field key={path} label={label}><Input placeholder="" type={kind} value={String(value(path,fallback))} disabled={busy} onChange={event=>change(path,kind==='number'?Number(event.target.value):event.target.value)}/></Field>;
  const assets=documents.flatMap(document=>Object.entries(document.files).filter(([path])=>path==='assets/index.json').flatMap(([,raw])=>(JSON.parse(raw).data.assets??[]) as {id:string;name:string}[]));
  return <section className="scene-entry-document story-structure-editor"><h2>{t('作品资料与玩家选项','Project details and player options','作品情報とプレイヤー設定')}</h2>
    {error&&<p role="alert" className="workbench-error">{error}</p>}{status&&<p role="status">{status}</p>}
    {!!conflicts.length&&<FieldConflictReview fields={conflicts} locale={locale}><Button disabled={busy} onClick={()=>void submit('draft')}>{t('采用我的冲突字段','Use my conflicting fields','自分の入力を採用')}</Button><Button disabled={busy} onClick={()=>void submit('current')}>{t('采用工作区冲突字段','Use workspace conflicting fields','作業内容の値を採用')}</Button></FieldConflictReview>}
    <fieldset className="story-structure-fields" disabled={busy}>
      {text('name',t('作品名称','Project name','作品名'))}<Field label={t('作品简介','Description','作品紹介')}><Textarea rows={4} value={String(value('description'))} onChange={event=>change('description',event.target.value)}/></Field>
      {text('releaseVersion',t('发行版本','Release version','公開バージョン'))}
      <Disclosure><span>{t('发行元信息','Release identity','公開情報')}</span>{text('release.executableName',t('Windows 入口文件名','Windows executable name','Windows 実行ファイル名'),'text','Game.exe')}{text('release.publisher',t('发行者','Publisher','発行者'))}<Field label={t('Windows 签名方式','Windows signing','Windows 署名')}><Choice label="Windows signing" value={String(value('release.windowsSigning','unsigned'))} options={[{value:'unsigned',label:t('未签名','Unsigned','署名なし')},{value:'certificate',label:t('作者证书','Author certificate','作者の証明書')}]} onChange={next=>{change('release.windowsSigning',next);if(!project.release){change('release.executableName',value('release.executableName','Game.exe'));change('release.publisher',value('release.publisher',''));}}}/></Field></Disclosure>
      <Disclosure><span>{t('舞台画布','Stage canvas','舞台キャンバス')}</span>{text('canvas.width',t('宽度（像素）','Width (px)','幅（px）'),'number')}{text('canvas.height',t('高度（像素）','Height (px)','高さ（px）'),'number')}{text('canvas.stageColor',t('舞台底色','Stage color','舞台の背景色'))}</Disclosure>
      <Field label={t('紧急回避快捷键','Emergency key','緊急回避キー')} help={t('可选 F1–F12、字母或数字键；运行时再次按键恢复。','Choose F1–F12, a letter or a digit; press again to restore.','F1–F12、英字・数字キーを選択します。再度押すと復帰します。')}><Choice label="Emergency key" value={String(value('player.emergencyKey','F8'))} options={[...Array.from({length:12},(_,i)=>({value:`F${i+1}`,label:`F${i+1}`})),...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(item=>typeof item==='string'?{value:`Key${item}`,label:item}:item).concat(Array.from({length:10},(_,i)=>({value:`Digit${i}`,label:String(i)})))} onChange={next=>change('player.emergencyKey',next)}/></Field>
      <Field label={t('自动存档','Autosave','自動セーブ')}><input type="checkbox" checked={value('player.autosave')===true} onChange={event=>change('player.autosave',event.target.checked)}/></Field>
      <Disclosure><span>{t('动态素材预载入','Dynamic asset preloading','動的素材の先読み')}</span><p>{t('勾选运行时可能通过变量或插件使用的素材。','Select assets that may be used dynamically by variables or plugins.','変数・プラグインで動的に使用する素材を選択します。')}</p>{assets.map(asset=><label key={asset.id} className="character-check"><input type="checkbox" checked={(value('dynamicAssets',[]) as string[]).includes(asset.id)} onChange={event=>change('dynamicAssets',event.target.checked?[...(value('dynamicAssets',[]) as string[]),asset.id]:(value('dynamicAssets',[]) as string[]).filter(id=>id!==asset.id))}/>{asset.name}</label>)}</Disclosure>
      <div className="gc-actions"><Button tone="primary" disabled={!Object.keys(fields).length} onClick={()=>void submit()}>{t('应用作品设置','Apply project settings','作品設定を適用')}</Button><Button tone="quiet" disabled={!Object.keys(fields).length} onClick={()=>{setFields({});setConflicts([]);setError('');}}>{t('还原未应用输入','Reset pending input','未適用の入力を戻す')}</Button></div>
    </fieldset></section>;
}
