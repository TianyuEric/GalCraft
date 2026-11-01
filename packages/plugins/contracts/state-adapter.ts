import { createId } from '@galcraft/contracts';
import type { Id, Lock, LongTerm, RestoreKey, Result, RuntimeState } from '@galcraft/contracts';
import type { PluginManifest } from './manifest.js';
import type { Contributions, PreparedPluginRestore } from './sdk.js';

export const emptyContributions = (): Contributions => ({ commands: [], conditions: [], documents: [], tools: [],
  resources: [], stages: [], pages: [], components: [], systems: [], platform: [], generationProviders: [], textPreparations: [], resourceProcessors: [], fieldEditors: [], publishChecks: [], targetBuilders: [], assetTypes: [], assetEditors: [], assetPreviews: [], assetThumbnails: [], productionOperations: [] });

export class PluginStateAdapter {
  private prepared = new Map<Id, PreparedPluginRestore>();
  constructor(private readonly contributions: Contributions, private readonly manifests: readonly PluginManifest[]) {}
  prepare(input: { key: RestoreKey; progress: RuntimeState['plugins']; longTerm: LongTerm['plugins']; targetLock: Lock }): Result<PreparedPluginRestore> {
    const progress = structuredClone(input.progress);
    const conversions: PreparedPluginRestore['conversions'] = [];
    const fail = (message: string): Result<PreparedPluginRestore> => {
      const error = { code: 'PLUGIN_STATE', severity: 'error' as const, message, owner: 'M09' as const, related: [], actions: ['supplyDependency' as const] };
      return { ok: false, error, issues: [error] };
    };
    for (const dependency of input.targetLock.plugins) {
      const manifest = this.manifests.find(item => item.id === dependency.id && item.version === dependency.version);
      const state = progress[dependency.id];
      if (!manifest) { if (dependency.required || state) return fail(`缺少插件 ${dependency.id}@${dependency.version}`); continue; }
      const systems = this.contributions.systems.filter(item => item.key === dependency.id || item.key.startsWith(`${dependency.id}/`));
      if (systems.length > 1) return fail(`PLUGIN_STATE_DUPLICATE: ${dependency.id} 提供多个权威状态定义`);
      const system = systems[0];
      if (!system) { if (state && Object.keys(state.progress ?? {}).length) return fail(`插件 ${dependency.id} 缺少状态贡献`); continue; }
      if (!state) return fail(`缺少 ${dependency.id} 的进度状态`);
      try {
        if (state.stateVersion !== manifest.stateVersions.progress) {
          const converted = system.convert(state.stateVersion, manifest.stateVersions.progress, structuredClone(state.progress));
          if (!converted.ok) return converted;
          conversions.push({ provider: dependency.id, from: `${state.version}/${state.stateVersion}`, to: `${manifest.version}/${manifest.stateVersions.progress}` });
          state.progress = converted.value;
        } else if (state.version !== manifest.version) {
          return fail(`${dependency.id} 未声明从 ${state.version} 到 ${manifest.version} 的状态转换`);
        }
        const validated = system.validate(state.progress, 'progress'); if (!validated.ok) return validated;
        const longTerm = input.longTerm[dependency.id];
        if (longTerm) {
          if (longTerm.version !== manifest.version || longTerm.stateVersion !== manifest.stateVersions.longTerm)
            return fail(`${dependency.id} 长期资料尚未转换到目标版本`);
          const checked = system.validate(structuredClone(longTerm.data), 'longTerm'); if (!checked.ok) return checked;
        }
        state.progress = structuredClone(validated.value); state.version = manifest.version; state.stateVersion = manifest.stateVersions.progress;
      } catch (error) { return fail(`${dependency.id}: ${String(error)}`); }
    }
    for (const id of Object.keys(progress)) if (!input.targetLock.plugins.some(item => item.id === id))
      return fail(`目标作品未启用存档插件 ${id}`);
    const value = { id: createId(), key: structuredClone(input.key), progress, conversions };
    this.prepared.set(value.id, structuredClone(value));
    return { ok: true, value, warnings: [] };
  }
  release(id: Id): void { this.prepared.delete(id); }
}
