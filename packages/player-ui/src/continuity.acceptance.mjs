import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

// Real shared Player + in-memory host and short authored fixture. No release claim.
const repo = resolve(import.meta.dirname, '../../..');
const output = join(repo, 'test-results/latest/player-continuity-integration');
const sharp = createRequire(join(repo,'packages/assets/package.json'))('sharp');
await mkdir(output, { recursive: true });
const vite = process.env.GALCRAFT_STORYBOOK_URL ?? 'http://127.0.0.1:6007';
const fsUrl = path => `${vite}/@fs/${path.replaceAll('\\', '/')}`;
const entryPath = join(output, `entry-${Date.now()}.ts`);
const png = await readFile(join(repo, 'apps/studio/resources/practice/backgrounds/spring-sunset.png'));
const requests = [], pending = new Set(), sockets = new Set();
const scope = process.env.GALCRAFT_CONTINUITY_SCOPE ?? 'all';
let stream = false;
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/source.svg') {
    response.writeHead(200, {'Content-Type':'image/svg+xml'});response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#19543c"/><text x="400" y="300" fill="white" font-size="100">完整来源 / 间幕</text></svg>');
  } else if (url.pathname === '/image') {
    const event = { url: url.href, at: Date.now(), prefixBytes: stream ? 65536 : png.length, completed: !stream };
    requests.push(event);
    response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
    if (stream) { response.write(png.subarray(0, 65536)); pending.add({ response, event }); }
    else response.end(png);
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<html><head></head><body><div id="app"></div><script type="module" src="${fsUrl(entryPath)}"></script></body></html>`);
  }
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const flush = () => { for (const item of pending) { item.response.end(png.subarray(65536)); item.event.completed = true; item.event.tailAt = Date.now(); } pending.clear(); stream = false; };
const entry = `
import '${fsUrl(join(repo, 'packages/player-ui/src/player.css'))}';
import { FixtureIds as F, FixtureSnapshot, fixtureId as id } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate } from '@galcraft/templates';
import { mountPlayer } from '${fsUrl(join(repo, 'packages/player-ui/src/bootstrap.ts'))}';
document.head.insertAdjacentHTML('beforeend','<style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style>');
const ok=value=>({ok:true,value,warnings:[]});const unwrap=r=>{if(!r.ok)throw Error(r.error.message);return r.value;};
const parameters=new URLSearchParams(location.search),kind=parameters.get('kind')||'pages';
const svg=(color,label)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="'+color+'"/><text x="400" y="300" fill="white" font-size="100">'+label+'</text></svg>');
const makeVideo=async(color,label)=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d'),s=c.captureStream(30),chunks=[];const r=new MediaRecorder(s,{mimeType:'video/webm;codecs=vp8'});const done=new Promise(resolve=>{r.ondataavailable=e=>chunks.push(e.data);r.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));});let n=0;const paint=()=>{x.fillStyle=color;x.fillRect(0,0,640,360);x.fillStyle='white';x.font='40px sans-serif';x.fillText(label+' '+n++,80,180);};paint();r.start();const t=setInterval(paint,33);await new Promise(resolve=>setTimeout(resolve,1200));clearInterval(t);r.stop();const b=await done;s.getTracks().forEach(t=>t.stop());return URL.createObjectURL(b);};
const snapshot=structuredClone(FixtureSnapshot),template=createOfficialTemplate({kind:'standard'});
snapshot.template=template;snapshot.lock.template=template.dependencies.find(x=>x.kind==='template');snapshot.lock.plugins=[];snapshot.pluginDocuments={};snapshot.documents=[];snapshot.project.name='连续画面定向夹具';snapshot.project.player.autosave=false;snapshot.project.player.name=null;
snapshot.project.display={icon:null,splash:null,titleBackground:id(0x8100),titleMusic:null,titleVideo:null};
const base=snapshot.assets[0],assets={title:id(0x8100),source:id(0x8101),stage:id(0x8102),video:id(0x8103),video2:id(0x8104)};
snapshot.assets=Object.values(assets).map((assetId,i)=>({...structuredClone(base),assetId,...(i>=3?{kind:'video',metadata:{durationSec:1.2}}:{})}));
for(const p of template.pages){p.background.imageId=p.key==='settings'?assets.source:p.key==='title'?assets.title:null;p.background.color='#fff8ef';p.background.imageOpacity=1;}
const instruction=(n,opcode,args)=>({statementId:id(0x8200+n),opcode,args,condition:null,specVersion:'0.1.0',continuation:['say','choose','video'].includes(opcode)?'wait':'continue',skippable:true,source:{documentId:F.streetDocument,statementId:id(0x8200+n),revision:1}});
const say=(n,text)=>instruction(n,'say',{speaker:{kind:'narrator'},text});
const video=(n,assetId)=>instruction(n,'video',{assetId,volume:0,skipFadeMs:0});
snapshot.scenes[0].instructions=kind==='video'? [video(1,assets.video),instruction(2,'changeBg',{op:'show',assetId:assets.stage}),say(3,'正文首句完整就绪。'),video(4,assets.video),video(5,assets.video2),instruction(6,'end',{endingId:'continuity-ending',target:{kind:'title'},durationMs:180})]:[instruction(1,'changeBg',{op:'show',assetId:assets.stage}),say(2,'工具栏几何保持。')];snapshot.scenes[0].labels={};snapshot.scenes[1].instructions=[say(10,'结束')];snapshot.scenes[1].labels={};snapshot.project.entry.labelId=null;
if(kind==='entry'){const fade=durationMs=>({preset:'fade',resourceId:null,durationMs,easing:{family:'linear',direction:'in'},direction:'left'});snapshot.scenes[0].scene.presentation={title:null,interlude:{image:{assetId:assets.source,variantId:null},voice:null,fit:'cover',holdMs:180,oldStageExit:fade(350),enter:fade(500),exit:fade(120),newStageEnter:fade(100),allowSkip:true}};}
const galleryId=id(0x8300),diff1=id(0x8301),diff2=id(0x8302);snapshot.gallery=[{id:galleryId,kind:'cg',name:'实际CG主图',series:'定向',order:0,cover:null,assets:[],differences:[{id:diff1,assetId:assets.source,name:'来源完整',order:0},{id:diff2,assetId:assets.title,name:'实际PNG目标',order:1}],coverDifferenceId:diff1,lockedView:'placeholder'}];
const resources=new Map([[assets.source,'${origin}/source.svg'],[assets.stage,svg('#ba2626','旧舞台 CG')]]);if(kind==='video'){resources.set(assets.video,await makeVideo('#123c80','VIDEO A'));resources.set(assets.video2,await makeVideo('#603080','VIDEO B'));}
const modes={},events=[],storage=new Map();let seq=0;
const host={target:'web',resources:{resolve:async(assetId,variantId)=>{events.push({kind:'resolve',assetId,at:performance.now()});if(modes[assetId]==='fail')return{ok:false,error:{code:'RESOURCE_MISSING',message:'定向资源失败',severity:'error',owner:'M07',related:[],actions:[]},issues:[]};if(modes[assetId]==='delay'||modes[assetId]==='slow')await new Promise(r=>setTimeout(r,modes[assetId]==='slow'?650:180));const uri=assetId===assets.title?'${origin}/image?instance='+seq++:resources.get(assetId);return ok({uri,mime:assetId===assets.title?'image/png':assetId===assets.video||assetId===assets.video2?'video/webm':'image/svg+xml',bytes:1,rangeSupported:false,release(){events.push({kind:'release',assetId,at:performance.now()});}});}},storage:{read:async key=>ok(storage.get(key)??null),commit:async batch=>{for(const x of batch.writes)storage.set(x.key,x.bytes);for(const key of batch.deletes)storage.delete(key);return ok({revision:batch.expectedRevision+1});}},transfer:{importFile:async()=>ok(null),exportFile:async()=>ok(undefined)},viewport:()=>({width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:0,right:0,bottom:0,left:0},orientation:'landscape'}),subscribeLifecycle:()=>()=>{},subscribeInput:()=>()=>{},close:async()=>ok(undefined),platform:async c=>ok(c==='window.fullscreen'?{enabled:false}:null)};
const mounted=unwrap(await mountPlayer(document.getElementById('app'),host,snapshot));const preferences=mounted.data.current().preferences;unwrap(await mounted.data.savePreferences({...preferences,textSpeed:120,toolbarLocked:true,pauseOnBlur:false,confirmations:{overwrite:false,load:false,newGame:false,title:false,exit:false}},preferences.revision));unwrap(await mounted.data.saveLongTerm({...mounted.data.current().longTerm,endings:['fixture-unlock'],cg:{[galleryId]:[diff1,diff2]}},mounted.data.current().longTerm.revision));mounted.view.render();
const state=()=>{const video=document.querySelector('#app>.gc-stage video')||document.querySelector('video.gc-video');const inspection=mounted.session.inspect();return{at:performance.now(),page:mounted.view.navigation.page,hold:document.querySelectorAll('.gc-visual-hold').length,holdOpacity:document.querySelector('.gc-visual-hold')?.style.opacity,cover:!!document.querySelector('.gc-ending-cover'),inert:document.querySelector('.gc-content')?.inert,rootInert:document.querySelector('#app').inert,wait:inspection?.state.wait?.kind,phase:inspection?.state.phase,status:inspection?.status,statement:inspection?.token?.statementId,video:video?{src:video.currentSrc,time:video.currentTime,ready:video.readyState,hidden:video.hidden,visibility:getComputedStyle(video).visibility,paused:video.paused,ended:video.ended}:null,images:[...document.querySelectorAll('img')].filter(x=>!x.closest('.gc-visual-hold')).map(x=>({src:x.currentSrc,complete:x.complete,width:x.naturalWidth,status:x.dataset.gcMediaStatus,visibility:getComputedStyle(x).visibility,part:x.closest('[data-gc-part]')?.getAttribute('data-gc-part')})),text:document.querySelector('.gc-content')?.textContent?.slice(0,150)};};
const trace=[];let tracing=true;const sample=()=>{if(!tracing)return;trace.push(state());requestAnimationFrame(sample);};requestAnimationFrame(sample);
Object.assign(window,{acceptance:{mounted,snapshot,assets,modes,events,trace,state,stopTrace:()=>{tracing=false;},dispose:()=>mounted.view.dispose()}});document.documentElement.dataset.ready='true';
`;
await writeFile(entryPath, entry);
const report = { environment: 'Edge / real shared mountPlayer, Stage and HTML video; official template + short FixtureSnapshot + in-memory PlayerHost. Not independent release or Windows host.', expected: 'Keep complete source until actual destination media is ready; preserve video end frame through actual runtime completion.', checks: [], errors: [], requests, result: 'failed' };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => report.errors.push(e.message));
page.setDefaultTimeout(15000);
const state = () => page.evaluate(() => window.acceptance.state());
const holdPixels = () => page.evaluate(()=>[...document.querySelectorAll('.gc-visual-hold canvas')].map(c=>{let pixels;try{pixels=[[.25,.25],[.5,.5],[.75,.75]].map(([x,y])=>[...c.getContext('2d').getImageData(Math.floor(c.width*x),Math.floor(c.height*y),1,1).data]);}catch(e){pixels=String(e);}const ancestors=[];for(let x=c;x&&ancestors.length<8;x=x.parentElement){const s=getComputedStyle(x),r=x.getBoundingClientRect();ancestors.push({tag:x.tagName,class:x.className,page:x.dataset.page,width:r.width,height:r.height,display:s.display,visibility:s.visibility,zIndex:s.zIndex,opacity:s.opacity,background:s.backgroundColor});}return{width:c.width,height:c.height,pixels,ancestors};}));
const shot = name => page.screenshot({ path: join(output, name + '.png') });
const ready = pageName => page.waitForFunction(name => window.acceptance && window.acceptance.mounted.view.navigation.page === name && !document.querySelector('.gc-visual-hold') && !document.querySelector('.gc-content').inert, pageName);
const load = async kind => { flush(); await page.goto(origin+'/?kind='+kind); await page.waitForFunction(()=>document.documentElement.dataset.ready==='true'); await ready('title'); };
const evidence = {'PC12-page-cold-stream':['pc12-source-settings.png','pc12-target-png-prefix-only.png','pc12-target-complete.png'],'PC12-CG-cold-stream':['cg-source-ready.png','cg-target-prefix-only.png','cg-target-complete.png'],'PC12-resource-failure':['resource-failure-unlocked.png'],'PC01-browser-toolbar':['toolbar-hidden.png','toolbar-revealed.png'],'PC02-title-video-body':['pc02-title.png','pc02-title-video-pending.png','pc02-body-video-pending.png','pc02-body.png','video-frame-trace.json'],'PC10-video-video-end':['pc10-title-after-end.png','video-frame-trace.json'],'PC02-authored-entry':['entry-old-stage-exit-source-retained.png','entry-interlude-enter-source-blend.png','entry-body-ready.png']};
const check = (id, target, actual) => report.checks.push({id,target,environment:report.environment,data:'FixtureSnapshot; spring-sunset.png; actual browser-generated 1.2s VP8 WebM',expected:target,actual,result:'pass',evidence:evidence[id]});
const clickPart = part => page.locator(`.gc-content [data-gc-part="${part}"]:visible`).click();
try {
  if(scope==='all'||scope==='pages'){
  await load('pages'); await shot('title-ready');
  await clickPart('title.menu.settings'); await ready('settings'); await shot('pc12-source-settings');
  const beforeRequests=requests.length;stream=true;
  await page.evaluate(()=>window.acceptance.modes[window.acceptance.assets.title]='delay');
  await page.locator('.gc-content').getByRole('button',{name:'返回',exact:true}).click();
  await page.waitForFunction(()=>!!document.querySelector('.gc-visual-hold'));
  await page.waitForFunction(()=>[...document.querySelectorAll('img')].some(x=>!x.closest('.gc-visual-hold')&&x.dataset.gcMediaStatus==='pending'&&x.currentSrc.includes('/image')));
  await new Promise(r=>setTimeout(r,150));const partial=await state();
  assert(partial.hold>0);assert(partial.inert);assert(partial.images.some(x=>x.status==='pending'&&!x.complete&&x.visibility==='hidden'));assert(requests.slice(beforeRequests).some(x=>x.prefixBytes===65536&&!x.completed));
  await shot('pc12-target-png-prefix-only');flush();await ready('title');const full=await state();assert(full.images.filter(x=>x.src.includes('/image')).every(x=>x.complete&&x.status==='ready'));await shot('pc12-target-complete');
  check('PC12-page-cold-stream','Actual target PNG has incomplete tail, remains hidden, frozen complete source and input lock persist; full target takes over after completion.',{partial,full,requests:requests.slice(beforeRequests)});
  await page.evaluate(()=>window.acceptance.modes[window.acceptance.assets.title]='normal');
  await page.evaluate(()=>window.acceptance.mounted.view.open('cg'));await ready('cg');
  await page.locator('.gc-content [data-gc-part="cg.grid.item"]').first().click();await page.locator('.gc-content').getByRole('button',{name:'查看',exact:true}).click();await page.locator('.gc-content [data-gc-part="cg.viewer.next"]:visible').waitFor();await shot('cg-source-ready');
  stream=true;const cgStart=requests.length;await clickPart('cg.viewer.next');await page.waitForFunction(()=>!!document.querySelector('.gc-visual-hold'));await new Promise(r=>setTimeout(r,200));const cgPartial=await state();assert(cgPartial.hold>0);assert(cgPartial.images.some(x=>x.part==='cg.viewer.image.content'&&x.status==='pending'&&x.visibility==='hidden'));await shot('cg-target-prefix-only');flush();await page.waitForFunction(()=>!document.querySelector('.gc-visual-hold'));await shot('cg-target-complete');check('PC12-CG-cold-stream','CG main-image handoff uses actual mounted image readiness.',{partial:cgPartial,full:await state(),requests:requests.slice(cgStart)});
  await page.evaluate(()=>window.acceptance.modes[window.acceptance.assets.source]='fail');await page.evaluate(()=>window.acceptance.mounted.view.open('settings'));await page.waitForFunction(()=>!document.querySelector('.gc-visual-hold'));await page.waitForFunction(()=>document.querySelector('.gc-content')?.inert===false);await shot('resource-failure-unlocked');check('PC12-resource-failure','Actual resource resolve failure exits the hold and returns control.',await state());
  }
  if(scope==='all'||scope==='video'){
  await load('video');await shot('pc02-title');
  await page.evaluate(()=>window.acceptance.modes[window.acceptance.assets.video]='slow');
  const frames=[];let recording=true;const capture=(async()=>{while(recording){const frame={at:Date.now(),state:await state()};frames.push(frame);if(frame.state.hold)frame.holdBefore=await holdPixels();const pixels=await page.screenshot({path:join(output,'video-frame-'+String(frames.length).padStart(3,'0')+'.png')});const stats=await sharp(pixels).stats();frame.black=stats.channels.slice(0,3).every(c=>c.max===0);frame.after=await state();if(frame.after.hold)frame.holdAfter=await holdPixels();await new Promise(r=>setTimeout(r,55));}})();
  await clickPart('title.menu.start');await page.waitForFunction(()=>window.acceptance.mounted.session.inspect()?.state.wait?.kind==='say');await ready('story');const body=await state();await shot('pc02-body');
  assert(body.text.includes('正文首句'));
  const panel=page.locator('.gc-content [data-gc-part="story.readingPanel"]');const geometry=[];geometry.push(await panel.boundingBox());
  await clickPart('story.toolbar.lock');await page.locator('#app').focus();await page.mouse.move(500,200);await page.waitForFunction(()=>document.querySelector('.gc-content .gc-toolbar')?.classList.contains('gc-toolbar-hidden'));geometry.push(await panel.boundingBox());await shot('toolbar-hidden');await page.mouse.move(600,718);await page.waitForFunction(()=>!document.querySelector('.gc-content .gc-toolbar')?.classList.contains('gc-toolbar-hidden'));geometry.push(await panel.boundingBox());await new Promise(r=>setTimeout(r,250));geometry.push(await panel.boundingBox());await shot('toolbar-revealed');assert(geometry.every(r=>Math.abs(r.x-geometry[0].x)<.1&&Math.abs(r.width-geometry[0].width)<.1));check('PC01-browser-toolbar','Actual lock button unlocks toolbar; bottom-edge hide/reveal keeps reading panel horizontal edges constant.',geometry);
  await page.evaluate(()=>window.acceptance.modes[window.acceptance.assets.video2]='delay');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.acceptance.mounted.session.inspect()?.state.wait?.kind!=='say');await page.waitForFunction(()=>window.acceptance.mounted.view.navigation.page==='title'&&!document.querySelector('.gc-ending-cover')&&!document.querySelector('.gc-visual-hold'));await ready('title');recording=false;await capture;
  const trace=await page.evaluate(()=>window.acceptance.trace);await writeFile(join(output,'video-frame-trace.json'),JSON.stringify({frames,trace},null,2));
  const evidence=await page.evaluate(()=>({ids:window.acceptance.snapshot.scenes[0].instructions.map(x=>({id:x.statementId,opcode:x.opcode})),unlocks:window.acceptance.mounted.data.current().longTerm.endings}));
  assert(evidence.unlocks.includes('continuity-ending'));const videoIds=evidence.ids.filter(x=>x.opcode==='video').map(x=>x.id);assert(videoIds.every(id=>trace.some(x=>x.statement===id&&x.video?.ready>=2)));assert(trace.filter(x=>x.status==='ended'&&x.page!=='title').every(x=>x.hold||x.cover||x.video&&!x.video.hidden&&x.video.visibility==='visible'&&x.video.ready>=2));
  await shot('pc10-title-after-end');check('PC10-video-video-end','Real HTML onended dispatches video A to video B, then end persists the authored ending and reaches title under last-frame/ending coverage.',{evidence,frames:frames.length,traceSamples:trace.length});
  const exposed=trace.filter(x=>x.page==='story'&&x.video&&!x.video.hidden&&x.video.visibility==='hidden'&&!x.hold&&!x.cover);
  const sourceFrames=videoIds.slice(0,2).map(id=>frames.findIndex(x=>x.state.statement===id&&x.state.hold&&!x.black)+1);assert(sourceFrames.every(x=>x>0),'Capture actual title and body source pixels while video resolve is delayed');
  await copyFile(join(output,'video-frame-'+String(sourceFrames[0]).padStart(3,'0')+'.png'),join(output,'pc02-title-video-pending.png'));await copyFile(join(output,'video-frame-'+String(sourceFrames[1]).padStart(3,'0')+'.png'),join(output,'pc02-body-video-pending.png'));
  assert.equal(exposed.length,0,'Pending video exposes empty stage before first painted frame');assert(!frames.some(x=>x.black&&!x.state.cover&&!x.after.cover),'Actual compositor screenshot exposes unintended all-black frame');check('PC02-title-video-body','Title hands to actual video first frame; natural video completion reaches complete first body line; pending video never exposes an empty stage.',{body,frames:frames.length,sourceFrames,pendingVideoSamples:trace.filter(x=>x.page==='story'&&x.video&&!x.video.hidden&&x.video.visibility==='hidden').length,uncoveredPending:exposed.length,unintendedBlackFrames:frames.filter(x=>x.black&&!x.state.cover&&!x.after.cover).length});
  }
  if(scope==='all'||scope==='entry'){
    await load('entry');await clickPart('title.menu.start');await page.waitForFunction(()=>document.querySelector('.gc-scene-entry')?.dataset.phase==='oldStageExit');const exiting=await state();assert(exiting.hold>0);assert(!exiting.holdOpacity||Number(exiting.holdOpacity)===1);await shot('entry-old-stage-exit-source-retained');
    await page.waitForFunction(()=>{const hold=document.querySelector('.gc-visual-hold');return document.querySelector('.gc-scene-entry')?.dataset.phase==='interludeEnter'&&hold&&Number(hold.style.opacity)<.85&&Number(hold.style.opacity)>.15;});const entering=await state();await shot('entry-interlude-enter-source-blend');await ready('story');await page.waitForFunction(()=>!document.querySelector('.gc-scene-entry'));await shot('entry-body-ready');check('PC02-authored-entry','Nonzero oldStageExit keeps source fully frozen; actual interludeEnter blends source, then complete body takes over.',{exiting,entering,body:await state()});
  }
  assert.deepEqual(report.errors,[]);report.result='passed';
} catch(error) {report.failure=error.stack;report.failedState=await state().catch(()=>null);report.debug=await page.evaluate(()=>{const e=document.querySelector('.gc-content [data-gc-part="cg.viewer.next"]');const a=[];for(let n=e;n;n=n.parentElement)a.push({tag:n.tagName,part:n.dataset.gcPart,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,hidden:n.hidden,style:n.getAttribute('style')});return{gallery:window.acceptance?.mounted.view.galleryView,ancestors:a};}).catch(()=>null);await shot('failure').catch(()=>{});throw error;}
finally {report.executedAt=new Date().toISOString();flush();await writeFile(join(output,scope==='all'?'report.json':`report-${scope}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,checks:report.checks.map(x=>x.id),output,failure:report.failure}));await browser.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
