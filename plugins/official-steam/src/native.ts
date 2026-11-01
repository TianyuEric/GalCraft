import type { Json, Result } from '@galcraft/contracts';
import type { NativePlatformProvider } from '@galcraft/plugins/contracts';

/** Adapt the application's licensed Steam SDK binding in a native createPlatformProvider entry. */
export type SteamUserStats = { setAchievement(id: string): boolean | Promise<boolean>; storeStats(): boolean | Promise<boolean> };
export function createSteamSdkProvider(stats: SteamUserStats): NativePlatformProvider {
  const fail = (code: string, message: string): Result<Json> => { const error = { code, message, owner: 'M09' as const, severity: 'error' as const, related: [], actions: ['retry' as const] }; return { ok: false, error, issues: [error] }; };
  return { invoke: async (action, args) => {
    if (action !== 'achievement.unlock' || !args || typeof args !== 'object' || Array.isArray(args) || typeof args.id !== 'string' || !args.id) return fail('STEAM_ACTION', '成就动作或 ID 无效');
    try {
      if (!await stats.setAchievement(args.id)) return fail('STEAM_ACHIEVEMENT', 'Steam SDK 未接受成就设置');
      if (!await stats.storeStats()) return fail('STEAM_STORE', 'Steam SDK 未接受统计提交');
      return { ok: true, value: { status: 'submitted', id: args.id }, warnings: [] };
    } catch (error) { return fail('STEAM_SDK', String(error)); }
  } };
}
