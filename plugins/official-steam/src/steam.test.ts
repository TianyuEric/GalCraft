import { expect, it, vi } from 'vitest';
import type { PluginContext } from '@galcraft/plugins/contracts';
import { createPlugin, createSteamSdkProvider } from './index.js';
import { createPlatformProvider } from './platform.js';
it('requires the saved project AppID and the declared native target before SDK initialization', async () => {
  const context = { pluginId: 'org.galcraft.steam', target: 'windows' as const, arch: 'x64' as const, config: {},
    domain: { projectId: 'ProjAA', kind: 'player' as const, instance: 'default' }, projectPlatform: { steamAppId: null },
    runtime: { releaseDirectory: 'unused', executable: process.execPath } };
  await expect(createPlatformProvider(context)).rejects.toThrow('AppID');
  await expect(createPlatformProvider({ ...context, arch: 'arm64', projectPlatform: { steamAppId: '480' } })).rejects.toThrow('Windows x64');
});
it('reports native SDK submission and preserves failures for retry', async () => {
  const setAchievement=vi.fn().mockResolvedValue(true),storeStats=vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const provider=createSteamSdkProvider({setAchievement,storeStats});
  expect(await provider.invoke('achievement.unlock',{id:'first'})).toMatchObject({ok:false,error:{code:'STEAM_STORE'}});
  expect(await provider.invoke('achievement.unlock',{id:'first'})).toMatchObject({ok:true,value:{status:'submitted',id:'first'}});
  expect(setAchievement).toHaveBeenCalledWith('first');
  expect((await provider.invoke('unknown',{})).ok).toBe(false);
});
it('simulates playtest without native calls, skips web and retries an unavailable Windows action', async () => {
  const unlock = vi.fn().mockResolvedValueOnce({ ok: false, error: { code: 'OFFLINE' }, issues: [] })
    .mockResolvedValue({ ok: true, value: { status: 'unlocked' }, warnings: [] });
  const domain = { projectId: crypto.randomUUID(), kind: 'player' as const, instance: 'default' };
  const web = await createPlugin({ unlock }).activate({ target: 'web' } as PluginContext);
  expect(await web.platform[0]!.invoke('achievement.unlock', { id: 'first' }, domain)).toMatchObject({ value: { status: 'skipped' } });
  const windows = await createPlugin({ unlock }).activate({ target: 'windows' } as PluginContext);
  expect(await windows.platform[0]!.invoke('achievement.unlock', { id: 'first' }, { ...domain, kind: 'playtest' }))
    .toMatchObject({ value: { status: 'simulated' } });
  expect(unlock).not.toHaveBeenCalled();
  expect((await windows.platform[0]!.invoke('achievement.unlock', { id: 'first' }, domain)).ok).toBe(false);
  expect((await windows.platform[0]!.invoke('achievement.unlock', { id: 'first' }, domain)).ok).toBe(true);
});
