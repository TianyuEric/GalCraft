import {afterAll,afterEach,beforeAll,beforeEach,describe,it,expect} from 'vitest';
import type {Vite} from 'vitest/node';
import {chromium,type Browser,type Page} from 'playwright';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {scaledBorders} from './template-images.js';
describe('template image scaling',()=>{
 it('scales design borders with the stage',()=>expect(scaledBorders({top:20,right:10,bottom:20,left:10},.5,400,200)).toEqual({top:10,right:5,bottom:10,left:5}));
 it('shrinks all sides together for narrow targets',()=>expect(scaledBorders({top:20,right:10,bottom:20,left:10},1,10,100)).toEqual({top:10,right:5,bottom:10,left:5}));
});

describe('template image presentation readiness',()=>{
 let browser:Browser,page:Page,bundle:string,css:string;
 beforeAll(async()=>{
  css=await readFile(new URL('./player.css',import.meta.url),'utf8');
  const vite=await import(pathToFileURL(createRequire(import.meta.resolve('vitest/package.json')).resolve('vite')).href) as typeof Vite;
  const entry=fileURLToPath(new URL('./template-images-test-entry.tsx',import.meta.url));
  const result=await vite.build({configFile:false,logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'template-image-test-entry',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
   import {createElement} from 'react';
   import {createRoot} from 'react-dom/client';
   import {createBasicComponent} from '@galcraft/templates/editor';
   import {TemplateImages} from './template-images.js';
   import {ResourceImage} from './resource-image.js';
   import {holdPlayerVisual,waitForPresentedMedia} from './visual-handoff.js';
   const root=document.createElement('div'),mount=document.createElement('div');root.className='galcraft-player';
   root.innerHTML='<button data-gc-part="target" data-gc-state="normal">Target</button><div class="gc-visual-hold"><button data-gc-part="held" data-gc-state="normal">Held</button></div>';
   document.body.append(root,mount);
   const target=root.querySelector('button'),requests=new Map(),decodes=new Map(),releases=[];
   const binding=assetId=>({assetId,variantId:'original',mode:'stretch',opacity:1,positionX:.5,positionY:.5});
   const config=createBasicComponent('button');config.part='target';config.normal.images={frame:binding('normal')};config.states.hover={images:{frame:binding('hover')}};config.states.disabled={images:{frame:null}};config.states.selected={images:{frame:binding('selected')}};
   const held=createBasicComponent('button');held.normal.images={frame:binding('held')};
   const host={resources:{resolve:assetId=>new Promise(resolve=>{requests.set(assetId,[...(requests.get(assetId)??[]),resolve]);})}};
   HTMLImageElement.prototype.decode=function(){return new Promise(resolve=>decodes.set(this,resolve));};
   const images=createRoot(mount);images.render(createElement(TemplateImages,{root,host,part:key=>key==='target'?config:held,sequence:1,scale:1}));
   let ready=false,holding,background;
   globalThis.fixture={root,target,requests,decodes,releases,
    hold:()=>{holding=holdPlayerVisual(root,document.createElement('canvas'));},
    releaseHold:()=>holding.release(),
    dispose:()=>{images.unmount();background?.unmount();},
    mountBackground:()=>{const container=document.createElement('div');container.className='test-background';root.append(container);background=createRoot(container);background.render(createElement(ResourceImage,{host,asset:{assetId:'background',variantId:'original'},alt:''}));},
    backgroundLoaded:()=>decodes.has(root.querySelector('.test-background img')),
    decodeBackground:()=>decodes.get(root.querySelector('.test-background img'))(),
    media:()=>[...root.querySelectorAll('[data-gc-media-status]')].filter(element=>!element.closest('[hidden],.gc-visual-hold')),
    start:()=>{ready=false;void waitForPresentedMedia([root],new AbortController().signal).then(()=>{ready=true;});},
    ready:()=>ready,
    resolve:assetId=>{for(const resolve of requests.get(assetId)??[])resolve({ok:true,value:{uri:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>',release(){releases.push(assetId);}}});},
    loaded:()=>decodes.has(target.querySelector('[data-gc-image-state]:not([hidden]) img')),
    decode:()=>{const image=target.querySelector('[data-gc-image-state]:not([hidden]) img');decodes.get(image)();return {complete:image.complete,width:image.naturalWidth};}
   };
  `:undefined}],build:{write:false,minify:false,lib:{entry,formats:['iife'],name:'TemplateImageTest'}}});
  const output=Array.isArray(result)?result[0]:result;
  if(!output||!('output' in output))throw new Error('Template image test bundle unavailable');
  const script=output.output.find(chunk=>chunk.type==='chunk');
  if(!script||script.type!=='chunk')throw new Error('Template image test script unavailable');
  bundle=script.code;browser=await chromium.launch({channel:'msedge',headless:true});
 },30_000);
 beforeEach(async()=>{page=await browser.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setContent('<!doctype html><html><body></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.waitForFunction('fixture.requests.has("hover")',{},{timeout:2_000});expect(errors).toEqual([]);});
 afterEach(async()=>{await page?.close();});
 afterAll(async()=>{await browser?.close();});

 it('keeps unresolved current images observable and waits for their mounted decode without waiting for hover',async()=>{
  expect(await page.evaluate('fixture.media().map(element=>({status:element.dataset.gcMediaStatus,hidden:element.hidden,visibility:element.style.visibility}))')).toEqual([{status:'pending',hidden:false,visibility:'hidden'}]);
  expect(await page.evaluate('fixture.requests.has("held")')).toBe(false);
  await page.evaluate('fixture.start()');
  await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  expect(await page.evaluate('fixture.ready()')).toBe(false);
  expect(await page.evaluate('fixture.root.querySelector("img")')).toBeNull();
  await page.evaluate('fixture.resolve("normal")');await page.waitForFunction('fixture.loaded()');
  expect(await page.evaluate('fixture.ready()')).toBe(false);
  expect(await page.evaluate('fixture.decode()')).toEqual({complete:true,width:2});
  await page.waitForFunction('fixture.ready()');
  expect(await page.evaluate('fixture.target.querySelector("[data-gc-image-state=hover] [data-gc-media-status]").dataset.gcMediaStatus')).toBe('pending');
  expect(await page.evaluate('fixture.media().map(element=>element.dataset.gcMediaStatus)')).toEqual(['ready']);
 });

 it('makes the newly active state required while an explicitly empty state remains nonblocking',async()=>{
  await page.evaluate('fixture.target.dataset.gcState="hover"');
  await page.waitForFunction('!fixture.target.querySelector("[data-gc-image-state=hover]").hidden');
  await page.evaluate('fixture.start()');
  await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  expect(await page.evaluate('fixture.ready()')).toBe(false);
  await page.evaluate('fixture.resolve("hover")');await page.waitForFunction('fixture.loaded()');
  await page.evaluate('fixture.decode()');await page.waitForFunction('fixture.ready()');
  await page.evaluate('fixture.target.dataset.gcState="disabled"');
  await page.waitForFunction('!fixture.target.querySelector("[data-gc-image-state=disabled]").hidden');
  expect(await page.evaluate('fixture.media().length')).toBe(0);
  await page.evaluate('fixture.start()');await page.waitForFunction('fixture.ready()');
 });

 it.each([['selected','selected'],['locked','normal'],['empty','normal']])('presents %s images with authored overrides and normal fallbacks',async(state,asset)=>{
  await page.evaluate(value=>{(globalThis as any).fixture.target.dataset.gcState=value;},state);
  await page.waitForFunction(value=>!(globalThis as any).fixture.target.querySelector(`[data-gc-image-state=${value}]`).hidden,state);
  await page.evaluate('fixture.start()');
  expect(await page.evaluate('fixture.media().map(element=>element.dataset.gcMediaStatus)')).toEqual(['pending']);
  await page.evaluate(value=>(globalThis as any).fixture.resolve(value),asset);await page.waitForFunction('fixture.loaded()');
  expect(await page.evaluate('fixture.ready()')).toBe(false);
  await page.evaluate('fixture.decode()');await page.waitForFunction('fixture.ready()');
  expect(await page.evaluate('fixture.media().map(element=>element.dataset.gcMediaStatus)')).toEqual(['ready']);
  expect(await page.evaluate(value=>getComputedStyle((globalThis as any).fixture.target.querySelector(`[data-gc-image-state=${value}]`)).display,state)).toBe('contents');
 });

 it('finishes a ready handoff while the reading page continues updating text each frame',async()=>{
  await page.evaluate('fixture.resolve("normal")');await page.waitForFunction('fixture.loaded()');
  await page.evaluate('fixture.decode()');
  await page.evaluate(()=>{const fixture=(globalThis as any).fixture,counter=document.createElement('span');fixture.target.append(counter);let frame=0,count=0;const tick=()=>{counter.textContent=String(++count);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);fixture.stopAnimation=()=>cancelAnimationFrame(frame);fixture.start();});
  await page.waitForFunction('fixture.ready()',undefined,{timeout:2000});
  await page.evaluate('fixture.stopAnimation()');
 });

 it.each(['page','copy'])('keeps image URLs leased until both the page and transition copy are removed (%s first)',async(first)=>{
  await page.evaluate('fixture.mountBackground()');await page.waitForFunction('fixture.requests.has("background")');
  await page.evaluate('fixture.resolve("background")');await page.waitForFunction('fixture.backgroundLoaded()');
  await page.evaluate('fixture.decodeBackground()');
  await page.evaluate('fixture.resolve("normal")');await page.waitForFunction('fixture.loaded()');
  await page.evaluate('fixture.decode()');
  const expected=await page.evaluate<number>('fixture.requests.get("normal").length');
  await page.evaluate('fixture.hold()');
  expect(await page.locator('.gc-visual-hold [data-gc-image]').count()).toBeGreaterThan(0);
  await page.evaluate(value=>(globalThis as any).fixture[value==='page'?'dispose':'releaseHold'](),first);
  expect(await page.evaluate('fixture.releases')).toEqual([]);
  await page.evaluate(value=>(globalThis as any).fixture[value==='page'?'releaseHold':'dispose'](),first);
  expect(await page.evaluate('fixture.releases.filter(value=>value==="normal")')).toEqual(Array(expected).fill('normal'));
  expect(await page.evaluate('fixture.releases.filter(value=>value==="background")')).toEqual(['background']);
  await page.evaluate('fixture.releaseHold()');
  expect(await page.evaluate('fixture.releases.length')).toBe(expected+1);
  await page.evaluate('fixture.resolve("hover")');
  await page.waitForFunction('fixture.releases.includes("hover")');
 });
});
