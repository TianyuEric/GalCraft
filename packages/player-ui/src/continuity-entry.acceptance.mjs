import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

// One real shared-Player entry save/continue scenario, followed by a short video skip.
const repo = resolve(import.meta.dirname, '../../..');
const output = join(repo, 'test-results/latest/player-continuity-entry');
await mkdir(output, { recursive: true });
const sharp = createRequire(join(repo, 'packages/assets/package.json'))('sharp');
const vite = process.env.GALCRAFT_STORYBOOK_URL ?? 'http://127.0.0.1:6007';
const fsUrl = path => `${vite}/@fs/${path.replaceAll('\\', '/')}`;
const entryPath = join(output, `entry-${Date.now()}.ts`);
const png = await readFile(join(repo, 'apps/studio/resources/practice/backgrounds/spring-sunset.png'));
const requests = [], pending = new Set(), sockets = new Set();
let released = false;
const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url.startsWith('/stage.png')) {
    const event = { url: request.url, at: Date.now(), prefixBytes: released ? png.length : 65536, completed: released };
    requests.push(event);
    response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
    if (released) response.end(png);
    else { response.write(png.subarray(0, 65536)); pending.add({ response, event }); }
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<html><body><div id="app"></div><script type="module" src="${fsUrl(entryPath)}"></script></body></html>`);
  }
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const releaseImage = () => {
  released = true;
  for (const item of pending) { item.response.end(png.subarray(65536)); item.event.completed = true; item.event.tailAt = Date.now(); }
  pending.clear();
};
const entry = `
import '${fsUrl(join(repo, 'packages/player-ui/src/player.css'))}';
import { createId, SaveRecordSchema } from '@galcraft/contracts';
import { FixtureIds as F, FixtureSnapshot, fixtureId as id } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate } from '@galcraft/templates';
import { mountPlayer } from '${fsUrl(join(repo, 'packages/player-ui/src/bootstrap.ts'))}';
document.head.insertAdjacentHTML('beforeend','<style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style>');
const ok=value=>({ok:true,value,warnings:[]});
const unwrap=r=>{if(!r.ok)throw Error(r.error.code+': '+r.error.message);return r.value;};
const snapshot=structuredClone(FixtureSnapshot),template=createOfficialTemplate({kind:'standard'});
snapshot.template=template;snapshot.lock.template=template.dependencies.find(x=>x.kind==='template');snapshot.lock.plugins=[];snapshot.pluginDocuments={};snapshot.documents=[];
snapshot.project.name='入口存档恢复定向验收';snapshot.project.player.autosave=false;snapshot.project.player.name=null;
const assets={title:id(0x9100),stage:id(0x9101),video:id(0x9102)},base=snapshot.assets[0];
snapshot.assets=Object.values(assets).map((assetId,i)=>({...structuredClone(base),assetId,...(i===2?{kind:'video',metadata:{durationSec:2.5}}:{})}));
snapshot.project.display={icon:null,splash:null,titleBackground:assets.title,titleMusic:null,titleVideo:null};
for(const p of template.pages){p.background.imageId=p.key==='title'?assets.title:null;p.background.color='#19543c';p.background.imageOpacity=1;}
const instruction=(n,opcode,args)=>({statementId:id(0x9200+n),opcode,args,condition:null,specVersion:'0.1.0',continuation:['say','video'].includes(opcode)?'wait':'continue',skippable:true,source:{documentId:F.streetDocument,statementId:id(0x9200+n),revision:1}});
snapshot.scenes[0].instructions=[instruction(1,'changeBg',{op:'show',assetId:assets.stage}),instruction(2,'say',{speaker:{kind:'narrator'},text:'入口存档恢复后的第一句。'}),instruction(3,'video',{assetId:assets.video,volume:0,skipFadeMs:0}),instruction(4,'end',{endingId:'entry-skip-ending',target:{kind:'title'},durationMs:180})];
snapshot.scenes[0].labels={};snapshot.scenes[1].instructions=[];snapshot.scenes[1].labels={};snapshot.project.entry.labelId=null;
const source='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#19543c"/><text x="400" y="300" fill="white" font-size="100">入口档恢复 / 完整标题来源</text></svg>');
const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d'),stream=c.captureStream(30),chunks=[];
const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),recorded=new Promise(done=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>done(new Blob(chunks,{type:'video/webm'}));});
let frame=0;const paint=()=>{ctx.fillStyle='#603080';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.font='40px sans-serif';ctx.fillText('VIDEO SKIP '+frame++,80,180);};paint();recorder.start();const timer=setInterval(paint,33);await new Promise(done=>setTimeout(done,2500));clearInterval(timer);recorder.stop();const videoURL=URL.createObjectURL(await recorded);stream.getTracks().forEach(track=>track.stop());
const events=[],storage=new Map();let storageRevision=0;
const host={target:'web',resources:{resolve:async(assetId,variantId)=>{events.push({kind:'resolve',assetId,variantId,at:performance.now()});return ok({uri:assetId===assets.title?source:assetId===assets.stage?'${origin}/stage.png':videoURL,mime:assetId===assets.title?'image/svg+xml':assetId===assets.stage?'image/png':'video/webm',bytes:1,rangeSupported:false,release(){events.push({kind:'release',assetId,at:performance.now()});}});}},storage:{read:async key=>{events.push({kind:'storage-read',key,at:performance.now()});return ok(storage.get(key)??null);},commit:async batch=>{if(batch.expectedRevision!==storageRevision)throw Error('Host storage revision mismatch');const decoded=batch.writes.map(x=>({key:x.key,value:JSON.parse(new TextDecoder().decode(x.bytes))}));events.push({kind:'storage-commit',expectedRevision:batch.expectedRevision,writes:decoded,at:performance.now()});for(const x of batch.writes)storage.set(x.key,new Uint8Array(x.bytes));for(const key of batch.deletes)storage.delete(key);storageRevision++;return ok({revision:storageRevision});}},transfer:{importFile:async()=>ok(null),exportFile:async()=>ok(undefined)},viewport:()=>({width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:0,right:0,bottom:0,left:0},orientation:'landscape'}),subscribeLifecycle:()=>()=>{},subscribeInput:()=>()=>{},close:async()=>ok(undefined),platform:async command=>ok(command==='window.fullscreen'?{enabled:false}:null)};
const mounted=unwrap(await mountPlayer(document.getElementById('app'),host,snapshot));
const preferences=mounted.data.current().preferences;
unwrap(await mounted.data.savePreferences({...preferences,textSpeed:120,toolbarLocked:true,pauseOnBlur:false,movieSkip:true,confirmations:{overwrite:false,load:false,newGame:false,title:false,exit:false}},preferences.revision));
const position={sceneId:snapshot.project.entry.sceneId,statementId:snapshot.scenes[0].instructions[0].statementId};
const scenario={schemaVersion:1,id:createId(),name:'合法 phase:entry 检查点',projectId:snapshot.projectId,entry:position,target:position,initialProgress:{},pluginInitial:{},route:[],playerInputs:[],externalPolicy:'simulate',engineVersion:snapshot.engineVersion,pluginVersions:[snapshot.lock.engine,...snapshot.lock.plugins,snapshot.lock.template]};
const prepared=unwrap(await mounted.session.prepareSession({snapshot,domain:mounted.data.domain,source:{kind:'entry',scenario},target:null}));
if(prepared.state.phase!=='entry'||prepared.snapshotId!==snapshot.snapshotId)throw Error('Runtime did not prepare the exact entry snapshot');
const record=mounted.data.makeRecord({snapshot,inspection:{state:prepared.state,history:[]},kind:'continue'});
SaveRecordSchema.parse(record);
unwrap(await mounted.data.save({kind:'continue',record,expectedIndexRevision:mounted.data.current().index.revision}));
const stored=unwrap(await mounted.data.record(record.recordId));
mounted.session.disposePrepared(prepared.id);
mounted.restore.subscribe(receipt=>events.push({kind:'restored',receipt,at:performance.now()}));
const video=document.querySelector('video.gc-video');video.addEventListener('ended',()=>events.push({kind:'video-ended',at:performance.now()}));
mounted.view.render();
const state=()=>{const inspection=mounted.session.inspect();return{at:performance.now(),page:mounted.view.navigation.page,hold:document.querySelectorAll('.gc-visual-hold').length,inert:document.querySelector('.gc-content')?.inert,rootInert:document.getElementById('app').inert,phase:inspection?.state.phase,wait:inspection?.state.wait,statement:inspection?.token?.statementId,status:inspection?.status,sessionId:inspection?.sessionId,snapshotId:inspection?.snapshotId,text:document.querySelector('.gc-content [data-gc-part="story.readingPanel.text"]')?.textContent??document.querySelector('.gc-content')?.textContent,video:{time:video.currentTime,duration:video.duration,ready:video.readyState,hidden:video.hidden,visibility:getComputedStyle(video).visibility,ended:video.ended},cover:!!document.querySelector('.gc-ending-cover')};};
const trace=[];let tracing=true;const sample=()=>{if(!tracing)return;trace.push(state());requestAnimationFrame(sample);};requestAnimationFrame(sample);
Object.assign(window,{acceptance:{mounted,snapshot,assets,prepared,record,stored,events,trace,state,stop:()=>{tracing=false;},dispose:()=>{tracing=false;mounted.view.dispose();URL.revokeObjectURL(videoURL);}}});document.documentElement.dataset.ready='true';
`;
await writeFile(entryPath, entry);
const report = {
  target: 'V02 / PC-02 phase:entry SaveRecord → title Continue → actual Stage first frame and first line; V03 / PC-10 real video skip → end → title.',
  environment: 'Headless Microsoft Edge 1280×720; real shared mountPlayer, runtime, RestoreCoordinator, Stage and HTML video; official template; isolated in-memory web PlayerHost.',
  data: 'Short FixtureSnapshot; real prepareSession entry state; PlayerDataService.makeRecord/save/record; spring-sunset.png with a controlled incomplete tail; browser-recorded 2.5s VP8 WebM.',
  expected: 'Exact entry record and snapshot restore through title Continue; complete title source persists until actual background decode; complete first line, clear hold and working input; Escape skips the actual video and submits the ending once.',
  checks: [], errors: [], requests, result: 'failed',
  notExecuted: ['Native Windows host and independent Web/Windows releases', 'Full routes, historical gates and generation services', 'Other phase:entry/media combinations covered by separate acceptance records'],
};
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
page.setDefaultTimeout(15000);
const state = () => page.evaluate(() => window.acceptance.state());
const ready = name => page.waitForFunction(name => window.acceptance?.mounted.view.navigation.page === name && !document.querySelector('.gc-visual-hold') && !document.querySelector('.gc-content').inert, name);
const shot = name => page.screenshot({ path: join(output, name + '.png') });
try {
  await page.goto(origin);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await ready('title');
  const provenance = await page.evaluate(() => {const a=window.acceptance;return{prepared:a.prepared,record:a.record,stored:a.stored,projectId:a.snapshot.projectId,snapshotId:a.snapshot.snapshotId,releaseVersion:a.snapshot.releaseVersion,engineVersion:a.snapshot.engineVersion,lock:a.snapshot.lock,stageAsset:a.snapshot.assets.find(asset=>asset.assetId===a.assets.stage),active:a.mounted.session.inspect(),index:a.mounted.data.current().index};});
  assert.equal(provenance.prepared.state.phase, 'entry');
  assert.equal(provenance.active, null);
  assert.deepEqual(provenance.record.state, provenance.prepared.state);
  assert.deepEqual(provenance.stored, provenance.record);
  assert.equal(provenance.record.projectId, provenance.projectId);
  assert.equal(provenance.prepared.snapshotId, provenance.snapshotId);
  assert.equal(provenance.record.releaseVersion, provenance.releaseVersion);
  assert.equal(provenance.record.engineVersion, provenance.engineVersion);
  assert.deepEqual(provenance.record.dependencyVersions, [provenance.lock.engine, ...provenance.lock.plugins, provenance.lock.template]);
  assert.equal(provenance.index.continueRecordId, provenance.record.recordId);
  await writeFile(join(output, 'entry-record-provenance.json'), JSON.stringify(provenance, null, 2));
  const titlePixels = await shot('entry-source-title');
  const stageResponse = page.waitForResponse(response => response.url().startsWith(origin + '/stage.png'));
  await page.locator('.gc-content [data-gc-part="title.menu.continue"]:visible').click();
  await page.waitForFunction(() => !!document.querySelector('.gc-visual-hold'));
  await stageResponse;
  await page.waitForTimeout(180);
  const partial = await state();
  assert(partial.hold > 0 && partial.inert);
  assert(requests.some(request => request.prefixBytes === 65536 && !request.completed));
  const pendingPixels = await shot('entry-target-prefix-only-source-retained');
  const sample = async pixels => [...await sharp(pixels).extract({ left: 50, top: 50, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
  assert.deepEqual(await sample(pendingPixels), await sample(titlePixels));
  report.checks.push({ id: 'PC02-entry-source-held', target: 'Retain complete title while first Stage background has an incomplete PNG tail', expected: 'Hold and input lock remain; actual screenshot keeps source pixels', actual: { partial, sourcePixel: await sample(titlePixels), pendingPixel: await sample(pendingPixels), requests: structuredClone(requests) }, result: 'pass', evidence: ['entry-source-title.png', 'entry-target-prefix-only-source-retained.png'] });
  releaseImage();
  await ready('story');
  await page.waitForFunction(() => window.acceptance.mounted.session.inspect()?.state.wait?.kind === 'say' && window.acceptance.mounted.session.inspect().state.wait.textComplete);
  const body = await state();
  assert.equal(body.hold, 0); assert.equal(body.inert, false);
  assert(body.text.includes('入口存档恢复后的第一句。'));
  const runtime = await page.evaluate(() => ({ inspection: window.acceptance.mounted.session.inspect(), stage: window.acceptance.mounted.stage.capture(), events: window.acceptance.events }));
  assert.equal(runtime.inspection.snapshotId, provenance.prepared.snapshotId);
  assert.equal(runtime.events.filter(event => event.kind === 'restored').length, 1);
  assert(runtime.stage.ok);
  assert(runtime.stage.value.objects.some(object => object.assetId === provenance.stageAsset.assetId && object.variantId === provenance.stageAsset.variantId));
  await shot('entry-restored-first-frame-first-line');
  report.checks.push({ id: 'PC02-entry-continued', target: 'Exact phase:entry record restores via title Continue and reaches true first background and first line', expected: 'One RestoreCoordinator publication; exact snapshot; Stage contains prepared body; full line; hold and input lock clear', actual: { body, runtime }, result: 'pass', evidence: ['entry-record-provenance.json', 'entry-restored-first-frame-first-line.png', 'entry-frame-trace.json'] });
  await page.locator('#app').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {const a=window.acceptance,s=a.state();return s.video.ready>=2&&!s.video.hidden&&s.video.visibility==='visible'&&!s.hold&&a.mounted.session.inspect()?.token?.statementId===a.snapshot.scenes[0].instructions[2].statementId;});
  const movie = await state();
  assert(movie.video.time < 1.5 && !movie.video.ended);
  await shot('entry-input-resumed-real-video');
  await page.keyboard.press('Escape');
  await ready('title');
  await page.waitForFunction(() => !document.querySelector('.gc-ending-cover'));
  const ending = await page.evaluate(() => ({ state: window.acceptance.state(), inspection: window.acceptance.mounted.session.inspect(), endings: window.acceptance.mounted.data.current().longTerm.endings, events: window.acceptance.events }));
  assert(ending.endings.includes('entry-skip-ending'));
  assert.equal(ending.events.filter(event => event.kind === 'video-ended').length, 0);
  const endingWrites = ending.events.filter(event => event.kind === 'storage-commit' && event.writes.some(write => write.key.endsWith('/longTerm') && write.value.endings.includes('entry-skip-ending')));
  assert.equal(endingWrites.length, 1);
  assert.equal(ending.state.hold, 0); assert.equal(ending.state.inert, false);
  await shot('entry-video-skipped-end-title');
  report.checks.push({ id: 'PC10-entry-video-skip-end', target: 'Recovered input advances from first line; physical Escape skips real HTML video, executes end and returns to title once', expected: 'Video was actually playing; no natural ended event; one ending persistence; final title unlocked', actual: { movie, ending, endingWrites: endingWrites.length }, result: 'pass', evidence: ['entry-input-resumed-real-video.png', 'entry-video-skipped-end-title.png', 'entry-frame-trace.json'] });
  const trace = await page.evaluate(() => { window.acceptance.stop(); return window.acceptance.trace; });
  await writeFile(join(output, 'entry-frame-trace.json'), JSON.stringify(trace, null, 2));
  const firstBody = trace.findIndex(frame => frame.page === 'story' && !frame.hold && frame.wait?.kind === 'say');
  assert(firstBody >= 0);
  const exposedEntry = trace.slice(0, firstBody).filter(frame => frame.page === 'story' && !frame.hold);
  assert.equal(exposedEntry.length, 0, 'Entry exposes a story frame before actual first background and first line');
  report.checks[1].actual.trace = { samples: trace.length, firstVisibleSay: firstBody, uncoveredBeforeSay: exposedEntry.length };
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (error) {
  report.failure = error.stack; report.failedState = await state().catch(() => null);
  await shot('failure').catch(() => {});
  throw error;
} finally {
  report.executedAt = new Date().toISOString();
  releaseImage();
  await page.evaluate(() => window.acceptance?.dispose()).catch(() => {});
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, checks: report.checks.map(check => check.id), output, failure: report.failure }));
  await context.close(); await browser.close();
  for (const socket of sockets) socket.destroy();
  await new Promise(done => server.close(done));
}
