import { z } from 'zod';
export { pluginMetadata } from './metadata.js';
import type { FieldSpec, Json, Result } from '@galcraft/contracts';
import { IdSchema } from '@galcraft/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import type { Contributions, GalCraftPlugin, PluginStep } from '@galcraft/plugins/contracts';
import { AffectionConfigSchema, readAffectionConfig } from './config.js';
import type { AffectionConfig } from './config.js';
import { createDefinition } from './definition.js';
export { createDefinition } from './definition.js';
export { AffectionConfigSchema, readAffectionConfig } from './config.js';
export type { AffectionConfig } from './config.js';

const ProgressSchema = z.strictObject({ values: z.record(IdSchema, z.number().finite()) });
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const fail = <T>(message: string): Result<T> => { const error = { code: 'PLUGIN_STATE', severity: 'error' as const,
  message, owner: 'M09' as const, related: [], actions: [] }; return { ok: false, error, issues: [error] }; };
const prefix = 'org.galcraft.affection';
const field = (path: string, type: FieldSpec['type'], value: Json): FieldSpec => ({ path, type, default: value,
  label: path, description: path, labelKey: `${prefix}.${path}`, required: true, nullable: false,
  unit: 'none', group: 'basic', summary: true, keywords: [], ...(type === 'ref' ? { refKind: 'character' as const } : {}) });

export function createAffectionContributions(input: AffectionConfig): Contributions {
  const config = AffectionConfigSchema.parse(input), contributions = emptyContributions();
  const initial = () => ({ values: Object.fromEntries(config.characters.map(item => [item.characterId, item.initial])) });
  const validate = (value: Json): Result<Json> => {
    const parsed = ProgressSchema.safeParse(value); if (!parsed.success) return fail(parsed.error.message);
    for (const character of config.characters) {
      const current = parsed.data.values[character.characterId];
      if (current === undefined || current < character.min || current > character.max) return fail(`角色 ${character.label} 的好感度超出配置范围`);
    }
    if (Object.keys(parsed.data.values).some(id => !config.characters.some(item => item.characterId === id))) return fail('好感度包含未知角色');
    return ok(parsed.data);
  };
  contributions.systems.push({ key: `${prefix}/state`, progressSchema: { type: 'object' }, longTermSchema: { type: 'object' },
    initialProgress: () => initial(), initialLongTerm: () => ({}), debugFields: [field('values', 'object', {})],
    validate: (state, domain) => domain === 'progress' ? validate(state) :
      typeof state === 'object' && state !== null && !Array.isArray(state) && Object.keys(state).length === 0 ? ok({}) : fail('长期好感度状态应为空'),
    convert: (from, to, state) => {
      if (from !== 0 || to !== 1) return fail(`未声明好感度状态转换 ${from} → ${to}`);
      const previous = ProgressSchema.safeParse(state); if (!previous.success) return fail(previous.error.message);
      return ok({ values: Object.fromEntries(config.characters.map(character => [character.characterId,
        Math.max(character.min, Math.min(character.max, previous.data.values[character.characterId] ?? character.initial))])) });
    }, mergeLongTerm: () => ok({}), checkpoint: validate });
  for (const operation of ['add', 'set'] as const) {
    const valueKey = operation === 'add' ? 'amount' : 'value';
    contributions.commands.push({ spec: createDefinition().commands!.find(item => item.key === `${prefix}/${operation}`)!,
      execute: async ({ args, state }): Promise<Result<PluginStep>> => {
        const parsed = z.object({ characterId: IdSchema, [valueKey]: z.number().finite() }).safeParse(args);
        if (!parsed.success) return fail(parsed.error.message);
        const checked = validate(state); if (!checked.ok) return checked;
        const character = config.characters.find(item => item.characterId === parsed.data.characterId);
        if (!character) return fail('好感度命令引用未知角色');
        const progress = ProgressSchema.parse(checked.value), value = parsed.data[valueKey] as number;
        progress.values[character.characterId] = Math.max(character.min, Math.min(character.max,
          operation === 'add' ? progress.values[character.characterId]! + value : value));
        return ok({ progress, longTermDelta: null, presentation: null, wait: null, result: progress.values[character.characterId]! });
      } });
  }
  contributions.conditions.push({ key: `${prefix}/compare`, fields: createDefinition().conditions![0]!.fields,
    evaluate: (args, progress) => {
      const parsed = z.object({ characterId: IdSchema, op: z.enum(['eq', 'ne', 'lt', 'le', 'gt', 'ge']), value: z.number().finite() }).safeParse(args);
      if (!parsed.success) return fail(parsed.error.message);
      const checked = validate(progress); if (!checked.ok) return checked;
      const current = ProgressSchema.parse(checked.value).values[parsed.data.characterId]; if (current === undefined) return fail('好感度条件引用未知角色');
      const { op, value } = parsed.data;
      return ok({ eq: current === value, ne: current !== value, lt: current < value, le: current <= value, gt: current > value, ge: current >= value }[op]);
    } });
  contributions.documents.push(...createDefinition().documents!);
  contributions.pages.push({ key: `${prefix}/relations`, titleKey: 'page.relations', componentKey: `${prefix}/relations`,
    inputSchema: {}, resultSchema: {}, configFields: [], publicParts: ['relations.list', 'relations.value'], sampleInput: {},
    wait: { restorable: true, cancel: 'keepWaiting' },
    render: ({ progress, finish }) => {
      const root = document.createElement('section'); root.dataset.part = 'relations.list';
      const parsed = ProgressSchema.safeParse(progress);
      for (const character of config.characters.filter(item => item.visible)) {
        const row = document.createElement('p'); row.dataset.part = 'relations.value';
        row.textContent = `${character.label} ${parsed.success ? parsed.data.values[character.characterId] ?? character.initial : character.initial}`; root.append(row);
      }
      const close = document.createElement('button'); close.textContent = '←'; close.ariaLabel = 'Back'; close.onclick = () => finish(null); root.append(close); return root;
    } });
  contributions.commands.push({ spec: createDefinition().commands!.find(item => item.key === `${prefix}/interact`)!,
    execute: async ({ state }) => ok({ progress: state, longTermDelta: null, presentation: null, wait: { page: `${prefix}/relations`, input: {}, resumeData: {} }, result: null }),
    resume: async ({ state }) => ok({ progress: state, longTermDelta: null, presentation: null, wait: null, result: null }) });
  contributions.components.push({ ...createDefinition().components![0]!, sampleProps: { title: '角色关系', values: initial().values },
    render: ({ props }) => { const root = document.createElement('section'); root.dataset.part = 'affection.hud';
      const data = props as { title: string; values?: Record<string, number> }; const title = document.createElement('h3'); title.textContent = data.title; root.append(title);
      for (const character of config.characters.filter(item => item.visible)) { const row = document.createElement('p'); row.dataset.part = 'affection.value'; row.textContent = `${character.label} ${data.values?.[character.characterId] ?? character.initial}`; root.append(row); }
      return root; } });
  return contributions;
}
export function createPlugin(config: AffectionConfig = { characters: [] }): GalCraftPlugin {
  return { activate: async context => { const result = createAffectionContributions(readAffectionConfig(context.config, config));
    result.documents = []; return result; }, deactivate: async () => {} };
}
export function createEditorPlugin(): GalCraftPlugin {
  return { activate: async context => { const result = emptyContributions();
    result.documents = createDefinition().documents!;
    return result; }, deactivate: async () => {} };
}
