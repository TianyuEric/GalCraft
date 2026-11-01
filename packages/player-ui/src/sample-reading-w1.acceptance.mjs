import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { chromium, _electron } from 'playwright';

// Current shared Player, original tutorial snapshot and real media. Profile writes stay in memory.
const repo=resolve(import.meta.dirname,'../../..'),output=join(repo,'test-results/latest/sample-reading/w1');
const release=resolve(process.env.GALCRAFT_W1_SAMPLE??join(repo,'test-results/latest/d28/final-delivery/web'));
const vite=process.env.GALCRAFT_STORYBOOK_URL??'http://127.0.0.1:6007',fsUrl=path=>`${vite}/@fs/${path.replaceAll('\\','/')}`;
await mkdir(output,{recursive:true});
const scope=process.env.GALCRAFT_W1_SCOPE??'all';
const snapshot=JSON.parse(await readFile(join(release,'game/snapshot.json'),'utf8'));
const styles=Object.fromEntries(await Promise.all(snapshot.template.styles.filter(item=>item.compiledPath).map(async item=>[item.compiledPath,await readFile(join(release,item.compiledPath),'utf8')])));
const requests=[],pending=new Set(),sockets=new Set();let streamAsset=null;
const mime=path=>({'.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp4':'video/mp4','.ogg':'audio/ogg','.wav':'audio/wav','.woff2':'font/woff2','.css':'text/css','.json':'application/json'})[extname(path)]??'application/octet-stream';
const entryPath=join(output,`entry-${Date.now()}.ts`);
const server=createServer(async(request,response)=>{
  try{
    const url=new URL(request.url,'http://localhost');response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Cache-Control','no-store');
    if(url.pathname==='/snapshot'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(snapshot));return;}
    if(url.pathname==='/styles'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(styles));return;}
    if(url.pathname.startsWith('/release/')){
      const path=join(release,decodeURIComponent(url.pathname.slice(9))),bytes=await readFile(path),assetId=url.searchParams.get('asset');
      response.writeHead(200,{'Content-Type':mime(path),'Content-Length':bytes.length});
      const event={assetId,path,at:Date.now(),bytes:bytes.length,complete:!streamAsset||assetId!==streamAsset};requests.push(event);
      if(streamAsset&&assetId===streamAsset){response.write(bytes.subarray(0,65536));pending.add({response,event,bytes});}else response.end(bytes);return;
    }
    response.setHeader('Content-Type','text/html');response.end(`<html><body><div id="app"></div><script type="module" src="${fsUrl(entryPath)}"></script></body></html>`);
  }catch(error){response.writeHead(500);response.end(String(error));}
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
const flush=()=>{streamAsset=null;for(const item of pending){item.event.complete=true;item.event.tailAt=Date.now();item.response.end(item.bytes.subarray(65536));}pending.clear();};
await writeFile(entryPath,`
import '${fsUrl(join(repo,'packages/player-ui/src/player.css'))}';
import { mountPlayer } from '${fsUrl(join(repo,'packages/player-ui/src/bootstrap.ts'))}';
document.head.insertAdjacentHTML('beforeend','<style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style>');
const snapshot=await(await fetch('${origin}/snapshot')).json(),styles=await(await fetch('${origin}/styles')).json();
const ok=value=>({ok:true,value,warnings:[]}),unwrap=result=>{if(!result.ok)throw Error(result.error.code+': '+result.error.message);return result.value;};
const storage=new Map(),warm=new Map();let failSave=false,failedAsset=null,sequence=0;
const host={target:new URLSearchParams(location.search).has('native')?'windows':'web',resources:{resolve:async(assetId,variantId)=>{if(assetId===failedAsset)return{ok:false,error:{code:'RESOURCE_MISSING',owner:'M07',severity:'error',message:'W1 目标图片读取失败。',related:[],actions:['retry']},issues:[]};const asset=snapshot.assets.find(x=>x.assetId===assetId&&(!variantId||x.variantId===variantId));if(!asset)throw Error('Missing asset '+assetId);return ok({uri:warm.get(assetId)??'${origin}/release/'+asset.entry+'?asset='+assetId+'&request='+sequence++,mime:asset.files.find(x=>x.path===asset.entry)?.mime??'application/octet-stream',bytes:1,rangeSupported:false,release(){}});}},storage:{read:async key=>ok(storage.get(key)??null),commit:async batch=>{if(failSave)return{ok:false,error:{code:'STORAGE_FAILED',owner:'M07',severity:'error',message:'W1 定向写入失败，保留本次设置后重试。',related:[],actions:['retry']},issues:[]};for(const x of batch.writes)storage.set(x.key,x.bytes);for(const key of batch.deletes)storage.delete(key);return ok({revision:batch.expectedRevision+1});}},transfer:{importFile:async()=>ok(null),exportFile:async()=>ok(undefined)},viewport:()=>({width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:0,right:0,bottom:0,left:0},orientation:'landscape'}),subscribeLifecycle:()=>()=>{},subscribeInput:()=>()=>{},close:async()=>ok(undefined),platform:async()=>ok({enabled:false})};
const mounted=unwrap(await mountPlayer(document.getElementById('app'),host,snapshot,undefined,[],[],undefined,styles));
const preferences=mounted.data.current().preferences;unwrap(await mounted.data.savePreferences({...preferences,textSpeed:120,pauseOnBlur:false,toolbarLocked:true,volumes:{...preferences.volumes,master:0},confirmations:{overwrite:false,load:false,newGame:false,title:false,exit:false}},preferences.revision));
unwrap(await mounted.data.saveLongTerm({...mounted.data.current().longTerm,endings:mounted.view.options.snapshot.characters.flatMap(x=>x.afterstory?.unlockEndingIds??[])},mounted.data.current().longTerm.revision));mounted.view.render();
const root=()=>document.querySelector('.gc-canvas > .gc-content'),rect=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollTop:e.scrollTop,opacity:s.opacity,translate:s.translate,transform:s.transform,overflow:s.overflow};};
const state=()=>{const i=mounted.session.inspect(),c=root(),hold=document.querySelector('.gc-visual-hold');return{at:performance.now(),page:mounted.view.navigation.page,wait:i?.state.wait,statement:i?.token?.statementId,mode:i?.state.presentation.text.reading?.mode,parts:i?.state.presentation.text.parts.map(x=>x.statementId),history:i?.history.map(x=>({id:x.id,statementId:x.position.statementId,text:x.text})),text:c?.querySelector('.gc-dialogue-visible')?.textContent,panel:rect(c?.querySelector('.gc-reading-panel')),body:rect(c?.querySelector('.gc-body')),toolbar:rect(c?.querySelector('.gc-toolbar')),canvas:rect(document.querySelector('.gc-canvas')),content:rect(c),hold:hold?{opacity:getComputedStyle(hold).opacity,contentOpacity:getComputedStyle(hold.querySelector('.gc-content')).opacity,animations:hold.getAnimations().length}:null,pending:[...document.querySelectorAll('[data-gc-media-status="pending"]')].filter(x=>!x.closest('.gc-visual-hold')).length,bgm:document.querySelector('.gc-bgm-notice')?.textContent};};
window.w1={mounted,state,rect,failMedia:id=>{failedAsset=id;},warm:async()=>{const ids=new Set();const scan=value=>{if(!value||typeof value!=='object')return;if(value.assetId)ids.add(value.assetId);for(const v of Object.values(value))scan(v);};for(const p of snapshot.template.pages.filter(p=>['title','characters'].includes(p.key))){if(p.background.imageId)ids.add(p.background.imageId);scan(p.root);}for(const c of snapshot.characters)scan(c.afterstory?.presentation);ids.add(snapshot.project.display.titleBackground);for(const id of ids){const a=snapshot.assets.find(x=>x.assetId===id);if(a?.kind==='image')warm.set(id,URL.createObjectURL(await(await fetch('${origin}/release/'+a.entry)).blob()));}return[...warm.keys()];},failSave:value=>{failSave=value;},mode:async mode=>{const s=mounted.view.options.snapshot;for(const p of s.template.pages.filter(p=>['title','characters'].includes(p.key)))p.root.animations=mode==='direct'?{}:structuredClone(snapshot.template.pages.find(x=>x.key===p.key).root.animations);const old=mounted.data.current().preferences;unwrap(await mounted.data.savePreferences({...old,reducedMotion:mode==='reduced'},old.revision));mounted.view.render();}};document.documentElement.dataset.ready='true';
`);
const report={result:'failed',executedAt:new Date().toISOString(),snapshotId:snapshot.snapshotId,environment:'Edge/current shared Player + GQ6Uys tutorial snapshot/media + in-memory profile; native geometry uses real Electron BrowserWindow. Final independent W7 release is separate.',checks:[],errors:[],requests};
let browser,native;const pages=[];
const ready=async(page,name)=>page.waitForFunction(name=>window.w1?.mounted.view.navigation.page===name&&!document.querySelector('.gc-visual-hold')&&!document.querySelector('.gc-canvas > .gc-content')?.inert,name,{timeout:45000});
const load=async page=>{page.on('pageerror',error=>report.errors.push(error.message));page.setDefaultTimeout(25000);await page.goto(origin);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',{timeout:45000});await ready(page,'title');};
const state=page=>page.evaluate(()=>window.w1.state()),shot=(page,name)=>page.screenshot({path:join(output,name+'.png')});
const check=(id,expected,actual,evidence)=>report.checks.push({id,target:id,environment:report.environment,data:`Original tutorial snapshot ${snapshot.snapshotId}`,expected,actual,result:'pass',evidence});
const inside=(a,b)=>a&&a.width>0&&a.height>0&&a.x>=b.x-1&&a.y>=b.y-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1;
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1280,height:720}});pages.push(page);await load(page);
  if(scope==='all'||scope==='reading'){
  await page.locator('.gc-canvas > .gc-content [data-gc-part="title.menu.start"]').click();
  await page.waitForFunction(()=>['input','story'].includes(window.w1.mounted.view.navigation.page));
  if((await state(page)).page==='input'){await page.locator('.gc-content input').first().fill('林舟');await page.locator('.gc-content [data-gc-part="input.submit"]').click();}
  await ready(page,'story');let nvl,seenBgm=null;
  report.route=[];
  for(let step=0;step<600;step++){
    const current=await state(page);report.route.push({step,page:current.page,statement:current.statement,wait:current.wait,mode:current.mode});if(current.bgm&&!seenBgm){seenBgm=current.bgm;await shot(page,'a5-bgm');}
    if(current.mode==='nvl'&&current.statement==='EvmawF'){nvl=current;break;}
    if(current.wait?.kind==='choice'){await page.evaluate(()=>{const i=window.w1.mounted.session.inspect();return window.w1.mounted.view.dispatchPageAction({kind:'selectOption',optionId:i.state.wait.optionIds[0]});});}
    else if(current.wait?.kind==='video'){await page.keyboard.press('Escape');await page.waitForTimeout(80);}
    else {await page.evaluate(()=>window.w1.mounted.view.advance());await page.waitForTimeout(current.wait?.kind==='say'?180:300);}
  }
  assert(nvl,'Normal tutorial route did not reach its original NVL scene');
  await page.waitForFunction(()=>window.w1.state().wait?.textComplete);nvl=await state(page);
  assert(inside(nvl.panel,nvl.canvas));assert(inside(nvl.body,nvl.canvas));assert(inside(nvl.toolbar,nvl.canvas));assert(nvl.text.includes('门明天会关上'));await shot(page,'a1-nvl');
  await page.evaluate(()=>window.w1.mounted.view.advance());await page.waitForFunction(()=>window.w1.state().statement==='K4CMBy');await page.waitForFunction(()=>window.w1.state().wait?.textComplete);await shot(page,'a1-nvl-next');
  const before=await state(page),entry=before.history.find(x=>x.statementId==='EvmawF');assert(entry);
  await page.evaluate(id=>{window.w1.jump=window.w1.mounted.view.jumpHistory(id);},entry.id);
  await page.locator('.gc-modal-layer [data-gc-part="confirm.confirm"]:visible').click();await page.evaluate(()=>window.w1.jump);await ready(page,'story');
  const jumped=await state(page);assert.equal(jumped.history.filter(x=>x.statementId==='EvmawF').length,1);assert(!jumped.history.some(x=>x.statementId==='K4CMBy'));await shot(page,'a1-history-jump');
  for(let i=0;i<12&&(await state(page)).mode==='nvl';i++){await page.evaluate(()=>window.w1.mounted.view.advance());await page.waitForTimeout(90);}
  const adv=await state(page);assert.equal(adv.mode,'adv');assert(inside(adv.body,adv.canvas));await shot(page,'a1-adv-restored');
  check('A1','Normal sample entry reaches original NVL paragraphs; clearPage/ADV returns; history target is re-executed once.',{nvl,before,jumped,adv},['a1-nvl.png','a1-nvl-next.png','a1-history-jump.png','a1-adv-restored.png']);
  assert(seenBgm&&!/\.(?:mp3|ogg|wav|flac)$/i.test(seenBgm));check('A5-BGM','Real BGM notice shows its title stem.',seenBgm,['a5-bgm.png']);
  }
  if(scope==='all'||scope==='pages'||scope==='settings'){
  await page.evaluate(()=>window.w1.mounted.view.open('settings'));await ready(page,'settings');
  const settingsGeometry=()=>page.evaluate(()=>{const c=document.querySelector('.gc-canvas > .gc-content'),part=name=>c.querySelector('[data-gc-part="'+name+'"]');return{canvas:window.w1.rect(document.querySelector('.gc-canvas')),content:window.w1.rect(c),categories:window.w1.rect(part('settings.categories')),fields:window.w1.rect(part('settings.content')),footer:window.w1.rect(part('settings.footer')),feedback:window.w1.rect(c.querySelector('.gc-settings-feedback'))};});
  const settings=[];
  for(const viewport of[{width:1280,height:720},{width:960,height:540}]){await page.setViewportSize(viewport);const g=await settingsGeometry();assert.equal(g.content.scrollHeight,g.content.clientHeight);assert(inside(g.categories,g.canvas));assert(inside(g.footer,g.canvas));settings.push({viewport,...g});await shot(page,'a5-settings-'+viewport.width);}
  await page.locator('[data-gc-part="settings.categories.item"]:visible').filter({hasText:'操作'}).click();
  const controls=await settingsGeometry();assert(controls.fields.scrollHeight>controls.fields.clientHeight);await page.locator('.gc-settings-fields').evaluate(x=>x.scrollTop=x.scrollHeight);assert.equal((await settingsGeometry()).content.scrollTop,0);
  await page.evaluate(()=>window.w1.failSave(true));await page.locator('.gc-settings-fields input[type="checkbox"]').first().check();await page.waitForFunction(()=>document.querySelector('.gc-settings-feedback')?.textContent.includes('设置尚未保存'));
  await shot(page,'a5-settings-save-failure');const failure=await settingsGeometry();assert(inside(failure.feedback,failure.canvas));assert(inside(failure.footer,failure.canvas));await page.evaluate(()=>window.w1.failSave(false));await page.locator('.gc-settings-feedback').getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.gc-settings-feedback')?.textContent.includes('设置尚未保存'));
  check('A5-Settings','Fixed page/categories/footer at common and minimum client sizes; overflowing fields scroll; save feedback remains visible and retry succeeds.',{settings,controls,failure},['a5-settings-1280.png','a5-settings-960.png','a5-settings-save-failure.png']);
  if(scope!=='settings'){
  const transitions=[];await page.evaluate(()=>window.w1.mounted.view.returnTitle(false));await ready(page,'title');await page.setViewportSize({width:1280,height:720});
  for(const mode of['animated','direct','reduced']){
    await page.evaluate(mode=>window.w1.mode(mode),mode);
    for(const target of['characters','title']){
      const source=await state(page);streamAsset=snapshot.template.pages.find(x=>x.key===target).background.imageId;const requestStart=requests.length;
      await page.evaluate(target=>window.w1.mounted.view.open(target),target);await page.waitForFunction(()=>!!window.w1.state().hold&&window.w1.state().pending>0);await page.waitForTimeout(200);
      const waiting=await state(page);assert.equal(waiting.hold.opacity,'1');assert.equal(waiting.hold.contentOpacity,'1');assert.equal(waiting.hold.animations,0);assert(requests.slice(requestStart).some(x=>!x.complete));await shot(page,`a6-${mode}-${target}-pending`);
      const frames=[];await page.evaluate(()=>{window.w1.frames=[];window.w1.tracing=true;const frame=()=>{if(!window.w1.tracing)return;const c=document.querySelector('.gc-canvas > .gc-content'),b=document.querySelector('.gc-page-background'),h=document.querySelector('.gc-visual-hold');window.w1.frames.push({at:performance.now(),hold:h?getComputedStyle(h).opacity:null,content:getComputedStyle(c).opacity,background:getComputedStyle(b).opacity,pending:window.w1.state().pending});requestAnimationFrame(frame);};requestAnimationFrame(frame);});flush();await ready(page,target);
      frames.push(...await page.evaluate(()=>{window.w1.tracing=false;return window.w1.frames;}));assert(frames.every(x=>Math.abs(Number(x.content)-Number(x.background))<.02));assert(frames.every(x=>!x.pending||x.hold==='1'));await shot(page,`a6-${mode}-${target}-ready`);transitions.push({mode,target,source,waiting,frames,requests:requests.slice(requestStart)});
    }
  }
  await page.evaluate(()=>window.w1.mode('animated'));const warmed=await page.evaluate(()=>window.w1.warm()),hot=[];
  for(const target of['characters','title']){const at=Date.now();await page.evaluate(target=>window.w1.mounted.view.open(target),target);await page.waitForTimeout(80);await shot(page,'a6-hot-'+target+'-mid');await ready(page,target);hot.push({target,elapsedMs:Date.now()-at,state:await state(page)});}
  check('A6-hot','Title/afterstory also hand off with prepared in-memory image bytes and authored animation.',{warmed,hot},['a6-hot-characters-mid.png','a6-hot-title-mid.png']);
  check('A6','Title/afterstory keep complete source until actual delayed PNG tail/decode; configured/direct/reduced handoffs coordinate content and background.',transitions,transitions.flatMap(x=>[`a6-${x.mode}-${x.target}-pending.png`,`a6-${x.mode}-${x.target}-ready.png`]));
  const story=await browser.newPage({viewport:{width:1280,height:720}});pages.push(story);await story.goto(vite+'/iframe.html?id=product-player-pages--settings&viewMode=story');await story.locator('[data-gc-part="settings.footer"]').waitFor();await shot(story,'storybook-settings');check('Storybook','Official Settings story renders the same shared component.',{url:story.url()},['storybook-settings.png']);
  const nativeMain=join(output,'native.cjs'),electronPath=createRequire(join(repo,'apps/studio/package.json'))('electron');
  await writeFile(nativeMain,`const{app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:720,useContentSize:true,webPreferences:{contextIsolation:true}});w.loadURL(${JSON.stringify(origin+'/?native=1')});});app.on('window-all-closed',()=>app.quit());`);
  native=await _electron.launch({executablePath:electronPath,args:[nativeMain],timeout:45000});const win=await native.firstWindow();await win.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:45000});await ready(win,'title');await win.evaluate(()=>window.w1.mounted.view.open('settings'));await ready(win,'settings');
  const nativeGeometry=[];for(const size of['minimum','maximized']){await native.evaluate(({BrowserWindow},size)=>{const w=BrowserWindow.getAllWindows()[0];if(size==='minimum')w.setContentSize(960,540);else w.maximize();},size);await win.waitForTimeout(150);const g=await win.evaluate(()=>{const c=document.querySelector('.gc-canvas > .gc-content');return{viewport:{width:innerWidth,height:innerHeight},canvas:window.w1.rect(document.querySelector('.gc-canvas')),content:window.w1.rect(c),categories:window.w1.rect(c.querySelector('[data-gc-part="settings.categories"]')),footer:window.w1.rect(c.querySelector('[data-gc-part="settings.footer"]'))};});assert.equal(g.content.scrollHeight,g.content.clientHeight);assert(inside(g.categories,g.canvas));assert(inside(g.footer,g.canvas));nativeGeometry.push({size,...g});await shot(win,'a5-windows-'+size);}
  check('A5-Windows','Real Windows Electron minimum client window and maximized window keep settings fixed and actions reachable.',nativeGeometry,['a5-windows-minimum.png','a5-windows-maximized.png']);
  }
  }
  if(scope==='all'||scope==='pages'||scope==='failure'){
    await ready(page,'title');const assetId=snapshot.template.pages.find(x=>x.key==='characters').background.imageId;await page.evaluate(id=>window.w1.failMedia(id),assetId);await page.evaluate(()=>window.w1.mounted.view.open('characters'));await ready(page,'characters');const failed={...await state(page),message:await page.locator('.gc-message').textContent()};assert(failed.message);await shot(page,'a6-resource-failure');await page.evaluate(()=>window.w1.failMedia(null));await page.evaluate(()=>window.w1.mounted.view.back());await ready(page,'title');check('A6-failure','A failed target releases the handoff, presents a persistent diagnostic and permits return to the complete source page.',{failed,recovered:await state(page)},['a6-resource-failure.png']);
  }
  assert.deepEqual(report.errors,[]);report.result='pass';console.log(JSON.stringify({result:report.result,checks:report.checks.map(x=>x.id),output},null,2));
}catch(error){report.failure=String(error.stack??error);report.failureStates=await Promise.all(pages.map(page=>state(page).catch(()=>null)));for(const page of pages)await shot(page,'failure-'+pages.indexOf(page)).catch(()=>{});throw error;}
finally{flush();await native?.close();await browser?.close();for(const socket of sockets)socket.destroy();await new Promise(done=>server.close(done));await writeFile(join(output,'acceptance-'+scope+'.json'),JSON.stringify(report,null,2));}
