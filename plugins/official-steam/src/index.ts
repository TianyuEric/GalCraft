import type { Domain, Json, Result, Target } from '@galcraft/contracts';
export { pluginMetadata } from './metadata.js';
export { createSteamSdkProvider } from './native.js';
export type { SteamUserStats } from './native.js';
import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin, PlatformContribution } from '@galcraft/plugins/contracts';
export type SteamPort = { unlock(id: string): Promise<Result<Json>> };
export function createPlugin(port?: SteamPort): GalCraftPlugin {
  return { activate: async context => createSteamContributions(context.target, port ?? (context.platform ? { unlock: id => context.platform!.invoke('org.galcraft.steam/achievement', 'achievement.unlock', { id }) } : undefined)), deactivate: async () => {} };
}
export function createSteamContributions(target: Target, port?: SteamPort) {
    const contributions = emptyContributions();
    const invoke: PlatformContribution['invoke'] = async (action, args, domain: Domain): Promise<Result<Json>> => {
      const fail = (message: string): Result<Json> => { const error = { code: 'PLATFORM_UNAVAILABLE', severity: 'error' as const,
        message, owner: 'M09' as const, related: [], actions: ['retry' as const] }; return { ok: false, error, issues: [error] }; };
      if (action !== 'achievement.unlock' || typeof args !== 'object' || args === null || Array.isArray(args) || typeof args.id !== 'string' || !args.id)
        return fail('成就动作或 ID 无效');
      if (domain.kind !== 'player') return { ok: true, value: { status: 'simulated', id: args.id }, warnings: [] };
      if (target !== 'windows') return { ok: true, value: { status: 'skipped', reason: 'targetUnsupported' }, warnings: [] };
      if (!port) return fail('Steam 尚未连接');
      try { return await port.unlock(args.id); } catch (error) { return fail(String(error)); }
    };
    contributions.platform.push({ key: 'org.galcraft.steam/achievement', targets: ['web', 'windows'],
      fallback: async (_action, _args, domain) => ({ ok: true, value: { status: domain.kind === 'player' ? 'skipped' : 'simulated', reason: 'targetUnsupported' }, warnings: [] }),
      actions: [{ name: 'achievement.unlock', fields: [{ path: 'id', label: 'Achievement ID', description: 'Steam achievement ID',
        type: 'string', default: '', required: true, nullable: false, unit: 'none', group: 'basic', summary: true, keywords: [] }] }], invoke });
    return contributions;
}
