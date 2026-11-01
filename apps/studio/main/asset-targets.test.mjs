import { expect, it, vi } from 'vitest';
const windows = vi.hoisted(() => []);
vi.mock('electron', () => ({ BrowserWindow: class {
  constructor(options) { this.options=options;this.destroy = vi.fn(); this.loadURL = vi.fn();let attached=false;this.webContents = {on:vi.fn(),removeListener:vi.fn(),startPainting:vi.fn(),debugger:{attach:vi.fn(()=>{attached=true;}),isAttached:()=>attached,sendCommand:vi.fn(),detach:vi.fn(()=>{attached=false;})}, executeJavaScript: source => (0, eval)(source) }; windows.push(this); }
} }));
import { verifyAssetPlayback } from './asset-targets.mjs';
const source = text => `data:application/json,${encodeURIComponent(text)}`;
it('validates actual native animation bytes for both target checks and rejects invalid content', async () => {
  const animation = { type: 'galcraft.animation', version: 1, durationMs: 100, tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 100, value: 10, easing: { family: 'linear', direction: 'in' } }] }] };
  for (const target of ['web', 'windows']) {
    expect(await verifyAssetPlayback({ kind: 'animation', metadata: { durationSec: .1 }, target }, source(JSON.stringify(animation)))).toEqual({ ok: true });
    expect((await verifyAssetPlayback({ kind: 'animation', metadata: { durationSec: .1 }, target }, source('{"type":"invalid"}'))).ok).toBe(false);
  }
  expect(windows.every(window => window.destroy.mock.calls.length === 1)).toBe(true);
  for(const window of windows){
    expect(window.options).toMatchObject({show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
    expect(window.webContents.startPainting).toHaveBeenCalledOnce();
    expect(window.webContents.debugger.sendCommand).toHaveBeenCalledWith('Emulation.setFocusEmulationEnabled',{enabled:true});
    expect(window.loadURL.mock.invocationCallOrder[0]).toBeLessThan(window.webContents.debugger.sendCommand.mock.invocationCallOrder[0]);
    expect(window.webContents.removeListener).toHaveBeenCalledWith('paint',window.webContents.on.mock.calls[0][1]);
    expect(window.webContents.debugger.detach).toHaveBeenCalledOnce();
  }
});
