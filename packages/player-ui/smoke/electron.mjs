import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { app, BrowserWindow } from 'electron';

const output = resolve(import.meta.dirname, '../../../test-results/latest/ui-player-reading');
await mkdir(output, { recursive: true });
app.setPath('userData', join(output, 'electron-data'));
const report = { environment: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }, checks: [], result: 'failed' };
const delay = ms => new Promise(done => setTimeout(done, ms));
let window;
const run = code => window.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
const wait = async (expression, timeout = 30000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await run(`return Boolean(${expression});`)) return; await delay(80); }
  throw Error(`Player did not reach ${expression}`);
};
const idle = `document.querySelector('#app')?.getAttribute('aria-busy')!=='true'&&!document.querySelector('.gc-content')?.inert`;
const ready = page => wait(`${idle}${page ? `&&document.querySelector('.gc-content')?.dataset.page==='${page}'` : ''}`);
const click = async (part, expectedPage) => {
  await wait(`${idle}&&(()=>{const control=document.querySelector('[data-gc-part="${part}"]');if(!control||control.disabled||control.closest('[inert]'))return false;
    const box=control.getBoundingClientRect();return box.width>0&&box.height>0&&document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('button')===control;})()`);
  const point=await run(`const control=document.querySelector('[data-gc-part="${part}"]');if(!control||control.disabled)throw Error('Unavailable ${part}');
    const box=control.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
    if(document.elementFromPoint(x,y)?.closest('button')!==control)throw Error('Blocked ${part}');return {x:Math.round(x),y:Math.round(y)};`);
  window.webContents.sendInputEvent({type:'mouseMove',...point});
  window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
  window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
  await run(`await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
  await ready(expectedPage);
};
const shot = async name => { await run(`await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
  await writeFile(join(output, name), (await window.webContents.capturePage()).toPNG()); };
const geometry = () => run(`const body=document.querySelector('.gc-body'), panel=document.querySelector('.gc-reading-panel');
  const box=body.getBoundingClientRect(); return { x:box.x,y:box.y,width:box.width,height:box.height,portrait:panel.dataset.portrait,present:panel.dataset.portraitPresent };`);
const pixel = async () => { await run(`await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
  const image=await window.webContents.capturePage({x:40,y:40,width:1,height:1}), bytes=image.toBitmap();
  return [bytes[2],bytes[1],bytes[0]]; };

app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
    window.webContents.on('console-message', event => { if (event.level === 3) console.error(event.message); });
    await window.loadURL(process.env.GALCRAFT_PLAYER_READING_URL ?? 'http://127.0.0.1:5179');
    await wait(`document.documentElement.dataset.ready==='true'`);
    await run('await acceptance.mounted.view.newGame();await acceptance.mounted.view.options.waitForStage();acceptance.render();');
    await ready('story');
    await wait(`document.querySelector('.gc-reading-panel')?.dataset.portraitPresent==='true'`);

    const layouts=[];
    for (const locale of ['zh-CN','en','ja']) {
      await run(`await acceptance.locale('${locale}');acceptance.preset('portrait');`);
      await wait(`document.querySelector('.gc-reading-panel')?.dataset.portraitPresent==='true'`);
      const withPortrait=await geometry();
      await run('await acceptance.next();');
      await wait(`document.querySelector('.gc-reading-panel')?.dataset.portraitPresent==='false'`);
      const narration=await geometry();
      for(const key of ['x','y','width','height']) assert.ok(Math.abs(withPortrait[key]-narration[key])<1,`${locale} portrait ${key}`);
      await run(`acceptance.preset('clear');`); const clearNarration=await geometry();
      await run('await acceptance.next();'); const clearSpeaker=await geometry();
      for(const key of ['x','y','width','height']) assert.ok(Math.abs(clearNarration[key]-clearSpeaker[key])<1,`${locale} clear ${key}`);
      assert.equal(clearSpeaker.portrait,'false'); assert.ok(clearSpeaker.width>withPortrait.width);
      layouts.push({locale,withPortrait,narration,clearNarration,clearSpeaker});
    }
    report.checks.push({id:'fixed-reading-layouts',result:'passed',layouts});
    await shot('fixed-clear-reading.png');
    await run(`acceptance.preset('portrait');await acceptance.locale('zh-CN');
      while(acceptance.inspect().state.position.statementId!==acceptance.transitionStatementId)await acceptance.next();`);
    // Keep the real renderer clock at known points while capturing visible crossfade frames.
    await run(`await acceptance.next(); const current=acceptance.inspect();
      await acceptance.mounted.session.updateTextProgress({token:current.token,textShown:10000});
      await acceptance.mounted.view.options.waitForStage();acceptance.render();acceptance.mounted.stage.pause(true);`);
    const before=await pixel(); await shot('background-fade-start.png');
    await run(`const stage=acceptance.mounted.stage;stage.pause(false);stage.tick(250);stage.pause(true);`);
    const middle=await pixel(); await shot('background-fade-midpoint.png');
    await run(`const stage=acceptance.mounted.stage;stage.pause(false);stage.tick(250);stage.pause(true);`);
    const after=await pixel(); await shot('background-fade-end.png');
    assert.ok(before[0]>before[2]+80); assert.ok(after[2]>after[0]+80);
    assert.ok(middle[0]>after[0]+20&&middle[2]>before[2]+20,`No crossfade pixel: ${middle}`);
    report.checks.push({id:'background-fade',result:'passed',before,middle,after});

    await click('story.toolbar.history', 'history');
    await wait(`document.querySelector('.gc-history-list')?.scrollTop>0`);
    const history=await run(`const list=document.querySelector('.gc-history-list'); return {
      first:list.querySelector('article p').textContent,last:list.querySelector('article:last-child p').textContent,
      scrollTop:list.scrollTop,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight };`);
    assert.ok(history.first.includes('01')); assert.ok(history.last.includes('场景切换'));
    assert.ok(Math.abs(history.scrollTop+history.clientHeight-history.scrollHeight)<2);
    await shot('history-open-at-latest.png');
    await run(`const list=document.querySelector('.gc-history-list');list.scrollTop=120;list.dispatchEvent(new Event('scroll',{bubbles:true}));acceptance.render();`);
    await delay(250);
    assert.equal(await run(`return document.querySelector('.gc-history-list').scrollTop;`),120);
    await shot('history-reading-older.png');
    await click('history.back', 'story'); await click('story.toolbar.history', 'history');
    assert.ok(await run(`const list=document.querySelector('.gc-history-list');return Math.abs(list.scrollTop+list.clientHeight-list.scrollHeight)<2;`));
    report.checks.push({id:'history-order-and-scroll',result:'passed',history,reRenderScrollTop:120});
    await click('history.back', 'story');

    await run('await acceptance.next();');
    await ready('choice');
    for(const locale of ['zh-CN','en','ja']) {
      await run(`await acceptance.locale('${locale}');`);
      const toolbar=await run(`const toolbar=document.querySelector('.gc-toolbar'),save=document.querySelector('[data-gc-part="story.toolbar.save"]');return {visible:toolbar.getBoundingClientRect().height>0&&!toolbar.classList.contains('gc-toolbar-hidden'),save:!save.disabled,auto:document.querySelector('[data-gc-part="story.toolbar.auto"]').disabled,skip:document.querySelector('[data-gc-part="story.toolbar.skip"]').disabled};`);
      assert.deepEqual(toolbar,{visible:true,save:true,auto:true,skip:true});
    }
    await run(`await acceptance.locale('zh-CN');`); await shot('choice-with-toolbar.png');
    const waiting=await run(`const state=acceptance.inspect().state;return {position:state.position,wait:state.wait,route:state.route};`);
    await click('story.toolbar.save', 'save'); await wait(`document.querySelector('[data-gc-part="save.grid.slot"]')`);
    await click('save.grid.slot'); await wait(`acceptance.mounted.data.current().index.manual.some(slot=>slot.recordId)&&document.querySelector('#app').getAttribute('aria-busy')==='false'`);
    const saved=await run(`const data=acceptance.mounted.data;const slot=data.current().index.manual.find(slot=>slot.recordId);const result=await data.record(slot.recordId);if(!result.ok)throw Error(result.error.message);return {recordId:slot.recordId,position:result.value.state.position,wait:result.value.state.wait,route:result.value.state.route};`);
    assert.deepEqual(saved.position,waiting.position);assert.deepEqual(saved.wait,waiting.wait);assert.deepEqual(saved.route,[]);
    await click('save.back', 'choice');
    await run(`document.querySelector('.gc-choice-list button').click();`);
    await wait(`acceptance.inspect()?.state.route.length===1`);
    await click('story.toolbar.load', 'load'); await wait(`document.querySelector('[data-gc-part="load.grid.slot"]:not(:disabled)')`);
    await click('load.grid.slot', 'choice');
    const restored=await run(`const state=acceptance.inspect().state;return {position:state.position,wait:state.wait,route:state.route};`);
    assert.deepEqual(restored,waiting);
    await shot('choice-restored.png');
    await click('story.toolbar.quickSave'); await wait(`acceptance.mounted.data.current().index.quick.length===1&&document.querySelector('#app').getAttribute('aria-busy')==='false'`);
    await run(`document.querySelector('.gc-choice-list button:last-child').click();`);await wait(`acceptance.inspect()?.state.route.length===1`);
    await click('story.toolbar.quickLoad', 'choice');
    assert.equal(await run(`return acceptance.inspect().state.route.length;`),0);
    report.checks.push({id:'choice-toolbar-save-restore',result:'passed',waiting,saved,restored,manual:true,quick:true,locales:['zh-CN','en','ja']});
    report.result='passed';
  } catch(error) { report.error=String(error.stack??error); console.error(error); }
  finally { await writeFile(join(output,'result.json'),JSON.stringify(report,null,2)+'\n'); window?.destroy(); app.exit(report.result==='passed'?0:1); }
});
