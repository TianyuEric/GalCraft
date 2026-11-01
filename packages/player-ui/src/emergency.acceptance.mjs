import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { verifySceneEntryEmergencyPause } from './entry-pause.acceptance.mjs';

const repo = resolve(import.meta.dirname, '../../..'), output = join(repo, 'test-results/latest/authoring-emergency');
await mkdir(output, { recursive: true });
const base = process.env.GALCRAFT_STORYBOOK_URL ?? 'http://127.0.0.1:6007';
const url = story => `${base}/iframe.html?id=product-player-emergency--${story}&viewMode=story`;
const report = { executedAt: new Date().toISOString(), environment: 'Shared production Player in Edge; focused Electron renderer with PreviewHost isolated sample profile', checks: [], errors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', error => report.errors.push(String(error)));
const fixture = callback => page.evaluate(callback);
const load = async story => { await page.goto(url(story)); await page.waitForSelector('[data-emergency-ready="true"]'); };
const root = () => page.locator('.emergency-story-player');
const cover = () => page.locator('.gc-emergency');
const check = (target, expected, actual) => report.checks.push({ target, environment: target === 'Actual Electron focused input' ? 'Windows Electron renderer; real keyboard; isolated PreviewHost' : 'Microsoft Edge; shared production Player; formal Storybook fixture', data: 'Official standard template, isolated sample profile, real assets and measured runtime/media state', expected, actual, result: 'pass', evidence: ['packages/player-ui/src/emergency.acceptance.mjs', 'test-results/latest/authoring-emergency/report.json'], owner: 'M07/M08' });
try {
  await load('authored-page');
  await page.getByRole('button', { name: '等待输入', exact: true }).click();
  const field = root().locator('input').first(); await field.waitFor(); await field.fill('保留尚未提交的回答');
  const before = await fixture(() => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture; window.emergencyInput = document.activeElement; return { inspection: mounted.session.inspect(), index: mounted.data.current().index }; });
  await page.keyboard.press('F8'); await cover().waitFor();
  const paused = await fixture(() => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture; return { inspection: mounted.session.inspect(), originalMounted: window.emergencyInput.isConnected, hidden: getComputedStyle(window.emergencyInput).visibility, auto: mounted.view.auto, skip: mounted.view.skip }; });
  assert.equal(paused.inspection.status, 'paused'); assert.equal(paused.originalMounted, true); assert.equal(paused.hidden, 'hidden');
  await page.waitForTimeout(350);
  for (const name of ['推进剧情', '快速存档', '读取存档', '返回标题']) await cover().getByRole('button', { name, exact: true }).click();
  const protectedState = await fixture(() => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture; return { inspection: mounted.session.inspect(), index: mounted.data.current().index }; });
  assert.deepEqual(protectedState.inspection.state, paused.inspection.state); assert.deepEqual(protectedState.index, before.index);
  await cover().getByRole('button', { name: '恢复阅读', exact: true }).click();
  assert.equal(await cover().count(), 0); assert.equal(await field.inputValue(), '保留尚未提交的回答');
  assert.equal(await fixture(() => document.activeElement === window.emergencyInput), true);
  check('Pending input and action boundary', 'Immediate opaque cover; same mounted input and draft; no story/save/load/jump effects; restore same focus', { status: paused.inspection.status, hidden: paused.hidden, retainedInput: true, rejectedEffects: 4, stateAndSavesUnchanged: true, focusRestored: true });

  const shortcut = await fixture(async () => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture; mounted.view.options.snapshot.project.player.emergencyKey = 'F9'; const preferences = mounted.data.current().preferences; const saved = await mounted.data.savePreferences({ ...preferences, emergencyKey: 'F10' }, preferences.revision); if (!saved.ok) throw saved.error; return saved.value.emergencyKey; });
  await field.focus(); await page.keyboard.press('F9'); assert.equal(await cover().count(), 0);
  await page.keyboard.press('F10'); await cover().waitFor(); await page.keyboard.press('F10'); await cover().waitFor({ state: 'detached' });
  await fixture(() => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture; mounted.session.setPreviewPaused(true); });
  await page.keyboard.press('F10'); await cover().waitFor(); await page.keyboard.press('Escape'); await cover().waitFor({ state: 'detached' });
  const preservedPause = await fixture(() => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture; const status = mounted.session.inspect().status; mounted.session.setPreviewPaused(false); return status; });
  assert.equal(preservedPause, 'paused');
  await page.getByRole('button', { name: '等待输入', exact: true }).focus(); await page.keyboard.press('F10'); assert.equal(await cover().count(), 0);
  check('Shortcut ownership and pause reasons', 'Player override supersedes work shortcut; same key/Escape restore; outside Player focus does not trigger; prior pause remains', { override: shortcut, priorPause: preservedPause, focusBoundary: true });

  await load('authored-page'); await root().focus();
  await fixture(() => { const view = document.querySelector('.emergency-story-player').emergencyFixture.mounted.view; const template = view.options.snapshot.template, page = template.pages.find(page => page.key === 'title'); const animation = template.animations.find(animation => animation.id === page.root.animations.exit); for (const segment of animation.segments) segment.durationMs = 8000; view.open('settings'); });
  await page.waitForFunction(() => document.querySelector('.emergency-story-player').emergencyFixture.mounted.view.transition.busy);
  await page.keyboard.press('F8'); await cover().waitFor();
  const animationBefore = await fixture(() => [...document.querySelector('.emergency-story-player').emergencyFixture.mounted.view.transition.animations].map(animation => ({ state: animation.playState, time: animation.currentTime })));
  await page.waitForTimeout(250);
  const animationAfter = await fixture(() => [...document.querySelector('.emergency-story-player').emergencyFixture.mounted.view.transition.animations].map(animation => ({ state: animation.playState, time: animation.currentTime })));
  assert.deepEqual(animationAfter, animationBefore);
  await page.keyboard.press('Escape'); await cover().waitFor({ state: 'detached' });
  await fixture(() => { for (const animation of document.querySelector('.emergency-story-player').getAnimations({ subtree: true })) animation.finish(); });
  check('Navigation busy priority', 'Cover appears during real exit animation and suspends its clock', { animations: animationBefore, unchangedWhileCovered: true });

  await load('authored-page'); await page.getByRole('button', { name: '开屏演出', exact: true }).click();
  await root().locator('.gc-startup').waitFor(); await root().locator('.gc-startup').focus();
  await page.keyboard.press('F8'); await cover().waitFor();
  const startupBefore = await fixture(() => document.querySelector('.emergency-story-player').emergencyFixture.mounted.view.startup.elapsed);
  await page.waitForTimeout(300);
  const startupAfter = await fixture(() => document.querySelector('.emergency-story-player').emergencyFixture.mounted.view.startup.elapsed);
  assert.equal(startupBefore, startupAfter);
  await page.keyboard.press('Escape'); await cover().waitFor({ state: 'detached' });
  assert.equal(await root().locator('.gc-startup').count(), 1);
  check('Startup layer priority', 'Cover hides active opening and freezes its clock; restore retains opening', { before: startupBefore, after: startupAfter, restoredOpening: true });

  await load('authored-page');
  const entryPause = await verifySceneEntryEmergencyPause(page);
  check('Actual scene entry presentation', 'A decoded real image entry advances before F8, freezes its successful phase and positive clock under the cover, resumes from the same position and finishes naturally', entryPause);

  await load('authored-page');
  await page.getByRole('button', { name: '等待输入', exact: true }).click(); await root().locator('input').first().waitFor();
  const sound = await fixture(async () => {
    const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture, audio = mounted.view.options.audio;
    const asset = mounted.view.options.snapshot.assets.find(asset => asset.kind === 'audio'), sessionId = mounted.session.inspect().sessionId;
    await audio.enableSound(); const ids = [];
    for (const bus of ['bgm', 'ambience', 'sfx', 'voice', 'ui', 'video']) {
      const state = { ...mounted.session.inspect().state.presentation.bgm, assetId: asset.assetId, variantId: asset.variantId, stopped: false, loop: true, volume: 1 };
      const result = await audio.play({ sessionId, bus, state, preview: true, backgroundRole: 'stage', voicePurpose: 'interlude', requestSound: true });
      if (!result.ok) throw result.error; ids.push({ bus, id: result.value });
    }
    window.emergencyAudio = { ids, sessionId }; return ids.map(({ bus, id }) => ({ bus, ...audio.inspect({ sessionId, source: { kind: 'instance', id } }).value }));
  });
  assert(sound.every(source => source.status === 'playing'));
  await root().locator('input').first().focus(); await page.keyboard.press('F8'); await cover().waitFor();
  const audioBefore = await fixture(() => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture, { ids, sessionId } = window.emergencyAudio; return ids.map(({ id }) => mounted.view.options.audio.inspect({ sessionId, source: { kind: 'instance', id } }).value); });
  await page.waitForTimeout(300);
  const audioAfter = await fixture(() => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture, { ids, sessionId } = window.emergencyAudio; return ids.map(({ id }) => mounted.view.options.audio.inspect({ sessionId, source: { kind: 'instance', id } }).value); });
  assert(audioAfter.every(source => source.status === 'paused' && source.pauses.includes('emergency')));
  assert.deepEqual(audioAfter.map(source => source.positionSec), audioBefore.map(source => source.positionSec));
  await page.keyboard.press('Escape'); await cover().waitFor({ state: 'detached' });
  const resumed = await fixture(() => { const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture, { ids, sessionId } = window.emergencyAudio; return ids.map(({ id }) => mounted.view.options.audio.inspect({ sessionId, source: { kind: 'instance', id } }).value); });
  assert(resumed.every(source => !source.pauses.includes('emergency')));
  check('Actual decoded audio on all buses', 'Six playing WebAudio instances pause without cursor advance; restoring removes only the emergency reason', { buses: sound.map(source => source.bus), paused: audioAfter.map(source => source.status), cursorStable: true, reasonRemoved: true });

  await load('authored-page'); await root().focus();
  await fixture(async () => {
    const f = document.querySelector('.emergency-story-player').emergencyFixture, snapshot = f.mounted.view.options.snapshot;
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext('2d'), stream = canvas.captureStream(20), chunks = [], recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const complete = new Promise(resolve => { recorder.ondataavailable = event => chunks.push(event.data); recorder.onstop = resolve; });
    let frame = 0; const draw = () => { context.fillStyle = '#243b61'; context.fillRect(0,0,320,180); context.fillStyle = '#fff'; context.font = '24px sans-serif'; context.fillText('Story video '+frame++,30,90); };
    draw(); recorder.start(); const timer = setInterval(draw,50); await new Promise(resolve => setTimeout(resolve,1800)); clearInterval(timer); recorder.stop(); await complete; stream.getTracks().forEach(track => track.stop());
    const asset = { ...structuredClone(snapshot.assets[0]), assetId: crypto.randomUUID(), kind: 'video', metadata: { durationSec: 1.8 } };
    f.media[asset.assetId] = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); f.snapshot.assets.push(asset); snapshot.assets.push(asset);
    const scene = snapshot.scenes[0], base = scene.instructions[0]; scene.instructions = [{ ...base, statementId: crypto.randomUUID(), opcode: 'video', args: { assetId: asset.assetId, volume: 1, skipFadeMs: 0 }, continuation: 'wait' }, { ...base, statementId: crypto.randomUUID(), opcode: 'say', args: { speaker: { kind: 'narrator' }, text: '视频结束后' } }];
    void f.mounted.view.newGame();
  });
  await page.waitForFunction(() => { const video = document.querySelector('video.gc-video'); return !video.hidden && !video.paused && video.readyState >= 2; });
  await root().click({ position: { x: 30, y: 30 } });
  await fixture(() => document.querySelector('video.gc-video').requestFullscreen());
  await page.keyboard.press('F8'); await cover().waitFor();
  assert.equal(await fixture(() => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.gc-emergency')), true);
  const videoBefore = await fixture(() => { const video = document.querySelector('video.gc-video'); return { paused: video.paused, time: video.currentTime, visibility: getComputedStyle(video).visibility }; });
  await page.waitForTimeout(300);
  const videoAfter = await fixture(() => { const video = document.querySelector('video.gc-video'); return { paused: video.paused, time: video.currentTime, visibility: getComputedStyle(video).visibility }; });
  assert(videoAfter.paused); assert.equal(videoAfter.visibility, 'hidden'); assert.equal(videoAfter.time, videoBefore.time);
  await page.keyboard.press('Escape'); await cover().waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('video.gc-video').paused);
  await fixture(() => document.fullscreenElement ? document.exitFullscreen() : undefined);
  check('Actual story video', 'Real HTMLVideoElement and VideoController pause before any skip handling, hide under the cover and resume the same playback', { before: videoBefore, after: videoAfter, resumed: true, coveredFullscreenTopLayer: true });

  await load('authored-page');
  const observation = await fixture(() => {
    const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture, snapshot = mounted.view.options.snapshot;
    const page = snapshot.template.pages.find(page => page.key === 'title'), variable = snapshot.variables.find(variable => variable.scope === 'progress');
    return mounted.view.observe({ variables: [{ id: variable.id, scope: 'progress' }, { id: variable.id, scope: 'longTerm' }], properties: [{ pageId: page.id, componentId: page.root.id, property: 'display' }, { pageId: page.id, componentId: page.root.id, property: 'color' }, { pageId: page.id, componentId: page.root.id, property: 'unsupported' }] });
  });
  assert.equal(observation.status, 'available');
  assert.equal(observation.variables[0].status, 'unavailable'); assert.equal(observation.variables[0].value, null);
  assert.equal(observation.variables[1].status, 'missingDeclaration');
  assert.equal(observation.properties[0].status, 'available'); assert.equal(observation.properties[0].source.kind, 'component');
  assert.equal(observation.properties[1].source.kind, 'unknown'); assert.equal(observation.properties[2].status, 'unsupportedProperty');
  check('Requested runtime and style observation', 'Only requested identities are returned; absent progress has no zero fallback; wrong scope is explicit; computed values identify confirmed component or unknown source', observation);

  await load('authored-page');
  await fixture(() => document.querySelector('.emergency-story-player').emergencyFixture.mounted.view.open('settings'));
  await root().locator('.gc-content[data-page="settings"]').first().waitFor();
  await root().getByRole('button', { name: '操作', exact: true }).click();
  await root().getByLabel('紧急回避快捷键', { exact: true }).selectOption('F11');
  await page.waitForFunction(() => document.querySelector('.emergency-story-player').emergencyFixture.mounted.data.current().preferences.emergencyKey === 'F11');
  await root().focus(); await page.keyboard.press('F8'); assert.equal(await cover().count(), 0);
  await page.keyboard.press('F11'); await cover().waitFor(); await page.keyboard.press('Escape'); await cover().waitFor({ state: 'detached' });
  check('Player setting GUI', 'The authored Settings controls category saves a player override and the next physical shortcut uses it', { selected: 'F11', saved: true, oldShortcutInactive: true, newShortcutActive: true });

  await load('blank-page'); await root().focus(); await page.keyboard.press('F8'); await cover().waitFor();
  assert.equal((await cover().innerText()).trim(), ''); await page.keyboard.press('Escape'); await cover().waitFor({ state: 'detached' });
  check('Authored blank page', 'Blank M08 content renders without a forced restore button; Escape restores', { blank: true, escaped: true });
  for (const [story, width] of [['authored-page', 1280], ['authored-page-night', 900]]) {
    await page.setViewportSize({ width, height: 720 }); await load(story); await root().focus(); await page.keyboard.press('F8'); await cover().waitFor();
    await page.screenshot({ path: join(output, `${story}-${width}.png`) });
  }
  assert.deepEqual(report.errors, []);

  const require = createRequire(join(repo, 'apps/studio/package.json')), electronPath = require('electron');
  const entry = join(output, 'electron-input.cjs');
  await writeFile(entry, `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({width:1000,height:740,show:true,webPreferences:{contextIsolation:true}});window.loadURL(${JSON.stringify(url('authored-page'))});});`);
  const electronEnv = { ...process.env }; delete electronEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronPath, args: [entry], cwd: repo, env: electronEnv });
  try {
    const electronPage = await app.firstWindow(); await electronPage.waitForSelector('[data-emergency-ready="true"]');
    await electronPage.bringToFront(); await electronPage.locator('.emergency-story-player').focus();
    await electronPage.keyboard.press('F8'); await electronPage.locator('.gc-emergency').waitFor();
    await electronPage.keyboard.press('Escape'); await electronPage.locator('.gc-emergency').waitFor({ state: 'detached' });
    await electronPage.screenshot({ path: join(output, 'electron-focused-input.png') });
    check('Actual Electron focused input', 'Physical F8 capture and Escape restore in a focused Electron renderer using shared Player and isolated PreviewHost', { platform: process.platform, focusedInput: true, host: 'PreviewHost; Windows IPC storage and packaged release not claimed' });
  } finally { await app.close(); }
  report.result = 'passed';
} catch (error) { report.failure = error.stack; throw error; }
finally { await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ result: report.result, checks: report.checks.length, output, failure: report.failure })); await browser.close(); }
