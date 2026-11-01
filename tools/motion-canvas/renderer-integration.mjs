import { checkEvidenceBudget, removeWorkspace } from '../../tests/e2e/workspace.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdir, readFile, writeFile, copyFile, rm, symlink, stat, readdir} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {runProcess, probeMedia} from '../media/src/process.mjs';

await checkEvidenceBudget();
const repo = resolve(import.meta.dirname, '../..');
const runtime = resolve(import.meta.dirname, 'runtime');
const work = resolve(repo, 'tmp/testing/motion-canvas');
const evidence = resolve(repo, 'test-results/latest/motion-canvas/MC-T00');
const mediaTools = join(repo, 'tools/media/runtime/bin');
const require = createRequire(join(runtime, 'package.json'));
const {chromium} = require('playwright-core');
const {createServer, createLogger} = await import(pathToFileURL(join(dirname(require.resolve('vite')), 'dist/node/index.js')));
const motionCanvas = require('@motion-canvas/vite-plugin').default;
const report = {executedAt: new Date().toISOString(), records: [], environment: {node: process.version, platform: process.platform, arch: process.arch}, toolchain: {motionCanvas: '3.17.2', vite: '5.4.21', playwright: '1.62.1', exporter: 'GalCraft documented Exporter API + host FFmpeg'}, result: 'running'};

async function clean(directory) {
  assert(directory.startsWith(join(repo, 'tmp/testing') + '\\') || directory === work);
  await rm(directory, {recursive: true, force: true});
}
async function prepare(name, change) {
  const root = join(work, name); await clean(root); await mkdir(join(root, 'public/media'), {recursive: true}); await mkdir(join(root, 'browser'));
  await symlink(join(runtime, 'node_modules'), join(root, 'node_modules'), 'junction');
  for (const file of ['project.ts', 'scene.tsx']) await copyFile(join(import.meta.dirname, 'fixture', file), join(root, file));
  for (const file of ['index.js', 'editor.html']) await copyFile(join(import.meta.dirname, 'browser', file), join(root, 'browser', file));
  await copyFile(join(repo, 'apps/studio/resources/practice/backgrounds/spring-shop.png'), join(root, 'public/media/image.png'));
  await copyFile(join(repo, 'apps/studio/resources/practice/music/spring-01.opus'), join(root, 'public/media/audio.opus'));
  await copyFile(join(repo, 'tools/fonts/cache/NotoSansCJKsc-Regular.otf'), join(root, 'public/media/font.otf'));
  await change?.(root); return root;
}
async function render(name, change, options = {}) {
  const root = await prepare(name, change), frames = join(root, 'frames'); await mkdir(frames);
  const events = [], diagnostics = []; let count = 0, finished, browser, server, browserPids = [];
  const started = performance.now();
  const result = {name, expectedFrames: 360, events, diagnostics};
  try {
    const logger = createLogger('silent');
    logger.error = (message, options) => { const error = options?.error; diagnostics.push({kind: 'compile', message, file: error?.id, location: error?.loc, frame: error?.frame}); finished = 'error'; };
    server = await createServer({root, configFile: false, customLogger: logger, cacheDir: join(root, '.vite'),
      plugins: motionCanvas({project: join(root, 'project.ts').replaceAll('\\', '/'), output: join(root, 'output'), editor: join(root, 'browser/index.js').replaceAll('\\', '/')}),
      server: {host: '127.0.0.1', port: 0, fs: {allow: [repo]}},
    });
    await server.listen();
    browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--disable-dev-shm-usage']});
    report.environment.browser ??= browser.version();
    const cdp = await browser.newBrowserCDPSession();
    browserPids = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(process => process.id);
    const page = await browser.newPage();
    page.on('response', async response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        diagnostics.push({kind: 'http', status: response.status(), url: response.url(), body: (await response.text().catch(() => '')).slice(0, 6000)});
        if (response.status() >= 500) finished = 'error';
      }
    });
    await page.exposeFunction('motionSettings', () => ({width: 960, height: 540, fps: 24, frames: 360, resources: [{alias: 'image', purpose: 'image', uri: '/media/image.png'}, {alias: 'font', purpose: 'font', family: 'GalCraftMotion', uri: '/media/font.otf'}]}));
    await page.exposeFunction('motionEvent', async event => {
      events.push({...event, elapsedMs: Math.round(performance.now() - started)});
      if (event.kind === 'finished') finished = event.result;
      if (event.kind === 'failure') finished = 'error';
    });
    await page.exposeFunction('motionFrame', async ({frame, png, sceneName}) => {
      await writeFile(join(frames, `${String(frame).padStart(6, '0')}.png`), Buffer.from(png, 'base64'));
      count++;
      if (count % 24 === 0) events.push({kind: 'progress', stage: 'rendering', completed: count, total: 360, sceneName});
      if (options.mutate && count === 24) await writeFile(join(work, 'author-scene.tsx'), '// author continues editing after freeze\n');
      if (options.cancel && count === 48) await page.evaluate(() => window.motionAbort());
    });
    page.on('pageerror', error => { diagnostics.push({kind: 'pageerror', message: error.message, stack: error.stack}); finished = 'error'; });
    page.on('console', message => { if (message.type() === 'error') diagnostics.push({kind: 'console', message: message.text()}); });
    await page.goto(server.resolvedUrls.local[0]);
    for (let i = 0; finished === undefined && i < 1800; i++) await new Promise(done => setTimeout(done, 100));
    assert.notEqual(finished, undefined, 'render completion timeout');
    result.rendererResult = finished; result.frames = count;
    if (options.mutate) result.frozenSource = {snapshotPreserved: (await readFile(join(root, 'scene.tsx'), 'utf8')).includes('春日序章'), authorChanged: (await readFile(join(work, 'author-scene.tsx'), 'utf8')).includes('continues editing')};
    if (finished === 0) {
      assert.equal(count, 360, 'exact frame count');
      const localPath = join(evidence, `${name}.mp4`), partialPath = join(root, 'render.part.mp4'), encodingAbort = new AbortController();
      let encoderPid;
      const encoded = await runProcess(join(mediaTools, 'ffmpeg.exe'), ['-hide_banner','-y','-framerate','24','-i',join(frames,'%06d.png'),'-i',join(root,'public/media/audio.opus'),'-map','0:v:0','-map','1:a:0','-frames:v','360','-t','15','-c:v','h264_mf','-pix_fmt','yuv420p','-b:v','2500k','-c:a','aac','-b:a','128k','-movflags','+faststart','-progress','pipe:1',partialPath], {signal: encodingAbort.signal, onSpawn: pid => { encoderPid = pid; }, onProgress: event => { if (event.stream === 'stdout') {events.push({kind: 'encoding', text: event.text}); if (options.cancelEncoding) encodingAbort.abort();} }}).catch(error => { if (options.cancelEncoding && error.code === 'CANCELLED') { result.encodingCancelled = true; return null; } throw error; });
      try { process.kill(encoderPid, 0); result.encoderStopped = false; } catch { result.encoderStopped = true; }
      if (!encoded) return result;
      await copyFile(partialPath, localPath);
      result.encoding = encoded.stderr.slice(-1500); result.probe = await probeMedia(mediaTools, localPath);
      for (const frame of [0, 180, 359]) await copyFile(join(frames, `${String(frame).padStart(6, '0')}.png`), join(evidence, `${name}-${frame}.png`));
      result.output = localPath;
    }
  } catch (error) { result.error = String(error.stack ?? error); }
  finally {
    if (browser?.isConnected()) {const cdp = await browser.newBrowserCDPSession(); browserPids = [...new Set([...browserPids, ...(await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(process => process.id)])];}
    await browser?.close(); await server?.close();
    result.closed = {browser: browser ? !browser.isConnected() : true, server: server ? !server.httpServer.listening : true};
    result.closed.browserProcesses = browserPids.map(pid => {try { process.kill(pid, 0); return {pid, stopped: false}; } catch { return {pid, stopped: true}; }});
    result.durationMs = Math.round(performance.now() - started);
    await clean(root); result.temporaryRemoved = true;
  }
  await writeFile(join(evidence, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({name, frames: count, result: result.rendererResult, error: result.error, diagnostics, durationMs: result.durationMs}));
  return result;
}

await mkdir(evidence, {recursive: true}); await mkdir(work, {recursive: true});
try {
  const successful = await render('success'); report.records.push(successful); assert.equal(successful.rendererResult, 0); assert(!successful.error);
  const repeat = await render('repeat'); report.records.push(repeat); assert.equal(repeat.rendererResult, 0); assert(!repeat.error);
  const frozen = await render('frozen', async root => copyFile(join(root, 'scene.tsx'), join(work, 'author-scene.tsx')), {mutate: true}); report.records.push(frozen); assert.equal(frozen.rendererResult, 0); assert(frozen.frozenSource.snapshotPreserved && frozen.frozenSource.authorChanged);
  const oldCandidate = await readFile(successful.output);
  const encodingCancel = await render('encoding-cancel', null, {cancelEncoding: true}); report.records.push(encodingCancel); assert(encodingCancel.encodingCancelled && encodingCancel.encoderStopped);
  const cancelled = await render('cancel', null, {cancel: true}); report.records.push(cancelled); assert.equal(cancelled.rendererResult, 2); assert(cancelled.frames >= 48 && cancelled.frames < 360);
  const compile = await render('compile-error', async root => writeFile(join(root, 'scene.tsx'), 'export default function broken( { \n')); report.records.push(compile); assert.equal(compile.rendererResult, 'error');
  const missing = await render('missing-image', async root => rm(join(root, 'public/media/image.png'))); report.records.push(missing); assert.equal(missing.rendererResult, 'error');
  assert((await readFile(successful.output)).equals(oldCandidate));
  report.oldCandidatePreserved = true;
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.error = String(error.stack ?? error); process.exitCode = 1; }
finally { await removeWorkspace(work); await checkEvidenceBudget(); await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({result: report.result, error: report.error})); }
