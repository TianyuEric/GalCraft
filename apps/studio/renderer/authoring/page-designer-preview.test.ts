import { afterEach, expect, test, vi } from 'vitest';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';

const calls=vi.hoisted(()=>[] as {root:Element;resolve:(player:unknown)=>void}[]);
vi.mock('./player-preview.js',()=>({openPlayerPreview:vi.fn((root:Element)=>new Promise(resolve=>calls.push({root,resolve})))}));
vi.mock('monaco-editor',()=>({}));
vi.mock('../components/monaco-workers.js',()=>({configureMonacoWorkers:()=>{}}));
vi.mock('./asset-picker.js',()=>({openAssetPicker:()=>{}}));
vi.mock('@galcraft/templates',async importOriginal=>({...await importOriginal<typeof import('@galcraft/templates')>(),PreviewGeometry:class {subscribe(){}dispose(){}read(){return null;}}}));
import { PageDesigner } from './page-designer.js';

class Element {
  children:Element[]=[];parentElement:Element|null=null;style:Record<string,string>={};dataset:Record<string,string>={};
  clientWidth=1920;textContent='';className='';
  append(...children:Element[]){this.children.push(...children);for(const child of children)child.parentElement=this;}
  setAttribute(){}
  querySelector(selector:string):Element|null{return this.children.find(child=>selector==='.'+child.className)??null;}
  replaceChildren(...children:Element[]){for(const child of this.children)child.parentElement=null;this.children=children;for(const child of children)child.parentElement=this;}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
  querySelectorAll(){return [];}
  getBoundingClientRect(){return{left:0,top:0,width:1920,height:1080};}
}
function setup(){
  vi.stubGlobal('document',{createElement:()=>new Element()});vi.stubGlobal('HTMLDialogElement',class {});
  vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  const surface=new Element(),canvas=new Element();canvas.parentElement=new Element();
  return Object.assign(Object.create(PageDesigner.prototype),{disposed:false,generation:0,previewQueue:Promise.resolve(),previewMounts:0,page:'title',sample:'normal',state:'normal',zoom:'fit',snapshot:structuredClone(FixtureSnapshot),template:structuredClone(FixtureSnapshot.template),documents:[],selected:new Set(),surface,canvas,inspector:new Element(),overlay:new Element(),notice:new Element(),services:{},geometry:null,player:null,resize:null}) as {
    preview():Promise<void>;page:string;player:unknown;surface:Element;notice:Element;
  };
}
function player(root:Element,newGame=async()=>{}){
  const marker=new Element();root.replaceChildren(marker);
  return {view:{newGame,stageElement:new Element(),navigation:{replace:vi.fn()}},data:{current:()=>({preferences:{menuLocale:FixtureSnapshot.project.languages.menuDefault}})},stage:{setViewport:vi.fn()},setPreviewMuted:vi.fn(),updatePreview:vi.fn(()=>({ok:true,value:undefined,warnings:[]})),session:{inspect:()=>null},dispose:vi.fn(()=>root.replaceChildren())};
}
afterEach(()=>{calls.length=0;vi.unstubAllGlobals();});
test('a late mount disposal clears its own root and preserves the current Player',async()=>{
  const designer=setup(),first=designer.preview();await vi.waitFor(()=>expect(calls).toHaveLength(1));
  const second=designer.preview();
  const late=player(calls[0]!.root);calls[0]!.resolve(late);await first;
  await vi.waitFor(()=>expect(calls).toHaveLength(2));
  expect(calls[0]!.root).not.toBe(calls[1]!.root);
  const current=player(calls[1]!.root);calls[1]!.resolve(current);await second;
  expect(late.dispose).toHaveBeenCalledOnce();expect(current.dispose).not.toHaveBeenCalled();
  expect(designer.player).toBe(current);expect(designer.surface.children).toEqual([calls[1]!.root]);
  expect(calls[1]!.root.children).toHaveLength(1);expect(designer.surface.dataset.previewStatus).toBe('ready');
});
test('a replaced preview finishes its pending newGame before disposal and cannot publish over the new page',async()=>{
  const designer=setup();designer.page='story';const first=designer.preview();
  await vi.waitFor(()=>expect(calls).toHaveLength(1));
  let finishGame!:()=>void;const started=vi.fn(()=>new Promise<void>(resolve=>{finishGame=resolve;}));
  const old=player(calls[0]!.root,started);calls[0]!.resolve(old);await vi.waitFor(()=>expect(started).toHaveBeenCalledOnce());
  designer.page='title';const second=designer.preview();
  expect(old.dispose).not.toHaveBeenCalled();expect(calls).toHaveLength(1);finishGame();await first;
  await vi.waitFor(()=>expect(calls).toHaveLength(2));const current=player(calls[1]!.root);calls[1]!.resolve(current);await second;
  expect(old.dispose).toHaveBeenCalledOnce();expect(old.view.navigation.replace).not.toHaveBeenCalled();
  expect(current.view.navigation.replace).toHaveBeenCalledWith('title');expect(designer.player).toBe(current);
  expect(designer.surface.children).toEqual([calls[1]!.root]);expect(designer.notice.textContent).toBe('');
});
test('ready page navigation updates the existing Player and keeps its mount',async()=>{
  const designer=setup(),first=designer.preview();await vi.waitFor(()=>expect(calls).toHaveLength(1));
  const current=player(calls[0]!.root);calls[0]!.resolve(current);await first;
  designer.page='settings';await designer.preview();
  expect(calls).toHaveLength(1);expect(current.updatePreview).toHaveBeenCalledOnce();
  expect(current.view.navigation.replace).toHaveBeenLastCalledWith('settings');expect(current.dispose).not.toHaveBeenCalled();
  expect(designer.surface.children).toEqual([calls[0]!.root]);expect(designer.surface.dataset.previewMounts).toBe('1');
});
