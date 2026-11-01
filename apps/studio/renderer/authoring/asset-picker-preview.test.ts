import { afterEach, expect, test, vi } from 'vitest';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import type { AuthoringServices } from './controller.js';
import { createAssetPickerPreview } from './asset-picker-preview.js';

class Element {
  children: Element[] = []; dataset: Record<string,string> = {}; attributes: Record<string,string> = {}; textContent=''; className='';
  parent: Element | null=null; src=''; alt=''; onclick?:()=>void;
  events=new Map<string,()=>void>();
  append(...nodes:Element[]){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
  replaceChildren(){for(const child of this.children)child.parent=null;this.children=[];}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
  setAttribute(key:string,value:string){this.attributes[key]=value;}
  addEventListener(key:string,callback:()=>void){this.events.set(key,callback);}
}
class Image extends Element {}
class Media extends Element {pause(){}load(){}}
function setup() {
  vi.stubGlobal('document',{createElement:(tag:string)=>tag==='img'?new Image():new Element()});
  vi.stubGlobal('HTMLImageElement',Image);vi.stubGlobal('HTMLMediaElement',Media);
  const root=new Element(),resolve=vi.fn(),release=vi.fn(async(_leaseId:string)=>({ok:true,value:undefined,warnings:[]}));
  const services={runtimeAssets:{resolveRuntime:resolve,releaseRuntime:release}} as unknown as AuthoringServices;
  const preview=createAssetPickerPreview(root as unknown as HTMLElement,services);
  return {root,resolve,release,preview};
}
const asset=()=>structuredClone(FixtureAsset);
const resource=(leaseId:string)=>({ok:true,value:{leaseId,uri:`https://media.test/${leaseId}.png`},warnings:[]});
afterEach(()=>vi.unstubAllGlobals());

test('late selection releases its exact lease and cannot replace the current image',async()=>{
  const {root,resolve,release,preview}=setup();
  let first!:(value:unknown)=>void;
  resolve.mockImplementationOnce(()=>new Promise(done=>{first=done;})).mockResolvedValueOnce(resource('current'));
  const before=preview.preview(asset(),null),next=asset();next.name='Second image';
  await preview.preview(next,next.activeVariantId);
  first(resource('late'));await before;
  expect(root.children.filter(child=>child instanceof Image).map(child=>child.src)).toEqual(['https://media.test/current.png']);
  expect(release).toHaveBeenCalledWith('late');
  preview.dispose();preview.dispose();expect(release.mock.calls.map(call=>call[0])).toEqual(['late','current']);
});

test('failed media retains the exact identity and retries without another selection or theme redraw',async()=>{
  const {root,resolve,release,preview}=setup(),value=asset();
  resolve.mockResolvedValueOnce(resource('failed')).mockResolvedValueOnce(resource('retry'));
  await preview.preview(value,value.activeVariantId);
  root.children.find(child=>child instanceof Image)!.events.get('error')!();
  expect(release).toHaveBeenCalledWith('failed');expect(root.attributes['aria-busy']).toBe('false');
  expect(root.children.some(child=>child.attributes.role==='alert')).toBe(true);
  root.children.find(child=>child.onclick)!.onclick!();
  await vi.waitFor(()=>expect(root.children.some(child=>child.src.endsWith('/retry.png'))).toBe(true));
  expect(resolve.mock.calls).toEqual([[value.id,value.activeVariantId],[value.id,value.activeVariantId]]);
  root.children.find(child=>child instanceof Image)!.events.get('load')!();
  expect(root.attributes['aria-busy']).toBe('false');expect(root.children.some(child=>child.attributes.role==='alert')).toBe(false);
  preview.dispose();expect(release).toHaveBeenCalledTimes(2);
});

test('a missing pinned version is reported without resolving the active version',async()=>{
  const {root,resolve,preview}=setup();await preview.preview(asset(),'missing');
  expect(resolve).not.toHaveBeenCalled();expect(root.children.some(child=>child.textContent==='引用版本缺失')).toBe(true);
  preview.dispose();
});
