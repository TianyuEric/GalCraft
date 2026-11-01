import { expect, it } from 'vitest';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { steamConfigurationCheck } from './services.js';

it('checks the saved AppID through the public publish-check port and keeps optional actions optional', async () => {
  const snapshot = structuredClone(FixtureSnapshot);
  snapshot.project.platform.steamAppId = null;
  const input = { snapshot, lock: snapshot.lock, target: 'windows' as const, settings: { platformPolicy: { 'org.galcraft.steam/achievement': 'required' } } };
  expect(await steamConfigurationCheck.check(input)).toMatchObject([{ code: 'STEAM_APP_ID', severity: 'error' }]);
  snapshot.project.platform.steamAppId = '480'; expect(await steamConfigurationCheck.check(input)).toEqual([]);
  snapshot.project.platform.steamAppId = '4294967296'; expect(await steamConfigurationCheck.check(input)).toMatchObject([{ code: 'STEAM_APP_ID' }]);
  expect(await steamConfigurationCheck.check({ ...input, target: 'web' })).toEqual([]);
  snapshot.project.platform.steamAppId = null;
  snapshot.scenes[0]!.instructions.push({ ...snapshot.scenes[0]!.instructions[0]!, opcode: 'callSteam', args: { unavailable: 'optional' } });
  expect(await steamConfigurationCheck.check({ ...input, settings: {} })).toMatchObject([{ code: 'STEAM_APP_ID', severity: 'warning', message: expect.stringContaining('Steam AppID'), actions: ['edit'] }]);
});
