import type { Json, Ref, Result } from '@galcraft/contracts';
import type { PluginDefinition } from '@galcraft/plugins/contracts';
import { parseConfig, pluginId } from './model.js';

export function createDefinition(): PluginDefinition {
  return { messages: { 'zh-CN': { [`${pluginId}/config/title`]: 'AI 后日谈配置' }, en: { [`${pluginId}/config/title`]: 'AI afterstory configuration' }, ja: { [`${pluginId}/config/title`]: 'AI アフターストーリー設定' } }, documents: [{ key: `${pluginId}/config`, titleKey: `${pluginId}/config/title`, stateVersion: 1, instances: 'fixed',
    schema: { type: 'object', required: ['entries'], additionalProperties: false, properties: { entries: { type: 'array' } } },
    fields: [], initial: { entries: [] },
    validate: data => {
      try { return { ok: true, value: parseConfig(data) as unknown as Json, warnings: [] }; }
      catch (error) { const issue = { code: 'AI_EPILOGUE_CONFIG', message: String(error), severity: 'error' as const, owner: 'M09' as const, related: [], actions: [] };
        return { ok: false, error: issue, issues: [issue] }; }
    },
    collectReferences: data => parseConfig(data).entries.flatMap(entry => [{ kind: 'character', id: entry.characterId },
      ...entry.assetIds.map(id => ({ kind: 'asset', id }))] as Ref[]),
    rewriteReferences: (data, mapping): Result<Json> => ({ ok: true, warnings: [], value: { entries: parseConfig(data).entries.map(entry => ({ ...entry,
      id: mapping[entry.id] ?? entry.id, characterId: mapping[entry.characterId] ?? entry.characterId,
      assetIds: entry.assetIds.map(id => mapping[id] ?? id) })) } }),
  }] };
}
