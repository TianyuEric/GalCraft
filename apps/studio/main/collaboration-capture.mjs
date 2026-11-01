import { CollaborationError } from '@galcraft/collaboration';
import { compileCollaborationProject } from './collaboration-compile.mjs';

/** Captures the exact installed Player in an isolated preview window and profile. */
export function createCollaborationCapture({ createWindow, production, plugins }) {
  return async input => {
    const context = await production.current();
    const compiled = plugins ? {ok:true,value:await compileCollaborationProject({production,plugins},context.project)} : await production.language.compile(production.scriptCompileInput(context.project), { publish: false });
    if (!compiled.ok) throw new CollaborationError(compiled.error.code, compiled.error.message);
    if (!compiled.value.snapshot) return { reached: false, issues: compiled.value.issues, snapshotId: null };
    const snapshot = compiled.value.snapshot;
    let window, timeout;
    const keepPainting=()=>{};
    try {
      window = await createWindow();
      window.setContentSize(snapshot.project.canvas.width, snapshot.project.canvas.height);
      window.webContents.setAudioMuted(true);
      // Offscreen Chromium advances Player frame callbacks while painting is consumed.
      window.webContents.on('paint',keepPainting);
      window.webContents.startPainting();
      // Inspection has virtual focus so hidden Chromium keeps the Player's frame loop active.
      window.webContents.debugger.attach('1.3');
      await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
      const work = window.webContents.executeJavaScript(`window.__galcraftCollaborationCapture.capture(${JSON.stringify({ snapshot, input })})`);
      const observation = await Promise.race([work, new Promise((_, reject) => { timeout = setTimeout(async () => { const phase = await window.webContents.executeJavaScript('document.querySelector("#app")?.dataset.capturePhase').catch(() => 'windowClosed'); reject(new CollaborationError('PREVIEW_TIMEOUT', `Player capture timed out (${phase}). Query the original callId; a new capture uses a new callId.`)); }, 45000); })]);
      if (!observation.reached) return { ...observation, issues: [...compiled.value.issues, ...observation.issues ?? []] };
      if(input.observation)return {...observation,issues:[...compiled.value.issues,...observation.issues??[]]};
      clearTimeout(timeout);
      await new Promise((resolve,reject)=>{
        const contents=window.webContents;
        const failed=setTimeout(()=>{contents.removeListener('paint',paint);reject(new CollaborationError('PREVIEW_PAINT_TIMEOUT','The Player compositor did not produce a frame.'));},10000);
        const paint=()=>{clearTimeout(failed);contents.removeListener('paint',paint);resolve();};
        contents.on('paint',paint);contents.invalidate();
      });
      const pixels=await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
      if (pixels.isEmpty()) throw new CollaborationError('PREVIEW_PIXELS_EMPTY', 'Player has no readable pixels. Check its engine and asset diagnostics.');
      return { ...observation, pixels: pixels.toPNG(), mime: 'image/png', ...pixels.getSize(), issues: [...compiled.value.issues, ...observation.issues ?? []] };
    } finally {
      clearTimeout(timeout);
      if (window && !window.isDestroyed()) {
        window.webContents.removeListener('paint',keepPainting);
        await window.webContents.executeJavaScript('window.__galcraftCollaborationCapture?.dispose()').catch(() => {});
        if(window.webContents.debugger.isAttached())window.webContents.debugger.detach();
        window.destroy();
      }
    }
  };
}
