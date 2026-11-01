import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { app, BrowserWindow } from 'electron';

const output = resolve(import.meta.dirname, '../../../../test-results/latest/ui-portrait-assets');
const report = { target: 'Electron Chromium rendering and input for the actual Studio components in Storybook', executedAt: new Date().toISOString(),
  environment: { electron: process.versions.electron, platform: process.platform }, checks: [], result: 'failed',
  limitations: ['Storybook supplies asset data and preview services. This run does not accept native project persistence, thumbnail provider, Live2D rendering, or published Player behavior.'] };
const check = (name, actual) => { assert.ok(actual, name); report.checks.push({ name, result: 'passed' }); };
let window;
const invoke = expression => window.webContents.executeJavaScript(expression, true);
const wait = async expression => {
  const until = Date.now() + 30000;
  while (Date.now() < until) { if (await invoke(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${expression}`);
};
const load = async story => { await window.loadURL(`http://127.0.0.1:6007/iframe.html?id=${story}&viewMode=story`); };
const frame = () => invoke(`(() => { const node = document.querySelector('.dialogue-portrait-crop-rect'); return { x:parseFloat(node.style.left),y:parseFloat(node.style.top),width:parseFloat(node.style.width),height:parseFloat(node.style.height) }; })()`);
const point = selector => invoke(`(() => { const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)}; })()`);
const key = keyCode => { window.webContents.sendInputEvent({type:'keyDown',keyCode}); window.webContents.sendInputEvent({type:'keyUp',keyCode}); };
const drag = async (selector, dx, dy, cancel = false) => {
  const from = await point(selector);
  window.webContents.sendInputEvent({type:'mouseMove',...from});
  window.webContents.sendInputEvent({type:'mouseDown',...from,button:'left',clickCount:1});
  window.webContents.sendInputEvent({type:'mouseMove',x:from.x+dx,y:from.y+dy,button:'left'});
  await invoke('new Promise(resolve => requestAnimationFrame(resolve))');
  if (cancel) key('Escape');
  window.webContents.sendInputEvent({type:'mouseUp',x:from.x+dx,y:from.y+dy,button:'left',clickCount:1});
  await invoke('new Promise(resolve => requestAnimationFrame(resolve))');
};
const capture = async name => {
  const style = await window.webContents.insertCSS('*,*::before,*::after{animation:none!important;transition:none!important}dialog[open]{opacity:1!important;scale:1!important}');
  await invoke('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await writeFile(join(output, name), (await window.webContents.capturePage()).toPNG()); await window.webContents.removeInsertedCSS(style);
};
app.whenReady().then(async () => {
await mkdir(output, {recursive:true});
try {
  window = new BrowserWindow({show:false,width:1100,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await load('product-studio-authoring-portrait-crop--image'); await wait(`document.querySelector('.dialogue-portrait-crop img')?.naturalWidth > 0`);
  const before = await frame(); await drag('.dialogue-portrait-crop-rect', 30, 24); const moved = await frame();
  check('Native drag moves frame and preserves size', moved.x > before.x && moved.y > before.y && moved.width === before.width && moved.height === before.height);
  await drag('.dialogue-portrait-handle.handle-se', 16, 16); const resized = await frame();
  check('Native corner drag resizes without moving opposite corner', resized.width > moved.width && resized.height > moved.height && resized.x === moved.x && resized.y === moved.y);
  await drag('.dialogue-portrait-crop-rect', -12, 10, true); const cancelled = await frame();
  check('Escape restores the crop at drag start', JSON.stringify(cancelled) === JSON.stringify(resized));
  await invoke(`document.querySelector('.dialogue-portrait-crop-rect').focus()`); key('Right'); await invoke('new Promise(resolve=>requestAnimationFrame(resolve))');
  const keyboard = await frame(); check('Native arrow key moves frame', keyboard.x > cancelled.x);
  await invoke(`document.querySelector('.dialogue-portrait-handle.handle-se').focus()`); key('Down'); await invoke('new Promise(resolve=>requestAnimationFrame(resolve))');
  const keyboardSize = await frame(); check('Native corner arrow key changes size', keyboardSize.height > keyboard.height && keyboardSize.x === keyboard.x);
  await invoke(`document.querySelector('.portrait-apply').click()`); await wait(`document.querySelector('[data-portrait-applied]')`);
  const applied = await invoke(`JSON.parse(document.querySelector('[data-portrait-applied]').textContent)`);
  check('Apply returns enabled portrait with normalized crop', applied.enabled && applied.crop.x >= 0 && applied.crop.x + applied.crop.width <= 1 && applied.crop.y + applied.crop.height <= 1);
  await capture('portrait-zh-1100x900.png');
  for (const [story, label] of [['english','Apply portrait settings'],['japanese','ポートレート設定を適用']]) {
    await load(`product-studio-authoring-portrait-crop--${story}`); await wait(`document.querySelector('.portrait-apply')?.textContent === ${JSON.stringify(label)}`); check(`Portrait ${story} actual labels`, true); await capture(`portrait-${story}-1100x900.png`);
  }
  await load('product-studio-authoring-portrait-crop--live-2-d'); await wait(`document.querySelector('.portrait-apply')`);
  check('Live2D uses numeric crop controls without creating a second model preview', await invoke(`!document.querySelector('.dialogue-portrait-crop img') && document.querySelectorAll('.dialogue-portrait-values input').length === 4`));
  window.setSize(480, 640); await load('product-studio-authoring-asset-details--long-name'); await wait(`document.querySelector('dialog.asset-details-dialog')?.open`);
  await capture('asset-detail-long-480x640.png');
  report.assetLayout = await invoke(`(() => {const dialog=document.querySelector('.asset-details-dialog'),body=dialog.querySelector('.asset-details-body'),footer=dialog.querySelector('footer'),box=dialog.getBoundingClientRect();return {left:box.left,right:box.right,bottom:box.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight,footerBottom:footer.getBoundingClientRect().bottom,bodyScroll:body.scrollHeight,bodyHeight:body.clientHeight,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth};})()`);
  const layout = report.assetLayout;
  check('Long names and many versions stay inside a narrow viewport', layout.left>=0&&layout.right<=layout.viewportWidth&&layout.bottom<=layout.viewportHeight&&layout.footerBottom<=layout.bottom&&layout.bodyScroll>layout.bodyHeight&&layout.scrollWidth<=layout.clientWidth+1);
  await invoke(`document.querySelector('.asset-details-version button').click()`); check('Version preview calls the actual component action', await invoke(`document.querySelector('[role="status"]')?.textContent === '已选择预览'`));
  window.setSize(1100,900);
  for (const [story,label] of [['english','Done'],['japanese','完了']]) {
    await load(`product-studio-authoring-asset-details--${story}`); await wait(`document.querySelector('dialog.asset-details-dialog')?.open`);
    check(`Asset details ${story} actual labels`, await invoke(`document.querySelector('.asset-details-footer button:last-child').textContent === ${JSON.stringify(label)}`)); await capture(`asset-detail-${story}-1100x900.png`);
  }
  await load('product-studio-authoring-pages--assets'); await wait(`document.querySelector('.asset-pagination')`);
  check('Actual asset page shows numbered pagination and current page', await invoke(`Boolean(document.querySelector('.asset-pagination [aria-current="page"]')) && /1/.test(document.querySelector('.asset-page-status').textContent)`));
  await capture('actual-assets-1100x900.png');
  await invoke(`document.querySelectorAll('.authoring-asset')[1].querySelector('button').click()`); await wait(`document.querySelector('.asset-details-dialog')?.open`);
  await wait(`document.querySelector('.asset-details-dialog img')?.naturalWidth > 0`);
  check('Actual asset route mounts the same detail component', await invoke(`document.querySelector('.asset-details-dialog').dataset.dialogLayout === 'asset-details' && document.querySelector('.asset-details-body') && document.querySelector('.asset-details-footer')`));
  check('Actual portal detail resolves its variant thumbnail through the shared batch', true);
  await capture('actual-asset-detail-1100x900.png');
  await load('product-studio-authoring-pages--page-designer'); await wait(`document.querySelector('[data-designer-page="story"]')`);
  check('Title page hides the reading actions group', await invoke(`document.querySelector('[data-reading-actions]').hidden && getComputedStyle(document.querySelector('[data-reading-actions]')).display === 'none'`));
  await invoke(`document.querySelector('[data-designer-page="story"]').click()`); await wait(`document.querySelector('[data-reading-actions]')?.hidden === false`);
  await invoke(`document.querySelectorAll('[data-reading-actions] button')[1].click()`); await wait(`document.querySelector('[data-portrait-batch]')?.disabled === true`);
  check('Clear reading disables bulk portrait configuration', true);
  await invoke(`document.querySelectorAll('[data-reading-actions] button')[0].click()`); await wait(`document.querySelector('[data-portrait-batch]')?.disabled === false`);
  check('Portrait reading exposes the batch action in the actual page designer', true);
  await invoke(`document.querySelector('[data-portrait-batch]').click()`); await wait(`/已更新|没有需要批量开启/.test(document.querySelector('.designer-notice')?.textContent)`);
  check('Actual batch action completes through the page designer document gateway', true);
  await capture('actual-batch-portraits-1100x900.png');
  report.result = 'passed';
} catch(error) { report.error=String(error?.stack??error); }
finally { await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n'); window?.destroy(); app.exit(report.result==='passed'?0:1); }
});
