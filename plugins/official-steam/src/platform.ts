/// <reference types="node" />
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Json, Result } from '@galcraft/contracts';
import type { NativePlatformContext, NativePlatformProvider } from '@galcraft/plugins/contracts';
export { createSteamSdkProvider } from './native.js';

const failure = (code: string, message: string): Result<Json> => { const error = { code, message, owner: 'M09' as const, severity: 'error' as const, related: [], actions: ['retry' as const] }; return { ok: false, error, issues: [error] }; };

/** steamworks.js 0.4.0 has no shutdown export. Its child lifetime owns the native SDK and callback pump. */
export async function createPlatformProvider(context: NativePlatformContext): Promise<NativePlatformProvider> {
  const appId = context.projectPlatform?.steamAppId;
  if (context.target !== 'windows' || context.arch !== 'x64') throw new Error('Steam native runtime supports Windows x64.');
  if (typeof appId !== 'string' || !/^[1-9]\d*$/.test(appId) || Number(appId) > 0xffffffff) throw new Error('Set a valid Steam AppID in the project platform settings.');
  if (context.domain.kind !== 'player') throw new Error('Steam native initialization requires a player domain.');
  const child = fork(fileURLToPath(new URL(/* @vite-ignore */ './steam-worker.mjs', import.meta.url)), [], {
    execPath: context.runtime.executable, execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  const pending = new Map<number, (result: Result<Json>) => void>(); let sequence = 0, closed = false;
  let startupResolve: () => void, startupReject: (error: Error) => void;
  const startup = new Promise<void>((resolve, reject) => { startupResolve = resolve; startupReject = reject; });
  const timer = setTimeout(() => { child.kill(); startupReject(new Error('Steam SDK initialization timed out.')); }, 12000);
  const stopped = () => { closed = true; clearTimeout(timer); startupReject(new Error('Steam SDK process stopped. Check the Steam client and AppID.')); for (const resolve of pending.values()) resolve(failure('STEAM_UNAVAILABLE', 'Steam SDK process stopped.')); pending.clear(); };
  child.once('error', stopped); child.once('exit', stopped);
  child.on('message', (message: { type?: string; id?: number; result?: Result<Json>; message?: string }) => {
    if (message.type === 'ready') { clearTimeout(timer); startupResolve(); }
    if (message.type === 'error') { clearTimeout(timer); startupReject(new Error(message.message ?? 'Steam SDK could not initialize.')); child.kill(); }
    if (message.type === 'result' && message.id !== undefined && message.result) { pending.get(message.id)?.(message.result); pending.delete(message.id); }
  });
  child.send({ type: 'init', appId: Number(appId) });
  await startup;
  return {
    invoke: (action, args) => closed ? Promise.resolve(failure('STEAM_UNAVAILABLE', 'Steam SDK is closed.')) : new Promise(resolve => {
      const id = ++sequence; pending.set(id, resolve); child.send({ type: 'invoke', id, action, args }, error => { if (error) { pending.delete(id); resolve(failure('STEAM_UNAVAILABLE', error.message)); } });
    }),
    dispose: async () => {
      if (closed) return;
      await new Promise<void>(resolve => { const timeout = setTimeout(() => { child.kill(); resolve(); }, 3000); child.once('exit', () => { clearTimeout(timeout); resolve(); }); child.send({ type: 'close' }); });
    },
  };
}
