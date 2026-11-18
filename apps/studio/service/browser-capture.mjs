import { chromium, _electron } from 'playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CollaborationError } from '@galcraft/collaboration';
import { parseAnimationResource } from '@galcraft/contracts';
import { compileCollaborationProject } from '../main/collaboration-compile.mjs';
import { resolvePreviewEventSource } from '../main/collaboration-preview-target.ts';
import { exercisePluginStage } from '../main/asset-stage-targets.mjs';
import { awaitPreviewCapture } from '../main/preview-capture-protocol.ts';

/** One service-owned Chromium; every inspection gets an isolated Player profile. */
export function createBrowserCapture({ origin, host: getHost, executablePath = process.env.GALCRAFT_CHROMIUM_PATH }) {
  let browser, opening;
  function runtime(){
    const electronPath=process.env.GALCRAFT_ELECTRON_PATH;
    if(electronPath)return {ready:existsSync(electronPath),kind:'electron',executablePath:electronPath,prepare:null};
    if(executablePath)return {ready:existsSync(executablePath),kind:'configured',executablePath,prepare:'galcraft-studio prepare-browser'};
    const candidates=process.platform==='win32'?[join(process.env.PROGRAMFILES??'','Google/Chrome/Application/chrome.exe'),join(process.env['PROGRAMFILES(X86)']??'','Microsoft/Edge/Application/msedge.exe'),join(process.env.LOCALAPPDATA??'','Google/Chrome/Application/chrome.exe')]:process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']:['/usr/bin/google-chrome','/usr/bin/microsoft-edge','/usr/bin/chromium','/usr/bin/chromium-browser'];
    const system=candidates.find(path=>existsSync(path)),prepared=chromium.executablePath();
    return {ready:!!system||existsSync(prepared),kind:system?'system':'prepared',executablePath:system??prepared,prepare:'galcraft-studio prepare-browser'};
  }
  async function currentBrowser() {
    if (browser?.isConnected()) return browser;
    if (!opening) opening = chromium.launch({ headless: true, executablePath:runtime().executablePath, args: ['--autoplay-policy=no-user-gesture-required'] })
      .then(value => browser = value)
      .catch(error => { throw new CollaborationError('BROWSER_RUNTIME_UNAVAILABLE', `Studio browser runtime is unavailable: ${String(error.message).split('\n')[0]}. Run galcraft-studio prepare-browser, or set GALCRAFT_CHROMIUM_PATH to the prepared Chromium executable.`); })
      .finally(() => opening = null);
    return opening;
  }
  async function withPage(viewport, work) {
    const electronPath=process.env.GALCRAFT_ELECTRON_PATH;
    if(electronPath){
      const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
      const app=await _electron.launch({executablePath:electronPath,args:[...(process.env.GALCRAFT_ELECTRON_APP?[process.env.GALCRAFT_ELECTRON_APP]:[]),'--galcraft-capture-helper',`--galcraft-capture-origin=${origin}`],env,timeout:30000});
      try{const page=await app.firstWindow();await page.waitForLoadState();await page.setViewportSize(viewport);const focus=await page.context().newCDPSession(page);await focus.send('Emulation.setFocusEmulationEnabled',{enabled:true});return await work(page);}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
    }
    const context = await (await currentBrowser()).newContext({ viewport });
    try { return await work(await context.newPage()); } finally { await context.close(); }
  }
  /** @param {import('../main/preview-capture-protocol.js').PreviewCaptureOptions} options */
  async function capture(input, options = {}) {
    const host = getHost(), production = host.production, context = await production.current();
    if (options.project && options.project !== context.project) throw new CollaborationError('BLUEPRINT_STALE', 'The project changed before preview.');
    options.signal?.throwIfAborted();
    const compiled = await compileCollaborationProject({ production, plugins: host.plugins }, context.project, { template: options.template });
    if (!compiled.snapshot) return { reached: false, issues: compiled.issues, snapshotId: null };
    options.signal?.throwIfAborted();
    const snapshot = compiled.snapshot;
    const eventSource = resolvePreviewEventSource(snapshot, input);
    return withPage(snapshot.project.canvas, async page => {
      const pending = new Set(), engineHandles = new Set();
      await page.exposeBinding('__galcraftNodeCall', (_source, group, method, args) => {
        const work = host.call(group, method, ...args).then(result => {
          if (group === 'engines' && result.ok) {
            if (method === 'resolvePreview') engineHandles.add(result.value.handleId);
            if (method === 'releasePreview') engineHandles.delete(args[0]);
          }
          return result;
        });
        pending.add(work);
        return work.finally(() => pending.delete(work));
      });
      await page.addInitScript(methods => {
        window.studioBridge = Object.fromEntries(Object.entries(methods).map(([group, names]) => [group, Object.fromEntries(names.map(method => [method, (...args) => window.__galcraftNodeCall(group, method, args)]))]));
      }, Object.fromEntries(Object.entries(host.handlers).map(([group, methods]) => [group, Object.keys(methods)])));
      try {
        await page.goto(`${origin}/?collaborationCapture=1`);
        await page.waitForFunction(() => !!window.__galcraftCollaborationCapture, null, { timeout: 30000 });
        options.signal?.throwIfAborted();
        const observation = await awaitPreviewCapture(page.evaluate(payload => window.__galcraftCollaborationCapture.capture(payload), { snapshot, input }), options.signal);
        if (!observation.reached) return { ...observation, issues: [...compiled.issues, ...observation.issues ?? []] };
        if (eventSource) observation.eventSource = eventSource;
        if(input.observation || input.blueprintTrigger)return {...observation,issues:[...compiled.issues,...observation.issues??[]]};
        const pixels = await page.screenshot({ type: 'png', animations: 'disabled' });
        return { ...observation, pixels, mime: 'image/png', ...snapshot.project.canvas, issues: [...compiled.issues, ...observation.issues ?? []] };
      } finally {
        await awaitPreviewCapture(page.evaluate(() => window.__galcraftCollaborationCapture?.dispose()), undefined, 3000).catch(() => {});
        await Promise.allSettled([...pending]);
        await Promise.allSettled([...engineHandles].map(handle => host.call('engines', 'releasePreview', handle)));
      }
    });
  }
  async function verifyAssetPlayback(asset, uri, model = null, stage = null) {
    if (!stage && !['image', 'texture', 'audio', 'video', 'font', 'live2d', 'animation'].includes(asset.kind)) return { ok: false, reason: '需要对应资源提供方的目标验证' };
    if (asset.kind === 'live2d' && !stage) return { ok: false, reason: '需要锁定的 Cubism 运行时' };
    return withPage({ width: 1280, height: 720 }, async page => {
      await page.route(`${origin}/__galcraft-media-inspection`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' }));
      await page.goto(`${origin}/__galcraft-media-inspection`);
      const result = await page.evaluate(async ({ kind, uri, stage, exercise }) => {
        let animationText, timer;
        const check = async () => {
          if (stage) await (0, eval)(`(${exercise})`)(stage);
          else if (kind === 'image' || kind === 'texture') { const image = new Image(); image.src = uri; await image.decode(); if (!image.naturalWidth) throw new Error('Empty image'); }
          else if (kind === 'audio') { const audio = new AudioContext(); try { const response = await fetch(uri); const decoded = await audio.decodeAudioData(await response.arrayBuffer()); if (!decoded.length) throw new Error('Empty audio'); } finally { await audio.close(); } }
          else if (kind === 'font') await new FontFace('release-check', `url("${uri}")`).load();
          else if (kind === 'animation') { const response = await fetch(uri); if (!response.ok) throw new Error(`Animation resource HTTP ${response.status}`); animationText = await response.text(); }
          else { const video = document.createElement('video'); video.muted = true; video.src = uri; try { await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('Video decode failed')); video.load(); }); } finally { video.removeAttribute('src'); video.load(); } }
        };
        try { await Promise.race([check(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Media decode timed out')), 20000); })]); return { ok: true, animationText }; }
        catch (error) { return { ok: false, reason: String(error) }; } finally { clearTimeout(timer); }
      }, { kind: asset.kind, uri, stage, exercise: exercisePluginStage.toString() });
      if (result.ok && asset.kind === 'animation' && !stage) { const parsed = parseAnimationResource(result.animationText); return parsed.ok ? { ok: true } : { ok: false, reason: parsed.error.message }; }
      return result;
    });
  }
  return { capture, verifyAssetPlayback, withPage, readiness:()=>({...runtime(),reason:runtime().ready?null:'Prepare a supported browser before capture. Non-browser authoring remains available.'}), async close() { await opening; await browser?.close(); browser = null; } };
}
