import { BrowserWindow } from 'electron';
import { parseAnimationResource } from '@galcraft/contracts';
import { exercisePluginStage } from './asset-stage-targets.mjs';
export async function verifyAssetPlayback(asset, uri, model = null, stage = null) {
  if (!stage && !['image', 'texture', 'audio', 'video', 'font', 'live2d', 'animation'].includes(asset.kind)) return { ok: false, reason: '需要对应资源提供方的目标验证' };
  if (asset.kind === 'live2d' && !stage) return { ok: false, reason: '需要锁定的 Cubism 运行时' };
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true, backgroundThrottling: false } });
  const keepPainting=()=>{};
  try {
    // Hidden image.decode() needs an active Chromium rendering lifecycle.
    window.webContents.on('paint',keepPainting);
    window.webContents.startPainting();
    await window.loadURL('data:text/html,<meta charset="utf-8"><body></body>');
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
    const result = await window.webContents.executeJavaScript(`(async()=>{
      const uri=${JSON.stringify(uri)}, kind=${JSON.stringify(asset.kind)}, model=${JSON.stringify(model)}, stage=${JSON.stringify(stage)};
      let capabilities, animationText;
      const check=async()=>{
        if(stage) { await (${exercisePluginStage.toString()})(stage); }
        else if(kind==='image'||kind==='texture'){const image=new Image();image.src=uri;await image.decode();if(!image.naturalWidth)throw new Error('Empty image');}
        else if(kind==='audio'){const context=new AudioContext();try{const response=await fetch(uri);const audio=await context.decodeAudioData(await response.arrayBuffer());if(!audio.length)throw new Error('Empty audio');}finally{await context.close();}}
        else if(kind==='font'){const face=new FontFace('release-check','url("'+uri+'")');await face.load();}
        else if(kind==='animation'){const response=await fetch(uri);if(!response.ok)throw new Error('Animation resource HTTP '+response.status);animationText=await response.text();}
        else {const video=document.createElement('video');video.muted=true;video.src=uri;try{await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('Video decode failed'));video.load();});}finally{video.removeAttribute('src');video.load();}}
      };
      let timer;try{await Promise.race([check(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Media decode timed out')),20000);})]);return {ok:true,capabilities,animationText};}catch(error){return {ok:false,reason:String(error)};}finally{clearTimeout(timer);}
    })()`);
    if (result.ok && asset.kind === 'animation' && !stage) {
      const parsed = parseAnimationResource(result.animationText);
      return parsed.ok ? { ok: true } : { ok: false, reason: parsed.error.message };
    }
    return result;
  } finally {
    window.webContents.removeListener('paint',keepPainting);
    if(window.webContents.debugger.isAttached())window.webContents.debugger.detach();
    window.destroy();
  }
}
