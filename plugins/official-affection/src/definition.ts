import type { DocumentContribution, PluginDefinition } from '@galcraft/plugins/contracts';
import type { CommandSpec, FieldSpec, Json } from '@galcraft/contracts';
import { AffectionConfigSchema } from './config.js';
import { pluginMetadata } from './metadata.js';

const ok = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
const field = (path: string, type: FieldSpec['type'], value: Json): FieldSpec => ({ path, type, default: value, label: path, description: path, required: true, nullable: false, unit: 'none', group: 'basic', summary: true, keywords: [], ...(type === 'ref' ? { refKind: 'character' as const } : {}) });
export function affectionCommandSpecs(): CommandSpec[] {
  const base = { version: pluginMetadata.version, icon: 'heart', category: 'plugin', keywords: ['好感度'], skippable: false, executor: 'org.galcraft.affection', targetCapabilities: [], constraints: [] };
  return [
    ...(['add', 'set'] as const).map(operation => ({ ...base, key: `org.galcraft.affection/${operation}`, name: operation, description: '设置角色好感度', fields: [field('characterId', 'ref', null), field(operation === 'add' ? 'amount' : 'value', 'number', 0)], continuation: 'continue' as const })),
    { ...base, key: 'org.galcraft.affection/interact', name: '查看角色关系', description: '等待玩家完成关系页', fields: [], continuation: 'wait' },
  ];
}
export function createDefinition(): PluginDefinition {
  const document: DocumentContribution = { key: 'org.galcraft.affection/config', titleKey: 'affection.config',
    stateVersion: 1, instances: 'multiple', configMapping: { purpose: 'characters', mode: 'multiple', required: false },
    schema: { type: 'object', required: ['characters'], additionalProperties: false, properties: { characters: { type: 'array', items: {
      type: 'object', required: ['characterId', 'min', 'max', 'initial', 'visible', 'label'], additionalProperties: false,
      properties: { characterId: { type: 'string' }, min: { type: 'number' }, max: { type: 'number' }, initial: { type: 'number' }, visible: { type: 'boolean' }, label: { type: 'string' } },
    } } } },
    fields: [{ path: 'characters', label: '角色关系', description: '每个角色的范围与初值', type: 'array', default: [], required: true,
      nullable: false, unit: 'none', group: 'basic', summary: true, keywords: [], item: { path: 'character', label: '角色', description: '角色关系', type: 'object', default: {}, required: true, nullable: false, unit: 'none', group: 'basic', summary: true, keywords: [],
        children: ['characterId', 'min', 'max', 'initial', 'visible', 'label'].map(path => ({ path, label: path, description: path, type: path === 'characterId' ? 'ref' : path === 'visible' ? 'boolean' : path === 'label' ? 'string' : 'number', default: path === 'visible' ? true : path === 'label' ? '' : path === 'characterId' ? null : 0,
          required: true, nullable: false, unit: 'none', group: 'basic', summary: true, keywords: [], ...(path === 'characterId' ? { refKind: 'character' as const } : {}) })) } }],
    initial: { characters: [] },
    validate: data => { const parsed = AffectionConfigSchema.safeParse(data); if (parsed.success) return ok(parsed.data); const error = { code: 'AFFECTION_CONFIG', message: parsed.error.message, owner: 'M09' as const, severity: 'error' as const, related: [], actions: [] }; return { ok: false, error, issues: [error] }; },
    collectReferences: data => AffectionConfigSchema.parse(data).characters.map(item => ({ kind: 'character', id: item.characterId })),
    rewriteReferences: (data, mapping) => ok({ characters: AffectionConfigSchema.parse(data).characters.map(item => ({ ...item, characterId: mapping[item.characterId] ?? item.characterId })) }),
  };
  const definition: PluginDefinition = { documents: [document], commands: affectionCommandSpecs(), conditions: [{ key: 'org.galcraft.affection/compare', fields: [field('characterId', 'ref', null), { ...field('op', 'enum', 'ge'), enumValues: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'] }, field('value', 'number', 0)] }],
    components: [{ key: 'org.galcraft.affection/hud', componentKey: 'org.galcraft.affection/hud', publicParts: ['affection.hud', 'affection.value'],
      propsSchema: { type: 'object', properties: { title: { type: 'string' }, values: { type: 'object', additionalProperties: { type: 'number' } } }, required: ['title'], additionalProperties: false },
      fields: [field('title', 'string', '角色关系')], sampleProps: { title: '角色关系', values: {} }, stateBindings: [{ property: 'values', domain: 'progress', path: 'values' }] }],
    pages: [{ key: 'org.galcraft.affection/relations', titleKey: 'page.relations', componentKey: 'org.galcraft.affection/relations', inputSchema: {}, resultSchema: {}, configFields: [], publicParts: ['relations.list', 'relations.value'], sampleInput: {}, wait: { restorable: true, cancel: 'keepWaiting' } }],
    runtimeConfigVersion: 1 };
  localizeDefinition(definition);
  return definition;
}

const labels: Record<string, [string, string, string]> = {
  characters: ['角色关系', 'Character relationships', 'キャラクターの関係'], character: ['角色', 'Character', 'キャラクター'],
  characterId: ['角色', 'Character', 'キャラクター'], min: ['最小值', 'Minimum', '最小値'], max: ['最大值', 'Maximum', '最大値'],
  initial: ['初始值', 'Initial value', '初期値'], visible: ['显示关系值', 'Show relationship value', '関係値を表示'],
  label: ['显示名称', 'Display name', '表示名'], title: ['标题', 'Title', 'タイトル'], amount: ['增减量', 'Amount', '増減量'],
  value: ['关系值', 'Relationship value', '関係値'], op: ['比较条件', 'Comparison', '比較条件'],
};
function localizeDefinition(definition: PluginDefinition) {
  const messages = definition.messages = { 'zh-CN': {}, en: {}, ja: {} } as Record<string, Record<string, string>>;
  const add = (key: string, values: [string, string, string]) => { ['zh-CN','en','ja'].forEach((locale,index) => { messages[locale]![key] = values[index]!; }); return key; };
  const fields = (entries: FieldSpec[], prefix: string) => { for (const field of entries) {
    const value = labels[field.path]!; field.label = value[1]; field.description = '';
    field.labelKey = add(`${prefix}/${field.path}/label`, value);
    if (field.path === 'characters') { field.description = 'Each character’s limits and initial value'; field.descriptionKey = add(`${prefix}/${field.path}/description`, ['每个角色的范围与初值', field.description, '各キャラクターの範囲と初期値']); }
    if (field.enumValues) { const options: Record<string,[string,string,string]> = {eq:['等于','Equal','等しい'],ne:['不等于','Not equal','等しくない'],lt:['小于','Less than','未満'],le:['小于或等于','Less than or equal','以下'],gt:['大于','Greater than','より大きい'],ge:['大于或等于','Greater than or equal','以上']}; field.enumLabelKeys = Object.fromEntries(field.enumValues.map(option => [option, add(`${prefix}/${field.path}/${option}`, options[option]!)])); }
    if (field.children) fields(field.children, `${prefix}/${field.path}`); if (field.item) fields([field.item], `${prefix}/${field.path}/item`);
  } };
  for (const command of definition.commands ?? []) {
    const mode=command.key.split('/').at(-1)!;
    const titles:Record<string,[string,string,string]>={add:['增减好感度','Change affection','好感度を増減'],set:['设置好感度','Set affection','好感度を設定'],interact:['查看角色关系','View relationships','キャラクターの関係を表示']};
    command.name=titles[mode]![1]; command.nameKey=add(`${command.key}/title`,titles[mode]!);
    command.description=mode==='interact'?'Wait for the player to close the relationship page':'Update the character relationship value';
    command.descriptionKey=add(`${command.key}/description`, mode==='interact'?['等待玩家关闭关系页',command.description,'プレイヤーが関係ページを閉じるまで待機']:['修改角色关系值',command.description,'キャラクターの関係値を変更']); fields(command.fields,command.key);
  }
  for (const item of definition.documents ?? []) { item.titleKey=add(`${item.key}/title`,['好感度配置','Affection configuration','好感度の設定']); fields(item.fields,item.key); }
  for (const item of definition.conditions ?? []) fields(item.fields,item.key);
  for (const item of definition.components ?? []) fields(item.fields ?? [],item.key);
  for (const item of definition.pages ?? []) item.titleKey=add(`${item.key}/title`,['角色关系','Character relationships','キャラクターの関係']);
}
