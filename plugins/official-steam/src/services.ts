import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin, PublishCheckContribution } from '@galcraft/plugins/contracts';

/** The Steam package owns its AppID rules; M11 consumes the ordinary publish-check port. */
export const steamConfigurationCheck: PublishCheckContribution = {
  key: 'org.galcraft.steam/configuration',
  async check({ snapshot, target, settings }) {
    if (target !== 'windows') return [];
    const instructions = snapshot.scenes.flatMap(scene => scene.instructions).filter(instruction => instruction.opcode === 'callSteam');
    const options = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
    const policy = options.platformPolicy;
    const required = !!(policy && typeof policy === 'object' && !Array.isArray(policy) && policy['org.galcraft.steam/achievement'] === 'required') || instructions.some(instruction => instruction.args && typeof instruction.args === 'object' && !Array.isArray(instruction.args) && instruction.args.unavailable === 'required');
    if (!instructions.length && !required) return [];
    const appId = snapshot.project.platform.steamAppId;
    if (typeof appId === 'string' && /^[1-9]\d*$/.test(appId) && Number(appId) <= 0xffffffff) return [];
    return [{ code: 'STEAM_APP_ID', owner: 'M09', severity: required ? 'error' : 'warning', message: '请在作品平台设置中填写有效的 Steam AppID，并保存后重新检查。', related: [], actions: ['edit'],
      ...(instructions[0] ? { source: instructions[0].source } : {}) }];
  },
};

export function createPlugin(): GalCraftPlugin {
  return { activate: async () => { const contributions = emptyContributions(); contributions.publishChecks = [steamConfigurationCheck]; return contributions; }, deactivate: async () => {} };
}
