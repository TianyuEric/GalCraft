import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron } from 'playwright';

// Exercise the independent Windows app through real inputs, including a complete route.
const repo=resolve(import.meta.dirname,'../../..');
const release=resolve(process.env.GALCRAFT_REFINEMENT_WINDOWS??join(repo,'test-results/latest/runtime-docs-version/sample-final/windows'));
const phase=process.env.GALCRAFT_REFINEMENT_PHASE??'baseline';
const output=join(repo,'test-results/latest/website-player-refinement/player',phase);
const profile=join(repo,'tmp/testing/website-player-refinement',phase);
await mkdir(output,{recursive:true});await mkdir(profile,{recursive:true});
const snapshot=JSON.parse(await readFile(join(release,'game/snapshot.json'),'utf8'));
const report={result:'failed',executedAt:new Date().toISOString(),release,profile,projectId:snapshot.projectId,snapshotId:snapshot.snapshotId,phase,route:[],errors:[],media:[],tokens:[]};
let app,page;
const state=()=>page.evaluate(()=>({page:document.querySelector('.gc-canvas > .gc-content')?.dataset.page,text:document.querySelector('.gc-canvas > .gc-content .gc-dialogue-visible')?.textContent??'',nvl:!!document.querySelector('.gc-canvas > .gc-content .gc-nvl'),hold:!!document.querySelector('.gc-visual-hold'),modal:document.querySelector('.gc-modal-layer[data-modal="true"]')?.dataset.page,error:document.querySelector('.gc-message')?.textContent,video:[...document.querySelectorAll('video')].filter(v=>v.src).map(v=>({src:v.currentSrc||v.src,time:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,paused:v.paused,hidden:v.hidden,status:v.dataset.gcMediaStatus,error:v.error?{code:v.error.code,message:v.error.message}:null}))}));
const ready=target=>page.waitForFunction(target=>document.querySelector('.gc-canvas > .gc-content')?.dataset.page===target&&!document.querySelector('.gc-visual-hold'),target,{timeout:45000});
const shot=name=>page.screenshot({path:join(output,name+'.png')});
try{
  app=await _electron.launch({executablePath:join(release,process.env.GALCRAFT_REFINEMENT_EXE??'electron.exe'),cwd:release,args:['--galcraft-offline',`--galcraft-test-data=${profile}`],env:{...process.env,TEMP:join(repo,'tmp/testing'),TMP:join(repo,'tmp/testing')}});
  page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));
  report.environment=await app.evaluate(()=>({electron:process.versions.electron,chromium:process.versions.chrome,platform:process.platform}));
  await page.addInitScript(()=>{
    const events=window.refinementMedia=[],record=(kind,media,extra={})=>events.push({kind,at:performance.now(),src:media.currentSrc||media.src,time:media.currentTime,readyState:media.readyState,networkState:media.networkState,paused:media.paused,ended:media.ended,error:media.error?{code:media.error.code,message:media.error.message}:null,...extra});
    for(const kind of ['loadstart','loadedmetadata','loadeddata','canplay','playing','pause','ended','error','abort','emptied'])document.addEventListener(kind,event=>{if(event.target instanceof HTMLVideoElement)record(kind,event.target);},true);
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){if(this instanceof HTMLVideoElement)record('play-call',this);const result=play.apply(this,args);if(this instanceof HTMLVideoElement)result.then(()=>record('play-resolved',this),error=>record('play-rejected',this,{name:error.name,message:error.message}));return result;};
    const frame=HTMLVideoElement.prototype.requestVideoFrameCallback;
    HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){return frame.call(this,(now,metadata)=>{record('first-frame-callback',this,{mediaTime:metadata.mediaTime,presentedFrames:metadata.presentedFrames});callback(now,metadata);});};
  });
  await page.reload();await page.locator('#app[data-release-ready]').waitFor({timeout:45000});await ready('title');await shot('title');
  if(phase!=='baseline')report.window=await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.setFullScreen(false);window.unmaximize();window.setContentSize(1280,720);window.center();window.focus();return{title:window.getTitle(),bounds:window.getBounds(),appUserModelId:'org.galcraft.player.MIzmDT'};});
  report.first=await state();
  await page.locator('.gc-canvas > .gc-content [data-gc-part="title.menu.start"]').click();
  let startedAt=Date.now(),completed=false,checkedNvl=false;
  for(let step=0;step<1000;step++){
    const current=await state();report.route.push({step,at:Date.now()-startedAt,...current});
    if(current.page==='videoError')throw new Error('First route entered videoError');
    if(current.page==='title'&&step>10){completed=true;await shot('ending-returned-title');break;}
    if(current.modal==='confirm'){await page.locator('.gc-modal-layer [data-gc-part="confirm.confirm"]').click();continue;}
    if(current.page==='input'){const input=page.locator('.gc-canvas > .gc-content input').first();if(await input.count())await input.fill('林舟');await page.locator('.gc-canvas > .gc-content [data-gc-part="input.submit"]').click();continue;}
    if(current.hold||current.video.some(v=>!v.hidden)){await page.waitForTimeout(200);continue;}
    if(current.page==='choice'){await page.locator('.gc-canvas > .gc-content .gc-choice-list button').first().click();await page.waitForTimeout(150);continue;}
    if(current.nvl&&!checkedNvl){
      checkedNvl=true;await shot('nvl');
      if(phase!=='baseline'){
        const body=page.locator('.gc-canvas > .gc-content .gc-body');await body.hover();await page.mouse.wheel(0,-300);await ready('history');await shot('nvl-wheel-history');
        const history=page.locator('.gc-canvas > .gc-content .gc-history-list');await history.evaluate(e=>e.scrollTop=e.scrollHeight);await history.hover();await page.mouse.wheel(0,300);await ready('story');
        const before=await state();await body.hover();await page.mouse.wheel(0,300);await page.waitForTimeout(180);const after=await state();assert(after.page==='story');assert.notEqual(after.text,before.text);report.nvlWheel={before,after};await shot('nvl-wheel-advance');
      }
    }
    await page.locator('#app').focus();await page.keyboard.press('Space');await page.waitForTimeout(65);
  }
  assert(completed,'The real first route did not return to title');
  report.completeRoute=true;await page.locator('.gc-canvas > .gc-content [data-gc-part="title.menu.start"]').click();
  for(let step=0;step<240;step++){
    const current=await state();report.route.push({second:true,step,at:Date.now()-startedAt,...current});
    if(current.page==='input'){const input=page.locator('.gc-canvas > .gc-content input').first();if(await input.count())await input.fill('林舟');await page.locator('.gc-canvas > .gc-content [data-gc-part="input.submit"]').click();continue;}
    if(current.page==='videoError'){report.secondFailure=current;await shot('second-video-error');break;}
    if(current.page==='story'&&current.text&&!current.hold&&!current.video.some(v=>!v.hidden&&(!v.paused||v.status==='pending'))){report.secondFirstLine=current;await shot('second-first-line');break;}
    await page.waitForTimeout(200);
  }
  report.media=await page.evaluate(()=>window.refinementMedia);report.final=await state();
  report.result=report.secondFirstLine?'passed':'failed';
}catch(error){report.failure=String(error.stack??error);if(page){report.final=await state().catch(()=>null);report.media=await page.evaluate(()=>window.refinementMedia??[]).catch(()=>[]);await shot('failure').catch(()=>{});}}
finally{if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await writeFile(join(output,'a03.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,completeRoute:report.completeRoute,secondFailure:report.secondFailure,secondFirstLine:report.secondFirstLine,failure:report.failure,output}));if(report.result!=='passed')process.exitCode=1;}
