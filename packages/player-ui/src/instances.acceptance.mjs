import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)('playwright');
const output=resolve('test-results/latest/workflow/wf4-player-instances');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}}),checks=[],errors=[],failures=[];
page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE ERROR',error.message);});page.setDefaultTimeout(10000);
const visit=async(story,key=story)=>{await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-player-pages--${story}&viewMode=story`);await page.locator(`[data-player-ready="${key}"]`).waitFor({timeout:45000});await page.locator('[data-gc-instance-rendered="true"]').first().waitFor();await page.waitForFunction(()=>{const r=document.querySelector('.gc-canvas')?.getBoundingClientRect();return r&&r.width>0&&r.height>0&&Math.abs(r.width/r.height-16/9)<.01;});await page.locator('.gc-canvas').evaluate(canvas=>Promise.all(canvas.getAnimations({subtree:true}).filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))));};
try{
  if(!process.argv.includes('--basic')){for(const [story,key] of [['reading','story'],['settings','settings'],['save','save'],['choice','choice'],['input','input'],['unlocked-gallery','cg'],['unlocked-music','music'],['flow-night','flow'],['characters','characters'],['confirm','confirm'],['data-clear','dataClear'],['data-import','dataImport']]){
    console.log('CHECK',story);try{await visit(story,key);await page.screenshot({path:resolve(output,`${story}.png`)});
    const geometry=await page.locator('.gc-canvas').evaluate(canvas=>{const rect=canvas.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height,instances:canvas.querySelectorAll('[data-gc-instance-rendered]').length};});
    assert(Math.abs(geometry.width/geometry.height-16/9)<.01);checks.push({story,geometry});
    if(story==='reading'){const panel=await page.locator('[data-gc-part="story.readingPanel"]').boundingBox();assert(panel&&panel.y>300&&panel.y+panel.height<=721);}
    if(story==='settings'){const preview=await page.locator('[data-gc-part="settings.preview"]').boundingBox();assert(preview&&preview.width>800&&preview.height>100);const slider=page.locator('input[type="range"]').first(),before=await slider.inputValue();await slider.focus();await page.keyboard.press('ArrowRight');assert.notEqual(await slider.inputValue(),before);await page.locator('[data-gc-part="settings.categories.item"]').filter({hasText:'资料'}).click();await page.locator('[data-gc-part="settings.dataImport"]').click();await page.locator('.gc-portal[data-page="dataImport"] [role="dialog"]').waitFor();await page.keyboard.press('Escape');await page.locator('[data-gc-part="settings.dataImport"]').waitFor();checks.push('Settings native slider persists and data import returns to its source page');}
    if(story==='save'){const slots=page.locator('[data-gc-part="save.grid.slot"]');assert.equal(await slots.count(),12);assert.equal(new Set(await slots.evaluateAll(elements=>elements.map(element=>element.dataset.gcInstance))).size,12);}
    if(story==='input'){const field=page.locator('[data-gc-part="input.field"]');await field.fill('一封新的信');assert.equal(await field.inputValue(),'一封新的信');}
    if(story==='unlocked-gallery'){const cards=page.locator('[data-gc-part="cg.grid.item"]');assert((await cards.count())>1);await cards.first().dblclick();await page.locator('[data-gc-part="cg.viewer.image"] img').waitFor();await page.screenshot({path:resolve(output,'gallery-viewer.png')});await page.locator('[data-gc-part="cg.viewer.back"]').click();await page.locator('[data-gc-part="cg.viewer"]').waitFor({state:'detached'});checks.push('Gallery records open and close the real image viewer');}
    }catch(error){console.error('FAILED',story,error.message);failures.push({story,message:error.message});await page.screenshot({path:resolve(output,`${story}-failure.png`)});}
  }
  await visit('reading','story');for(const viewport of [{width:1600,height:1000},{width:900,height:800}]){await page.setViewportSize(viewport);await page.screenshot({path:resolve(output,`reading-${viewport.width}x${viewport.height}.png`)});const size=await page.locator('.gc-canvas').boundingBox();assert(size&&Math.abs(size.width/size.height-16/9)<.01);checks.push({viewport,canvas:size});}
  }else await visit('reading','story');
  const modules=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name)),react=modules.find(url=>/\/react\.js\?/.test(url)),dom=modules.find(url=>/\/react-dom_client\.js\?/.test(url));assert(react&&dom);
  await page.setViewportSize({width:1280,height:900});await page.goto('http://127.0.0.1:6007/iframe.html');
  const workspace=fileURLToPath(new URL('../../../',import.meta.url)).replaceAll('\\','/');
  await page.evaluate(async({react,dom,workspace})=>{
    const React=(await import(react)).default,domModule=await import(dom),createRoot=domModule.createRoot??domModule.default.createRoot,{ComponentInstances}=await import(`/@fs/${workspace}packages/player-ui/src/instance-renderer.tsx`),{createBasicComponent}=await import(`/@fs/${workspace}packages/templates/dist/editor.js`);
    const root=createBasicComponent('container');root.layout={...root.layout,position:'flow',mode:'grid',columns:3,gap:24,padding:{top:24,right:24,bottom:24,left:24}};
    const kinds=['container','text','image','button','decoration','input','slider','toggle','select','tabs','list'];
    root.children=kinds.map(kind=>{const component=createBasicComponent(kind);component.layout={...component.layout,position:'flow',width:{unit:'percent',value:100},height:{unit:'px',value:kind==='tabs'||kind==='list'?240:96}};component.name=kind;return component;});
    const byKind=kind=>root.children.find(component=>component.part===`basic.${kind}`);
    for(const kind of ['input','slider','toggle','select','tabs'])byKind(kind).bindings={value:{source:'local',path:kind}};
    byKind('text').bindings={text:{source:'local',path:'input'}};byKind('select').options=[{value:'a',label:'First selection'},{value:'b',label:'Second selection'}];
    const tabs=byKind('tabs');tabs.options=[{value:'first',label:'First tab'},{value:'second',label:'Second tab'}];tabs.children=['first','second'].map(tabValue=>{const text=createBasicComponent('text');text.layout.position='flow';text.content={text:`${tabValue} content`,tabValue};return text;});
    const list=byKind('list'),row=createBasicComponent('button');row.layout.position='flow';row.bindings={text:{source:'item',path:'name'}};row.interactions=[{event:'click',actions:[{kind:'setLocal',key:'picked',value:{source:'item',path:'id'}}]}];list.repeat={source:{source:'data',path:'records'},key:'id'};list.children=[row];
    byKind('button').interactions=[{event:'click',condition:{op:'equals',left:{source:'local',path:'select'},right:{source:'literal',value:'b'}},actions:[{kind:'setLocal',key:'phase',value:{source:'literal',value:'first'}},{kind:'setLocal',key:'phase',value:{source:'literal',value:'second'}}]}];
    const host=document.createElement('div');host.className='galcraft-player';host.style.cssText='position:relative;width:1280px;height:900px';document.body.replaceChildren(host);window.wf4BasicActions=[];
    function Fixture(){const[local,setLocal]=React.useState({input:'Initial input',slider:30,toggle:false,select:'a',tabs:'first',picked:null,phase:null});window.wf4BasicState=local;return React.createElement(ComponentInstances,{root,context:{local,data:{records:[{id:'one',name:'Record one'},{id:'two',name:'Record two'}]}},label:key=>key,action:async(action,context)=>{if(action.kind==='setLocal'){const value=action.value.source==='literal'?action.value.value:context.item?.[action.value.path];window.wf4BasicActions.push({key:action.key,value});setLocal(previous=>({...previous,[action.key]:value}));}}});}
    createRoot(host).render(React.createElement(Fixture));
  },{react,dom,workspace});
  await page.locator('[data-gc-part="basic.input"]').fill('Changed input');await page.waitForFunction(()=>window.wf4BasicState?.input==='Changed input');
  await page.locator('[data-gc-part="basic.slider"]').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>window.wf4BasicState?.slider===31);
  await page.locator('[data-gc-part="basic.toggle"] input').check();await page.waitForFunction(()=>window.wf4BasicState?.toggle===true);
  await page.locator('[data-gc-part="basic.select"]').selectOption('b');await page.getByRole('tab',{name:'First tab'}).focus();await page.keyboard.press('ArrowRight');await page.getByRole('tabpanel').filter({hasText:'second content'}).waitFor();
  await page.getByRole('button',{name:'Record two'}).click();await page.waitForFunction(()=>window.wf4BasicState?.picked==='two');await page.getByRole('button',{name:'Button',exact:true}).click();await page.waitForFunction(()=>window.wf4BasicState?.phase==='second');
  assert.deepEqual(await page.evaluate(()=>window.wf4BasicActions.filter(action=>action.key==='phase').map(action=>action.value)),['first','second']);
  checks.push('All 11 basic types render; input, slider, toggle, select, keyboard tabs, repeated record and conditional ordered actions execute in the browser');await page.screenshot({path:resolve(output,'eleven-basic-controls.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
}finally{await writeFile(resolve(output,process.argv.includes('--basic')?'basic-report.json':'report.json'),JSON.stringify({environment:'Windows / Edge / formal Storybook / real Player sample domain',executedAt:new Date().toISOString(),checks,errors,failures},null,2));await browser.close();}
