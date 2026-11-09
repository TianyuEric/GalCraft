import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { createId, LockSchema } from '@galcraft/contracts';
import {parse} from '@galcraft/dsl';
import { readTemplateDocuments } from '@galcraft/templates';
import { BookOpen, Code2, FileText, Info, LayoutPanelLeft, Moon, Play, Redo2, Save, Search, Sun, Undo2, X } from 'lucide-react';
import { CandidateContext, useCandidate, useCandidateState } from './application/context.js';
import { CandidateSession, type CandidateServicesFactory } from './application/session.js';
import { CandidatePreferences } from './application/preferences.js';
import { createEmptyCandidateSeed,copyCandidateIdentity,type CandidateSeed } from './application/documents.js';
import { createCandidateHost, type CandidateHostOptions } from './adapters/candidate-host.js';
import { checkCandidateDependencies, type CandidateDependencyCatalog } from './application/library-dependencies.js';
import { CandidateDockWorkspace, type DockHandle, type LayoutPreset } from './components/CandidateDockWorkspace.js';
import { CandidateWritingView } from './workfaces/CandidateWritingView.js';
import { CandidateObjectInspector } from './workfaces/CandidateObjectInspector.js';

import { CandidateSourceView } from './workfaces/CandidateSourceView.js';
import { CandidateCommandView } from './workfaces/CandidateCommandView.js';

import { CandidateAppearanceView } from './workfaces/CandidateAppearanceView.js';
import { CandidateOutlineView } from './workfaces/CandidateOutlineView.js';
import { CandidateStructureView } from './workfaces/CandidateStructureView.js';
import { CandidateCharactersView, CandidateCharacterDirectory, CandidateStorySceneGraph } from './workfaces/CandidateCharactersView.js';
import { CandidatePagesView, CandidatePageDirectory, CandidatePageOutline, candidatePageTitle, candidatePageResourceTitle } from './workfaces/CandidatePagesView.js';
import { CandidateStageWorkspace } from './workfaces/CandidateStageWorkspace.js';
import {CandidateSceneWorkspace} from './workfaces/CandidateSceneWorkspace.js';
import { CandidateOverviewView, CandidateAuxiliaryView } from './workfaces/CandidateOverviewView.js';
import { CandidateSettingsView } from './workfaces/CandidateSettingsView.js';
import {CandidateMaintenanceView} from './workfaces/CandidateMaintenanceView.js';
import {CandidateSearchView} from './workfaces/CandidateSearchView.js';
import { CandidatePublishView } from './workfaces/CandidatePublishView.js';
import { CandidateAssetsView, CandidateAssetDirectoryView } from './workfaces/CandidateAssetsView.js';
import { CandidatePluginsView, CandidatePluginsProvider, useCandidatePluginViews, useCandidatePluginClose, useCandidatePluginCommands } from './workfaces/CandidatePluginsView.js';
import { CandidateTaskPanelsProvider, CandidateTaskPanel, type TaskPanelId } from './application/task-panels.js';
import { candidateWorkfaces, workfaceIcon } from './application/workfaces.js';
import { CandidateAssetInspectorView } from './workfaces/CandidateAssetInspectorView.js';
import { CandidateAssetPreviewView } from './workfaces/CandidateAssetPreviewView.js';
import {CandidateCommandProfessionalView} from './workfaces/CandidateCommandProfessionalView.js';
import {candidateDirectoryKey,assertCandidateRestoreTarget,type CandidateCreationRequest,type CandidateRestoreTarget} from './application/project-library.js';
import {createCandidateMaintenance,type CandidateMaintenancePort} from './application/project-maintenance.js';
import { CandidateProjectCenter } from './components/CandidateProjectCenter.js';
import {CandidatePreferencesDialog} from './components/CandidatePreferencesDialog.js';
import { CandidateHistoryDialog } from './components/CandidateHistoryDialog.js';
import { CandidateSaveReview } from './components/CandidateSaveReview.js';
import { CandidateButton, CandidateIconButton, CandidateInput, CandidateMenuButton } from './components/controls/index.js';
import { StudioChromeHeader, StudioChromeToolbar, StudioChromeToolGroup } from '../../components/workbench/StudioChrome.js';
import { candidateAssets } from './application/services.js';
import '../../styles/studio-theme.css';
import './styles/studio.css';

export type CandidateStudioProps = { seed: CandidateSeed; createServices: CandidateServicesFactory; preferenceKey: string; initialLayout?: LayoutPreset; initialView?: string; hostOptions?: CandidateHostOptions; showIntegration?: boolean; initialProjectState?:'opened'|'center'|'empty'|'failed'|'recovery' };
type Work={id:string;seed:CandidateSeed;session:CandidateSession|null;backup:CandidateSeed|null;path?:string;pathStatus?:'available'|'missing';pinned?:boolean;registered?:boolean;lastOpenedAt?:number};
export function CandidateStudio({ seed, createServices, hostOptions, initialProjectState='opened', ...props }: CandidateStudioProps) {
  const [personal] = useState(() => new CandidatePreferences('galcraft-studio-candidate:personal:' + props.preferenceKey,seed.ui.theme));
  const preferences=useSyncExternalStore(listener=>personal.subscribe(listener),personal.getSnapshot);
  const [preferencesOpen,setPreferencesOpen]=useState(false);
  const [works,setWorks]=useState<Work[]>(()=>initialProjectState==='empty'?[]:[{id:seed.presentation.id,seed,session:initialProjectState==='failed'?null:new CandidateSession(seed,createServices,hostOptions,personal),backup:initialProjectState==='recovery'?structuredClone(seed):null,lastOpenedAt:Date.now()}]);
  const [active,setActive]=useState(seed.presentation.id),[center,setCenter]=useState(initialProjectState!=='opened'),[error,setError]=useState(initialProjectState==='failed'?'作品打开失败；数据保留，可重试。':'');
  const [audit,setAudit]=useState(false),[createFailure,setCreateFailure]=useState(false);
  const currentWorks=useRef(works);currentWorks.current=works;const generation=useRef(0), transitions=useRef(new Set<string>());
  const dependencyCatalogs=useRef(new Map<string,CandidateDependencyCatalog>());
  for(const work of works)if(work.session)dependencyCatalogs.current.set(work.id,work.session.services.bridge);
  const catalogFor=(work:Work)=>{
    let catalog=dependencyCatalogs.current.get(work.id);
    if(!catalog){
      // Never-opened entries need only the package/engine catalog. This snapshot is
      // not an editing session and is never synchronized back into the work.
      const {engines,plugins}=createServices(createCandidateHost(work.seed.documents)).bridge;
      catalog={engines,plugins};dependencyCatalogs.current.set(work.id,catalog);
    }
    return catalog;
  };
  const pathOf=(work:Work)=>work.path??'/candidate/works/'+work.id;
  const locations=useRef(new Map(works.map(work=>[candidateDirectoryKey(pathOf(work)),work.id])));
  for(const work of works)if(![...locations.current.values()].includes(work.id))locations.current.set(candidateDirectoryKey(pathOf(work)),work.id);
  useSyncExternalStore(listener=>{const releases=works.flatMap(work=>work.session?[work.session.subscribe(listener)]:[]);return()=>releases.forEach(release=>release());},()=>works.map(work=>[work.id,work.session?.getSnapshot().revision,work.session?.getSnapshot().project.name,work.session?.getSnapshot().dirty,work.session?.getSnapshot().saving,work.session?.getSnapshot().pendingViews.join(),Object.keys(work.session?.getSnapshot().ui.sourceDrafts??{}).join()].join(':')).join('|'));
  useEffect(()=>{const current=++generation.current;return()=>{queueMicrotask(()=>{if(generation.current===current)currentWorks.current.forEach(work=>work.session?.dispose());});};},[]);
  useEffect(()=>{for(const work of works)if(work.session&&!work.session.getSnapshot().ready)void work.session.open();},[works]);
  const transition=async(id:string,action:()=>Promise<void>)=>{if(transitions.current.has(id))throw new Error('此作品正在处理，请稍候。');transitions.current.add(id);try{await action();}finally{transitions.current.delete(id);}};
  const remaining=(session:CandidateSession|null)=>session&&(session.getSnapshot().dirty||session.getSnapshot().pendingViews.length||Object.keys(session.getSnapshot().ui.sourceDrafts).length||session.tasks.production.draftDirty);
  const capture=(work:Work,saved=false):CandidateSeed=>({...structuredClone(work.seed),taskRecovery:work.session?.captureRecovery(saved)??work.seed.taskRecovery,sourceRecovery:work.session?.host.sourceRecovery(saved)??work.seed.sourceRecovery,savedSourceRecovery:work.session?.host.sourceRecovery(true)??work.seed.savedSourceRecovery,ui:work.session?{...structuredClone(work.session.getSnapshot().ui),...(saved?{sourceDrafts:{},sourceErrors:{}}:{})}:structuredClone(work.seed.ui),presentation:{...structuredClone(work.seed.presentation),name:work.session?.getSnapshot().project.name??work.seed.presentation.name},documents:work.session?work.session.host.list().filter(document=>Object.keys(saved?document.savedFiles:document.files).length).map(document=>saved?{...document,files:structuredClone(document.savedFiles),revision:document.savedRevision,dirty:false}:document):structuredClone(work.seed.documents)});
  const activeWork=works.find(work=>work.id===active), preferenceWork=activeWork??works[0];
  const availableCreationVersions=async()=>{const provider=preferenceWork?.session?.services.bridge.engines;if(!provider)return ['0.1.0'];const result=await provider.listCreationVersions();if(!result.ok)throw new Error(result.error.message);return result.value;};
  const showPreferences=()=>setPreferencesOpen(true);
  const open=(id:string)=>{const work=currentWorks.current.find(work=>work.id===id);if(!work)throw new Error('此作品未登记。');if(transitions.current.has(id))throw new Error('此作品正在处理，请稍候。');if(work.pathStatus==='missing'||locations.current.get(candidateDirectoryKey(pathOf(work)))!==work.id)throw new Error('作品路径失效，请先修复目录。');setWorks(current=>current.map(work=>work.id===id?{...work,lastOpenedAt:Date.now(),session:work.session??new CandidateSession(work.seed,createServices,hostOptions,personal)}:work));setError('');setActive(id);setCenter(false);};
  const uniquePath=(directory:string,except?:string)=>{const key=candidateDirectoryKey(directory);if(currentWorks.current.some(work=>work.id!==except&&candidateDirectoryKey(pathOf(work))===key))throw new Error('该目录已包含另一份作品，请选择空目录。');return directory.trim();};
  const addCopy=(next:CandidateSeed,directory:string)=>{const path=uniquePath(directory);locations.current.set(candidateDirectoryKey(path),next.presentation.id);setWorks(current=>[...current,{id:next.presentation.id,seed:next,session:null,backup:null,path,registered:true,lastOpenedAt:Date.now()}]);};
  const create=async(name:string,request:CandidateCreationRequest)=>{
    const path=uniquePath(request.directory);if(!name.trim()||!Number.isInteger(request.width)||!Number.isInteger(request.height)||request.width<=0||request.height<=0)throw new Error('请填写作品名和有效画布尺寸。');
    const versions=await availableCreationVersions();if(!versions.includes(request.engineVersion))throw new Error('所选引擎当前不可用，请重新选择。');
    if(createFailure){setCreateFailure(false);throw new Error('审核宿主本次创建失败，字段已保留，可直接重试。');}
    const next=createEmptyCandidateSeed(seed,name,request),id=next.presentation.id;locations.current.set(candidateDirectoryKey(path),id);setWorks(current=>[...current,{id,seed:next,session:new CandidateSession(next,createServices,hostOptions,personal),backup:null,path,registered:true,lastOpenedAt:Date.now()}]);setActive(id);setCenter(false);
  };
  const close=async(id:string,choice:'save'|'discard')=>transition(id,async()=>{const work=currentWorks.current.find(work=>work.id===id)!;if(choice==='save'&&work.session&&!await work.session.save())throw new Error('关闭未完成：请处理未应用输入或重试保存。');if(choice==='save'&&remaining(work.session))throw new Error('保存期间还有新的修改，作品继续保持打开。请处理后再次关闭。');const next=capture(work,true);work.session?.dispose();setWorks(current=>current.map(item=>item.id===id?{...item,seed:next,session:null}:item));});
  const checkRestore=async(id:string,target:CandidateRestoreTarget)=>{
    candidateDirectoryKey(target.directory);const work=currentWorks.current.find(work=>work.id===id)!;if(!work.backup)throw new Error('备份已不存在。');
    const existing=currentWorks.current.find(item=>candidateDirectoryKey(pathOf(item))===candidateDirectoryKey(target.directory));const missing:string[]=[];
    const lock=work.backup.documents.find(document=>'dependencies.lock.json' in document.files);if(!lock)missing.push('作品依赖锁');else missing.push(...await checkCandidateDependencies(LockSchema.parse(JSON.parse(lock.files['dependencies.lock.json']!).data),catalogFor(work)));
    return {sourceId:work.backup.presentation.id,targetId:existing?.id,missingDependencies:missing};
  };
  const restore=async(id:string,choice:'save'|'discard',target:CandidateRestoreTarget)=>transition(id,async()=>{
    const work=currentWorks.current.find(work=>work.id===id)!;if(!work.backup)throw new Error('备份已不存在。');const check=await checkRestore(id,target);assertCandidateRestoreTarget({id,name:work.seed.presentation.name,dirty:false,opened:!!work.session,backup:true},target,check);if(check.missingDependencies.length)throw new Error('请先补齐依赖并重新检查：'+check.missingDependencies.join('、'));
    if(target.kind==='copy'){addCopy(copyCandidateIdentity(work.backup,target.name||work.seed.presentation.name+' · 恢复副本'),target.directory);return;}
    if(choice==='save'&&work.session&&!await work.session.save())throw new Error('恢复未完成：当前修改未保存，请先处理或重试。');if(choice==='save'&&remaining(work.session))throw new Error('保存期间还有新的修改，请处理后再次恢复。');
    const preserved=choice==='save'?copyCandidateIdentity(capture(work,true),(work.session?.getSnapshot().project.name??work.seed.presentation.name)+' · 恢复前副本'):null;
    work.session?.dispose();const restored=structuredClone(work.backup);setWorks(current=>[...current.map(item=>item.id===id?{...item,seed:restored,session:new CandidateSession(restored,createServices,hostOptions,personal)}:item),...(preserved?[{id:preserved.presentation.id,seed:preserved,session:null,backup:null}]:[])]);setActive(id);setCenter(false);
  });
  const maintenancePorts=useRef(new WeakMap<CandidateSession,CandidateMaintenancePort>());
  for(const work of works)if(work.session&&!maintenancePorts.current.has(work.session))maintenancePorts.current.set(work.session,createCandidateMaintenance(work.session,{capture:saved=>capture(currentWorks.current.find(item=>item.id===work.id)!,saved),addCopy}));
  const maintenance=activeWork?.session?maintenancePorts.current.get(activeWork.session)!:null;
  const reviewMaintenance=(action:'recovery'|'conflict'|'failure')=>{
    if(!maintenance||!activeWork?.session)return;
    if(action==='failure'){maintenance.failNext('migrationCommit','审核宿主提交副本失败；迁移计划保留，可重试。');return;}
    const incoming=capture(activeWork,action==='conflict'),scene=incoming.ui.sceneId,document=incoming.documents.find(document=>document.documentId===incoming.sceneDocuments[scene]);
    if(action==='recovery'){incoming.ui.sourceDrafts[scene]=(document?.files[`scenes/${scene}/script.gal`]??'')+'\n// 待恢复的输入';maintenance.queueRecovery(incoming);}
    else if(document){document.files[`scenes/${scene}/script.gal`]+='\n// 外部版本变更';maintenance.queueConflict(incoming);}
  };
  return <>
    {preferencesOpen&&<CandidatePreferencesDialog preferences={personal} onClose={()=>setPreferencesOpen(false)}/>}
    <CandidatePortals session={activeWork?.session??null} theme={seed.ui.theme}/>
    {center&&<><CandidateProjectCenter entries={works.map(work=>({id:work.id,name:work.session?.getSnapshot().project.name??work.seed.presentation.name,dirty:!!remaining(work.session),opened:!!work.session,backup:!!work.backup,path:pathOf(work),pathStatus:work.pathStatus??'available',registered:work.registered,pinned:work.pinned,lastOpenedAt:work.lastOpenedAt}))} theme={preferences.theme}
      listEngineVersions={availableCreationVersions} onOpen={open} onCreate={create} onClose={close} onBackup={id=>setWorks(current=>current.map(work=>work.id===id?{...work,backup:capture(work)}:work))} onRestore={restore} onCheckRestore={checkRestore}
      onRegister={directory=>{const key=candidateDirectoryKey(directory),work=currentWorks.current.find(item=>candidateDirectoryKey(pathOf(item))===key);if(!work||work.pathStatus==='missing')throw new Error('候选宿主未在此目录找到作品。可登记此会话已有作品的完整路径；本机文件打开待桌面宿主接入。');setWorks(current=>current.map(item=>item.id===work.id?{...item,registered:true}:item));}}
      onRemove={id=>setWorks(current=>current.map(work=>work.id===id?{...work,registered:false}:work))} onPin={(id,pinned)=>setWorks(current=>current.map(work=>work.id===id?{...work,pinned}:work))}
      onRepair={(id,directory)=>{const path=uniquePath(directory,id);if(locations.current.get(candidateDirectoryKey(path))!==id)throw new Error('新目录的作品身份不匹配。请定位同一份作品。');setWorks(current=>current.map(work=>work.id===id?{...work,path,pathStatus:'available'}:work));}}
      onReturn={activeWork?.session?()=>setCenter(false):undefined} error={error} onRetry={()=>open(active)} onPreferences={showPreferences}/>
      <details className="gc-candidate candidate-library-audit" data-theme={preferences.theme} open={audit} onToggle={event=>setAudit(event.currentTarget.open)}><summary>审核辅助</summary><p>浏览器宿主投影；目录与备份仅在本实例中验证。</p><CandidateButton onClick={()=>setCreateFailure(true)}>下一次新建失败</CandidateButton><CandidateButton onClick={()=>{if(!activeWork)return;locations.current.delete(candidateDirectoryKey(pathOf(activeWork)));locations.current.set(candidateDirectoryKey(pathOf(activeWork)+'-moved'),activeWork.id);setWorks(current=>current.map(work=>work.id===active?{...work,pathStatus:'missing'}:work));}}>标记当前路径失效</CandidateButton>{activeWork?.pathStatus==='missing'&&<p>审核宿主已将原作品移到 {pathOf(activeWork)}-moved</p>}</details></>}
    {works.filter(work=>work.session).map(work=><div key={work.session!.writeSessionId} hidden={center||active!==work.id}><CandidateContext value={work.session!}><Workspace {...props} projectActive={!center&&active===work.id} preferenceKey={`${props.preferenceKey}:${work.id}`} onProjects={()=>setCenter(true)} onPreferences={showPreferences} maintenance={maintenancePorts.current.get(work.session!)??null} onReviewMaintenance={reviewMaintenance}/></CandidateContext></div>)}
  </>;
}

function CandidatePortals({session,theme}:{session:CandidateSession|null;theme:'light'|'dark'}){
  const current=useSyncExternalStore(session?.subscribe??(()=>()=>{}),()=>session?.getSnapshot().ui.theme??theme);
  return <div id="studio-portals" className="gc-candidate authoring-shell candidate-portals" data-theme={current} lang="zh-CN"/>;
}

type WorkspaceProps = Omit<CandidateStudioProps, 'seed' | 'createServices' | 'hostOptions'> & {onProjects:()=>void;onPreferences:()=>void;projectActive:boolean;maintenance:CandidateMaintenancePort|null;onReviewMaintenance:(action:'recovery'|'conflict'|'failure')=>void};
function Workspace(props: WorkspaceProps) {
  const dock = useRef<DockHandle>(null);
  const store = useCandidate();
  const [resourceViews, setResourceViews] = useState<string[]>([]);
  const [pendingResource, setPendingResource] = useState<string>();
  useEffect(() => { if (pendingResource) { dock.current?.open(pendingResource); setPendingResource(undefined); } }, [pendingResource, resourceViews]);
  const open = useCallback((raw:string) => {
    if(raw==='preferences'){props.onPreferences();return;}
    let id=raw==='characters'?'character-directory':raw==='pages'?'page-directory':raw==='plugin-package'?'plugins':raw==='production-inspector'?'production':raw.startsWith('collaboration-')?'collaboration':raw;
    if(id==='appearances'){const character=store.getSnapshot().project.characters[0];if(character){id=`character:${character.id}`;store.rememberViewState(id+'/mode','composition');}}
    if(id.startsWith('command-stage:')) {
      const sceneId=id.slice(14);store.rememberViewState('stage:mode','runtime');
      if(!store.getSnapshot().ui.pins.stage)store.updateUi(ui=>{if(ui.sceneId!==sceneId){ui.sceneId=sceneId;ui.lineId=store.getSnapshot().project.scenes.find(scene=>scene.id===sceneId)?.lines[0]?.id??'';}});
      else if(store.source('stage').documentId!==sceneId)store.notice('舞台保持已固定的来源；恢复跟随后可预览当前场景。');
      id='stage';
    }
    if (/^page:@(?:style:new:|animations:)/.test(id)) {
      setResourceViews(current => current.includes(id) ? current : [...current, id]);
      setPendingResource(id);
    } else dock.current?.open(id);
  }, [store,props.onPreferences]);
  return <CandidatePluginsProvider onNavigate={open} onProjects={props.onProjects} onCloseView={id => dock.current?.close(id)}><WorkspaceContent {...props} dock={dock} open={open} resourceViews={resourceViews}/></CandidatePluginsProvider>;
}
function WorkspaceContent({ preferenceKey, initialLayout = 'balanced', initialView, showIntegration = false, onProjects,onPreferences,projectActive,maintenance,onReviewMaintenance,dock,open,resourceViews }: WorkspaceProps & {dock:React.RefObject<DockHandle|null>;open:(id:string)=>void;resourceViews:readonly string[]}) {
  const store = useCandidate(), state = useCandidateState(), { project, ui } = state;
  useEffect(()=>store.setProjectActive(projectActive),[store,projectActive]);
  const root = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const [integration, setIntegration] = useState(showIntegration), [query, setQuery] = useState(''), [commandIndex, setCommandIndex] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null), returnRange = useRef<Range | null>(null);
  const commandsId = useId();
  const [commandMode,setCommandMode]=useState<'objects'|'commands'|'all'>('objects');
  const productionStatus = () => [store.tasks.production.draftDirty,store.tasks.production.error,
    store.tasks.production.data.tasks.some(task=>task.items.some(item=>['queued','submitting','running','fetching'].includes(item.state)))].join('|');
  useSyncExternalStore(store.tasks.production.subscribe,productionStatus,productionStatus);
  const hostDocuments = store.host.getSnapshot().documents;
  const tabStatus=(view:string)=>{
    const scene=/^(writing|source|commands|command-stage):(.+)$/.exec(view)?.[2]??(view.startsWith('professional:')?view.split(':')[1]:view==='stage'?store.source('stage').documentId:view==='inspector'?store.inspectorDocument():null);
    const paths=view==='assets'||view==='asset-inspector'||view.startsWith('assets:')?['assets/index.json']:view==='plugins'||view==='plugin-package'?['dependencies.lock.json']:view==='appearances'?['candidate/appearances.json']:view==='pages'?['ui/']:view==='characters'?['characters/']:view==='settings'||view==='publish'?['project.json']:view==='structure'?['project.json','scenes/','variables']:[];
    const pending=state.pendingViews.some(id=>id===view||id.startsWith(view+'/'));
    const objectDocument=view.startsWith('page:')?hostDocuments.find(doc=>Object.entries(doc.files).some(([path,raw])=>path.startsWith('ui/pages/')&&JSON.parse(raw).data.key===view.slice(5)))?.documentId:view.startsWith('character:')?store.documentId(view.slice(10)):undefined;
    const dirty=hostDocuments.some(doc=>doc.dirty&&(scene?(doc.documentId===store.documentId(scene)||Object.keys(doc.files).some(path=>path===`candidate/scenes/${scene}.json`)):objectDocument?doc.documentId===objectDocument||view.startsWith('character:')&&'candidate/appearances.json' in doc.files:view.startsWith('page:@style:')?Object.keys(doc.files).some(path=>path.includes(view.slice(12))):view.startsWith('page:')?Object.keys(doc.files).some(path=>path.startsWith('ui/')||path.startsWith('gallery/')):view.startsWith('plugin-document:')?doc.documentId===view.slice(16):Object.keys(doc.files).some(path=>paths.some(prefix=>path.startsWith(prefix)))));
    const production=view==='production'||view.startsWith('production-');
    return {dirty:pending||dirty||!!scene&&ui.sourceDrafts[scene]!==undefined||production&&store.tasks.production.draftDirty,error:scene?ui.sourceErrors[scene]??(dirty?state.error??undefined:undefined):production?store.tasks.production.error||undefined:dirty?state.error??undefined:undefined,running:view==='stage'?ui.preview.status==='playing':production?store.tasks.production.data.tasks.some(task=>task.items.some(item=>['queued','submitting','running','fetching'].includes(item.state))):false};
  };
  const assets=useMemo(()=>candidateAssets(hostDocuments),[hostDocuments]);
  const template=useMemo(()=>readTemplateDocuments(hostDocuments),[hostDocuments]);
  const professionalCommands=useMemo(()=>new Map<string,string>(project.scenes.flatMap(scene=>{
    const source=store.graphSceneSource(scene.id);
    return source?parse({documentId:source.documentId,revision:source.revision,text:source.text}).cst.flatMap(node=>node.id?[[`professional:${scene.id}:${node.id}`,node.command] as const]:[]):[];
  })),[store,hostDocuments,project.scenes]);
  const pluginViews = useCandidatePluginViews(), closePlugin = useCandidatePluginClose();
  const pluginCommands=useCandidatePluginCommands();
  const viewIds = project.scenes.flatMap(scene => [`writing:${scene.id}`, `source:${scene.id}`,`commands:${scene.id}`]).concat(Object.keys(candidateWorkfaces),project.characters.map(character=>`character:${character.id}`),template.pages.map(page=>`page:${page.key}`),template.styles.map(style=>`page:@style:${style.id}`),['page:@templates','page:@animations','page:gallery-content'],[...new Set([...assets.map(asset=>`assets:${asset.id}`),...state.openViews.filter(id=>id.startsWith('assets:'))])],pluginViews.map(view=>view.id));
  viewIds.push(...professionalCommands.keys());
  viewIds.push(...new Set([...resourceViews, ...state.openViews.filter(id => /^page:@(?:style:|animations:)/.test(id))]));
  const names = Object.fromEntries(Object.entries(candidateWorkfaces).map(([id,view])=>[id,view.title]));
  function title(view: string) { if(view.startsWith('professional:')){const [,sceneId,statementId]=view.split(':');const command=professionalCommands.get(view);return `${project.scenes.find(scene=>scene.id===sceneId)?.name??'场景'} · ${command??'指令'} 专业编辑`;}const match = /^(writing|source|commands|command-stage):(.+)$/.exec(view); return match ? `${project.scenes.find(scene => scene.id === match[2])?.name ?? '场景'} · ${{writing:'文稿',source:'源码',commands:'指令', 'command-stage':'运行舞台'}[match[1]!]}` : view.startsWith('assets:')?`${assets.find(asset=>asset.id===view.slice(7))?.name??'已移除素材'} · 预览`:view.startsWith('character:')?project.characters.find(character=>character.id===view.slice(10))?.name??'已移除角色':view.startsWith('page:')?(template.pages.find(page=>page.key===view.slice(5))?candidatePageTitle(template.pages.find(page=>page.key===view.slice(5))!,store.controller.preferences.locale,template.locales):(candidatePageResourceTitle(view.slice(5),template)??'已移除页面资源')):pluginViews.find(item=>item.id===view)?.title??names[view]??view; }
  const runPreview = () => { const target=ui.pins.stage||state.activeView==='stage'?store.source('stage').documentId:state.commandTarget;const scene=project.scenes.find(scene=>scene.id===target||store.documentId(scene.id)===target);if(!scene){store.notice('请选择一个剧情文档或舞台来源后运行。');return;}const key=`command-stage-playtest:${scene.id}`; store.rememberViewState(key,performance.now()); open(`command-stage:${scene.id}`); };
  const focusedScene=project.scenes.find(scene=>scene.id===state.commandTarget||store.documentId(scene.id)===state.commandTarget);
  const commands: {id:string;label:string;run:()=>void;disabled?:string}[] = [
    ...pluginCommands,
    ...pluginViews.map(view=>({id:view.id,label:`打开插件文档 · ${view.title}`,run:()=>open(view.id)})),
    ...project.scenes.map(scene => ({ id: `writing:${scene.id}`, label: `打开文稿 · ${scene.name}`, run: () => open(`writing:${scene.id}`) })),
    ...project.characters.map(character=>({id:`character:${character.id}`,label:`角色 · ${character.name}`,run:()=>{store.rememberViewState('characters:selected',character.id);store.rememberViewState('characters:selectionRequest',(store.viewState<number>('characters:selectionRequest')??0)+1);open(`character:${character.id}`);store.target(character.id);}})),
    ...assets.map(asset=>({id:`asset:${asset.id}`,label:`素材 · ${asset.name}`,run:()=>open(`assets:${asset.id}`)})),
    ...template.pages.map(page=>({id:`page:${page.key}`,label:`页面 · ${candidatePageTitle(page,store.controller.preferences.locale,template.locales)}`,run:()=>open(`page:${page.key}`)})),
    { id: 'source', label: '打开当前场景源码', disabled:focusedScene?undefined:'先聚焦一个剧情文档',run: () => focusedScene&&open(`source:${focusedScene.id}`) },
    { id:'commands',label:'打开完整指令列表',disabled:focusedScene?undefined:'先聚焦一个剧情文档',run:()=>focusedScene&&open(`commands:${focusedScene.id}`)},
    { id:'command-stage',label:'当前场景运行舞台',disabled:focusedScene?undefined:'先聚焦一个剧情文档',run:()=>focusedScene&&open(`command-stage:${focusedScene.id}`)},
    ...Object.entries(names).filter(([id])=>!['stage','inspector'].includes(id)).map(([id,name])=>({id,label:`打开${name}`,run:()=>open(id)})),
    {id:'projects',label:'打开作品库',run:onProjects},
    {id:'preferences',label:'打开个人偏好 · 编辑器',run:onPreferences},
    { id: 'stage', label: '打开舞台', run: () => open('stage') },
    { id: 'inspector', label: '打开属性', run: () => open('inspector') },
    { id: 'handoff',label:'将当前场景交接给协作',disabled:focusedScene?undefined:'先聚焦一个剧情文档',run:()=>{const source=focusedScene&&store.sceneSource(focusedScene.id);if(source)void store.tasks.handoff(source.documentId,store.editingStatement(focusedScene!.id)??undefined).catch(error=>store.notice(error instanceof Error?error.message:String(error))).finally(()=>open('collaboration'));}},
    { id: 'save', label: '保存当前目标', disabled:state.canSaveCurrent?undefined:'当前焦点没有可保存的文档',run: () => void store.save(false) },
    { id: 'save-all', label: '保存全部修改', run: () => void store.save() },
    { id: 'save-review', label: '审阅待保存修改', run: () => void store.reviewSave() },
    { id: 'undo', label: '撤销当前目标的修改', disabled:state.canUndo?undefined:'当前目标没有可撤销的修改',run: () => void store.undo() },
    { id: 'preview', label: '从舞台来源预览', run: () => { store.preview(); open('stage'); } },
  ];
  const effectiveMode=query.startsWith('>')?'commands':query.startsWith('@')?'objects':commandMode;
  const searchQuery=query.replace(/^[>@]\s*/,'').toLocaleLowerCase(), recent=store.viewState<string[]>('commands:recent')??[];
  const isObject=(id:string)=>/^(writing|character|asset|page|plugin-document):/.test(id);
  const filtered = commands.filter(command => (effectiveMode==='all'||(effectiveMode==='objects')===isObject(command.id))&&command.label.toLocaleLowerCase().includes(searchQuery)).sort((a,b)=>{const ai=recent.indexOf(a.id),bi=recent.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);});
  function runCommand(command:typeof commands[number]){if(command.disabled){store.notice(command.disabled);return;}store.rememberViewState('commands:recent',[command.id,...recent.filter(id=>id!==command.id)].slice(0,12));closeCommands(false);command.run();}
  function openCommands(mode:'objects'|'commands'|'all'='objects') {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selection = document.getSelection(); returnRange.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    setQuery('');setCommandMode(mode); setCommandIndex(0); store.updateUi(ui => { ui.commandOpen = true; });
  }
  function closeCommands(restore = true) {
    store.updateUi(ui => { ui.commandOpen = false; });
    if (restore) requestAnimationFrame(() => {
      returnFocus.current?.focus({ preventScroll: true });
      if (returnRange.current?.startContainer.isConnected) { const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(returnRange.current); }
    });
  }
  useEffect(() => { if (ui.commandOpen) search.current?.focus(); }, [ui.commandOpen]);
  useEffect(() => {
    if (!ui.commandOpen) return;
    const list = root.current?.ownerDocument.getElementById(commandsId);
    const item = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !item) return;
    const frame = list.getBoundingClientRect(), selected = item.getBoundingClientRect();
    if (selected.top < frame.top) list.scrollTop -= frame.top - selected.top;
    else if (selected.bottom > frame.bottom) list.scrollTop += selected.bottom - frame.bottom;
  }, [ui.commandOpen, commandIndex, query, commandMode]);
  function keydown(event: KeyboardEvent<HTMLDivElement> | globalThis.KeyboardEvent) {
    if (('nativeEvent' in event ? event.nativeEvent : event).isComposing || event.defaultPrevented) return;
    const ctrl = event.ctrlKey || event.metaKey, key = event.key.toLowerCase(), native = (event.target as HTMLElement).closest('input,textarea,select,.monaco-editor');
    if (root.current?.ownerDocument.querySelector('dialog:modal')) {
      if (event.key === 'F5' || ctrl && ['s', 'p', 'k'].includes(key)) { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if(state.historyReview||state.saveReview){if(ctrl||event.key==='F5'){event.preventDefault();event.stopPropagation();}return;}
    if(ctrl&&key==='p'){event.preventDefault();event.stopPropagation();openCommands(event.shiftKey?'commands':'objects');}
    else if (ctrl && key === 'k') { event.preventDefault(); event.stopPropagation(); ui.commandOpen ? closeCommands() : openCommands('all'); }
    else if (ctrl && key === 's') { event.preventDefault(); event.stopPropagation(); void store.save(event.shiftKey); }
    else if (event.key === 'F5') { event.preventDefault(); event.stopPropagation(); runPreview(); }
    else if (ui.commandOpen && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCommands(); }
    else if (ctrl && !native && (key === 'z' || key === 'y')) { event.preventDefault(); event.stopPropagation(); key === 'y' || event.shiftKey ? void store.redo() : void store.undo(); }
  }
  const keyboard = useRef(keydown); keyboard.current = keydown;
  useEffect(() => { const element=root.current; if(!element)return; const doc=element.ownerDocument;
    const handle=(event:globalThis.KeyboardEvent)=>{const target=event.target as Node;if(element.closest('[hidden]'))return;const idle=target===doc.body||target===doc.documentElement;const roots=[...doc.querySelectorAll('.gc-candidate.authoring-shell:not(.candidate-portals)')].filter(node=>!node.closest('[hidden]'));if(element.contains(target)||idle&&roots.length===1)keyboard.current(event);};
    doc.addEventListener('keydown',handle,true); return ()=>doc.removeEventListener('keydown',handle,true);
  },[]);
  const taskNavigate=(documentId:string,statementId?:string)=>{const scene=store.controller.source?.scenes.find(scene=>scene.documentId===documentId);if(!scene&&store.host.list().find(document=>document.documentId===documentId&&Object.keys(document.files).some(path=>path.startsWith('ui/pages/')))){const doc=store.host.list().find(document=>document.documentId===documentId)!;const path=Object.keys(doc.files).find(path=>path.startsWith('ui/pages/'))!;const key=JSON.parse(doc.files[path]!).data.key;open('page:'+key);return;}if(scene){if(statementId&&!project.scenes.find(item=>item.id===scene.sceneId)?.lines.some(line=>line.id===statementId)){store.selectCommand(scene.sceneId,statementId);open(`commands:${scene.sceneId}`);}else{if(statementId)store.revealLine(scene.sceneId,statementId);open(`writing:${scene.sceneId}`);}}};
  const renderView = (id: string) => {
    const scene=/^(writing|commands|source):(.+)$/.exec(id);
    if(scene){const mode=scene[1]!,sceneId=scene[2]!;return <CandidateSceneWorkspace sceneId={sceneId} mode={mode} onOpen={open} onCompare={(id,axis)=>dock.current?.open(id,{beside:axis})}>{mode==='writing'?<CandidateWritingView sceneId={sceneId} onOpen={open}/>:mode==='source'?<CandidateSourceView sceneId={sceneId} onOpen={open}/>:<CandidateCommandView sceneId={sceneId} onOpen={open}/>}</CandidateSceneWorkspace>;}
    if(id.startsWith('professional:')){const [,sceneId,statementId]=id.split(':');return <CandidateCommandProfessionalView sceneId={sceneId!} statementId={statementId!} onNavigate={open}/>;}
    if(id.startsWith('character:'))return <CandidateCharactersView characterId={id.slice(10)} viewId={id} onNavigate={open}/>;
    if(id.startsWith('page:'))return <CandidatePagesView pageKey={id.slice(5)} viewId={id} onNavigate={open}/>;




    if(id.startsWith('assets:'))return <CandidateAssetPreviewView assetId={id.slice(7)} active={state.projectActive} onNavigate={open}/>;
    if(id==='plugins'||id==='plugin-package'||id.startsWith('plugin-document:')||id.startsWith('plugin-tool-workspace:'))return <CandidatePluginsView viewId={id}/>;
    if(id==='production'||id.startsWith('production-')||id==='collaboration'||id.startsWith('collaboration-'))return <CandidateTaskPanel viewId={id as TaskPanelId}/>;
    switch(id){
      case 'maintenance':return maintenance?<CandidateMaintenanceView port={maintenance} onProjects={onProjects}/>:null;
      case 'search':return <CandidateSearchView onOpen={open}/>;
      case 'overview':return <CandidateOverviewView onOpen={open}/>;
      case 'problems':return <CandidateAuxiliaryView kind='problems' onOpen={open}/>;
      case 'output':return <CandidateAuxiliaryView kind='output' onOpen={open}/>;
      case 'outline':return <CandidateOutlineView onOpen={open}/>;
      case 'stage':return <CandidateStageWorkspace onOpen={open}/>;
      case 'inspector':return <CandidateObjectInspector onOpen={open}/>;
      case 'appearances':return <CandidateAppearanceView onOpen={open}/>;
      case 'structure':return <CandidateStructureView onOpen={open}/>;
      case 'scene-graph':return <CandidateStorySceneGraph onNavigate={open}/>;
      case 'character-directory':return <CandidateCharacterDirectory onNavigate={open}/>;
      case 'page-directory':return <CandidatePageDirectory onNavigate={open}/>;
      case 'page-outline':return <CandidatePageOutline viewId={state.openViews.find(view=>view.startsWith('page:')&&view===state.activeView)??store.viewState<string>('page:lastActive')??''}/>;
      case 'asset-directory':return <CandidateAssetDirectoryView onNavigate={open}/>;
      case 'characters':return <CandidateCharactersView onNavigate={open}/>;
      case 'pages':return <CandidatePagesView onNavigate={open}/>;
      case 'settings':return <CandidateSettingsView onNavigate={open}/>;
      case 'preferences':return <CandidateSettingsView onNavigate={open} personal/>;
      case 'publish':return <CandidatePublishView onNavigate={open}/>;
      case 'asset-inspector':return <CandidateAssetInspectorView onNavigate={open}/>;
      case 'assets':return <CandidateAssetsView onNavigate={open}/>;
      default:return <p role="status">此工作面已关闭。</p>;
    }
  };
  const targetDocument=store.host.list().find(document=>document.documentId===store.documentId(state.commandTarget));
  const targetPath=Object.keys(targetDocument?.files??{}).find(path=>path.endsWith('.json'));
  const targetData=targetPath?JSON.parse(targetDocument!.files[targetPath]!):null;
  const currentTarget = state.activeView==='preferences'?'个人偏好':!state.commandTarget&&state.activeView.startsWith('production')?'制作草稿':project.scenes.find(scene => scene.id === state.commandTarget||store.documentId(scene.id)===state.commandTarget)?.name ?? project.characters.find(character=>character.id===targetData?.data?.id)?.name ?? targetData?.pluginDocument?.name ?? targetData?.data?.name ?? (targetPath==='project.json'?project.name:targetPath==='assets/index.json'?'素材库':targetPath==='dependencies.lock.json'?'引擎与插件':targetPath??'未选中文档');
  return <CandidateTaskPanelsProvider onOpen={open} onNavigate={taskNavigate}><div ref={root} className="gc-candidate authoring-shell" data-theme={ui.theme} onKeyDownCapture={keydown}>
    <StudioChromeHeader className="candidate-top" searchClassName="candidate-command-anchor"
      brand={<CandidateButton onClick={onProjects}><strong>GalCraft Studio</strong></CandidateButton>}
      project={<CandidateButton onClick={()=>open('overview')} className="candidate-project" title={project.name}><span>{project.name}</span></CandidateButton>}
      context={<span className="candidate-review-label">候选审核</span>}
      search={<><CandidateButton className="candidate-command-trigger" variant="outline" onClick={()=>openCommands('objects')}><Search size={14}/>查找对象<kbd>Ctrl P</kbd></CandidateButton>
        {ui.commandOpen && <div className="candidate-command-menu"><div className="candidate-command-modes" aria-label="搜索模式"><CandidateButton aria-pressed={effectiveMode==='objects'} onClick={()=>{setCommandMode('objects');setQuery('');setCommandIndex(0);search.current?.focus();}}>对象</CandidateButton><CandidateButton aria-pressed={effectiveMode==='commands'} onClick={()=>{setCommandMode('commands');setQuery('');setCommandIndex(0);search.current?.focus();}}>命令</CandidateButton><small>使用 &gt; 查命令，@ 查对象</small></div><CandidateInput ref={search} aria-label={effectiveMode==='objects'?'搜索作品对象':'搜索候选命令'} role="combobox" aria-expanded="true" aria-controls={commandsId} aria-activedescendant={filtered[commandIndex] ? `${commandsId}-${filtered[commandIndex]!.id}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setCommandIndex(0); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setCommandIndex(index => filtered.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length : 0); }
          if (event.key === 'Enter' && filtered[commandIndex]) { event.preventDefault(); runCommand(filtered[commandIndex]!); }
        }}/><div id={commandsId} role="listbox" aria-label="候选命令">{filtered.map((command, index) => <CandidateButton id={`${commandsId}-${command.id}`} key={command.id} role="option" tabIndex={-1} aria-selected={index === commandIndex} aria-disabled={!!command.disabled} title={command.disabled} onClick={() => runCommand(command)}><span>{command.label}</span><small>{command.disabled??(recent.includes(command.id)?'最近使用':'')}</small></CandidateButton>)}{!filtered.length && <p>没有匹配结果</p>}</div></div>}
      </>}
      actions={<><CandidateButton onClick={onPreferences}>个人偏好</CandidateButton><CandidateIconButton label={ui.theme === 'light' ? '切换深色' : '切换浅色'} onClick={() => void store.updatePreferences(preferences => { preferences.theme = preferences.theme === 'light' ? 'dark' : 'light'; })}>{ui.theme === 'light' ? <Moon size={15}/> : <Sun size={15}/>}</CandidateIconButton><CandidateIconButton label="集成说明" aria-pressed={integration} onClick={() => setIntegration(value => !value)}><Info size={15}/></CandidateIconButton></>}
    />
    <StudioChromeToolbar className="candidate-toolbar gc-candidate-tools" label="工作台命令"
      workfaces={<CandidateMenuButton label="工作面" actions={[[`writing:${ui.sceneId}`,'当前场景文稿'],[`commands:${ui.sceneId}`,'当前场景指令'],[`source:${ui.sceneId}`,'当前场景源码'],...Object.entries(names)].map(([id,label])=>({id:id!,label:label!,run:()=>open(id!)}))}><LayoutPanelLeft size={15}/>工作面</CandidateMenuButton>}
      routes={<StudioChromeToolGroup className="candidate-toolbar-group">{[['制作','production'],['协作','collaboration'],['插件','plugins'],['发布','publish']].map(([name,id])=><CandidateButton key={id} onClick={()=>open(id!)}>{name}</CandidateButton>)}</StudioChromeToolGroup>}
      history={<StudioChromeToolGroup className="candidate-toolbar-group"><CandidateIconButton label="撤销当前目标" title={`撤销 · ${currentTarget}`} disabled={!state.canUndo||state.activeView==='preferences'} onClick={() => void store.undo()}><Undo2 size={14}/></CandidateIconButton><CandidateIconButton label="重做当前目标" disabled={!state.canRedo||state.activeView==='preferences'} onClick={() => void store.redo()}><Redo2 size={14}/></CandidateIconButton></StudioChromeToolGroup>}
      layout={<CandidateMenuButton label="工作台布局" actions={[
        ...([['balanced','默认工作区'],['writing','专注写作'],['source','文稿与源码'],['documents','两个文档并排'],['stage','舞台主导']] as const).map(([id,label])=>({id,label,run:()=>dock.current?.preset(id)})),
        {id:'save-layout',label:'保存布局',separatorBefore:true,run:()=>dock.current?.savePreset('我的候选布局')},
        {id:'restore-layout',label:'恢复布局',run:()=>dock.current?.restorePreset('我的候选布局')}
      ]}>布局</CandidateMenuButton>}
      save={<StudioChromeToolGroup className="candidate-toolbar-group candidate-save-actions" split><CandidateButton variant="outline" disabled={state.saving||!state.canSaveCurrent} title="Ctrl+S · 当前目标及必要关联" onClick={()=>void store.save(false)}><Save size={14}/>{state.saving?'保存中…':'保存'}</CandidateButton><CandidateMenuButton label="保存选项" actions={[
        {id:'save-all',label:'保存全部',shortcut:'Ctrl Shift S',disabledReason:state.saving?'正在保存，请稍候':undefined,run:()=>void store.save()},
        {id:'save-review',label:'保存审阅',disabledReason:state.saving?'正在保存，请稍候':undefined,run:()=>void store.reviewSave()}
      ]}/></StudioChromeToolGroup>}
      preview={<CandidateButton variant="primary" onClick={runPreview}><Play size={14}/>运行预览</CandidateButton>}
    />
    {state.historyReview&&<CandidateHistoryDialog plan={state.historyReview} onConfirm={accepted=>store.confirmHistory(accepted)}/>}
    {state.saveReview&&<CandidateSaveReview initialPlan={state.saveReview.plan} initialDocuments={state.saveReview.documents} scope={state.saveReview.scope} locale={store.controller.preferences.locale} bridge={store.services.bridge.documents} names={Object.fromEntries(project.scenes.map(scene=>[store.documentId(scene.id),scene.name]))} close={()=>store.closeSaveReview()} save={async plan=>{if(!await store.savePlan(plan))throw new Error('保存未完成，工作内容已保留。请刷新范围或重试。');}} changed={async(receipt,documentId)=>{await store.controller.acceptExternalEdit(receipt,documentId);store.refreshFromHost();}}/>}
    {state.error && <div className="candidate-save-error" role="alert">保存失败：{state.error}<CandidateButton onClick={() => void store.retrySave()}>重试保存</CandidateButton></div>}
    {integration && <aside className="candidate-integration" aria-label="集成状态"><CandidateButton className="candidate-close" aria-label="关闭集成说明" onClick={() => setIntegration(false)}><X size={14}/></CandidateButton><strong>完整候选 · 现行能力与 R0 装配</strong><p>已接：项目与文档会话、完整指令、制作与协作、角色、素材、页面、设置、插件与发布检查；共同经过文档宿主。正式编译 → MiniStage → Player，句内构图 → StageController。</p><p>候选承担：句内事件／构图扩展、停靠会话与命令协调。确定性宿主承担：内存保存与恢复、制作生成、协作调用、资源派生、安装与构建回执。正式磁盘、外部服务、Electron 和 Player 句内时序另行集成。</p><CandidateButton onClick={() => { store.host.failNextSave('审核宿主暂时不可写；内容已保留。'); store.notice('下一次保存将失败一次，之后可直接重试。'); }}>让下一次保存失败</CandidateButton><CandidateButton onClick={()=>{onReviewMaintenance('recovery');open('maintenance');}}>准备崩溃草稿审核输入</CandidateButton><CandidateButton onClick={()=>{onReviewMaintenance('conflict');open('maintenance');}}>准备外部冲突审核输入</CandidateButton><CandidateButton onClick={()=>onReviewMaintenance('failure')}>下一次迁移提交失败</CandidateButton><span>文档 {store.host.list().length} · 打开视图 {state.openViews.length} · 命令目标：{currentTarget}</span></aside>}
    <main className="candidate-body">
      {!state.ready ? <section className="candidate-empty" role="status">{state.error ?? '正在打开审核作品…'}</section> : <CandidateDockWorkspace ref={dock} initial={initialLayout} initialView={initialView} sceneId={ui.sceneId} sceneIds={project.scenes.map(scene => scene.id)} viewIds={viewIds} storageKey={`galcraft-candidate:${preferenceKey}`} title={title} icon={workfaceIcon} status={tabStatus} zone={id=>candidateWorkfaces[id]?.zone??'center'} role={id=>candidateWorkfaces[id]?.role??(id.startsWith('command-stage:')?'preview':'document')} renderView={renderView} onActivate={id => {if((candidateWorkfaces[id]?.zone??'center')==='center')store.rememberViewState('search:editorOrigin',id);if(/^(writing|source|commands|professional):/.test(id))store.rememberViewState('script:editorOrigin',id);if(/^(writing|source|commands|page|character):/.test(id))store.rememberViewState('overview:lastObject',id);store.activateView(id);}} onBeforeClose={ids=>store.canCloseViews(ids)} onClose={id => (id.startsWith('plugin-document:')||id.startsWith('plugin-tool-workspace:'))?closePlugin(id):store.closeView(id)} onRestoreStageSource={sceneId=>{store.rememberViewState('stage:mode','runtime');store.updateUi(ui=>{ui.pins.stage={kind:'line',documentId:sceneId,id:store.getSnapshot().project.scenes.find(scene=>scene.id===sceneId)?.lines[0]?.id??''};});}} onViewsChange={ids => store.viewsChanged(ids)} notice={message => store.notice(message)}/>}
    </main><footer className="candidate-status"><span role="status">{ui.notice || '审核作品已打开'}</span><span title={`命令目标：${currentTarget}`}>{currentTarget}</span><span>{state.pendingViews.length?'有未应用的字段草稿':Object.keys(ui.sourceErrors).length ? `源码草稿问题 ${Object.keys(ui.sourceErrors).length}` : state.dirty ? '未保存' : '已保存到审核内存'}</span><span>UTF-8</span></footer>
  </div></CandidateTaskPanelsProvider>;
}
