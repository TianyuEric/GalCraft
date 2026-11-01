import { createId, isId } from '@galcraft/contracts';
import type { DocumentView, EditInput, Json } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl/parser';

export const pluginId = 'org.galcraft.ai-epilogue';
export const configPath = `plugins/${pluginId}/documents/config.json`;
export type AiEpilogueEntry = { id: string; characterId: string; title: string; characterSetting: string; startingPoint: string; publicFacts: string[];
  interactionRules: string; endingCondition: string; unlockEndingIds: string[]; assetIds: string[] };
export type AiEpilogueConfig = { entries: AiEpilogueEntry[] };
export type EntryField = keyof AiEpilogueEntry | 'entries';
export type ConfigIssue = { entryId?: string; field: EntryField; message: string };
export const translate = (locale: string, zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
export class ConfigError extends Error {
  constructor(readonly issues: ConfigIssue[]) { super(issues[0]?.message); }
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = (value: unknown): value is string => typeof value === 'string' && isId(value);
const fields = ['title', 'characterSetting', 'startingPoint', 'interactionRules', 'endingCondition'] as const;
export function configIssues(value: unknown, locale = 'zh-CN', documents?: DocumentView[]): ConfigIssue[] {
  const issues: ConfigIssue[] = [], t = (zh: string, en: string, ja: string) => translate(locale, zh, en, ja);
  if (!object(value) || !Array.isArray(value.entries) || Object.keys(value).some(key => key !== 'entries'))
    return [{ field: 'entries', message: t('后日谈配置应包含 entries 列表。', 'The afterstory configuration must contain an entries list.', 'アフターストーリー設定には entries の一覧が必要です。') }];
  const ids = new Set<string>(), characters = new Set<string>(), source = documents ? catalog(documents) : null;
  for (const item of value.entries) {
    if (!object(item)) { issues.push({ field: 'entries', message: t('后日谈入口格式无效。', 'This afterstory entry is invalid.', 'アフターストーリーの入口形式が無効です。') }); continue; }
    const entryId = typeof item.id === 'string' ? item.id : undefined;
    const add = (field: EntryField, zh: string, en: string, ja: string) => issues.push({ entryId, field, message: t(zh, en, ja) });
    if (!identity(item.id) || !identity(item.characterId)) add('characterId', '后日谈入口或角色身份无效。', 'The entry or linked character identity is invalid.', '入口または関連キャラの識別情報が無効です。');
    if (typeof item.id === 'string' && ids.has(item.id) || typeof item.characterId === 'string' && characters.has(item.characterId))
      add('characterId', '每位主角色只能配置一个 AI 后日谈入口。', 'Each route protagonist can have only one AI afterstory entry.', '個人ルートの主要キャラには AI アフターストーリーを1つだけ設定できます。');
    if (typeof item.id === 'string') ids.add(item.id); if (typeof item.characterId === 'string') characters.add(item.characterId);
    for (const field of fields) if (typeof item[field] !== 'string' || !item[field].trim())
      add(field, '请填写此项。', 'Complete this field.', 'この項目を入力してください。');
    for (const field of ['publicFacts', 'unlockEndingIds', 'assetIds'] as const) {
      const values = item[field];
      if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim()))
        add(field, '请使用有效列表。', 'Use a list of nonempty values.', '空でない値の一覧を指定してください。');
    }
    if (Array.isArray(item.unlockEndingIds) && !item.unlockEndingIds.length)
      add('unlockEndingIds', '请选择至少一个可解锁此后日谈的个人路线结局。', 'Select at least one personal route ending that unlocks this entry.', 'この入口を解放する個人ルートの結末を1つ以上選択してください。');
    if (Array.isArray(item.assetIds) && item.assetIds.some(value => !identity(value)))
      add('assetIds', '素材身份无效。', 'An asset identity is invalid.', '素材の識別情報が無効です。');
    if (Object.keys(item).some(key => !['id', 'characterId', ...fields, 'publicFacts', 'unlockEndingIds', 'assetIds'].includes(key)))
      add('entries', '后日谈配置含未知字段。', 'The afterstory configuration contains an unknown field.', 'アフターストーリー設定に未対応の項目があります。');
    if (source) {
      const character = source.characters.find(character => character.id === item.characterId);
      if (character?.narrativeRole !== 'main') add('characterId', 'AI 后日谈只能关联个人路线主角色；请先在角色资料中设置身份。', 'The linked character must be a route protagonist. Update the character profile or remove this entry.', '関連キャラを個人ルートの主要キャラに設定するか、この入口を削除してください。');
      if (Array.isArray(item.unlockEndingIds) && item.unlockEndingIds.some(id => !character?.personalRoute?.endingIds.includes(id)))
        add('unlockEndingIds', `“${character?.name ?? '关联角色'}”的解锁结局已变化，请删除或替换已移除的结局。`, 'The unlock endings changed. Remove or replace each removed ending below.', '解放する結末が変更されました。削除済みの結末を以下で削除または置き換えてください。');
      if (Array.isArray(item.assetIds) && item.assetIds.some(id => !source.assets.some(asset => asset.id === id)))
        add('assetIds', '许可素材已移除，请逐项删除或替换。', 'An allowed asset was removed. Remove or replace each missing asset below.', '許可素材が削除されました。以下で個別に削除または置き換えてください。');
    }
  }
  return issues;
}
export function parseConfig(value: unknown, locale = 'zh-CN'): AiEpilogueConfig {
  const issues = configIssues(value, locale); if (issues.length) throw new ConfigError(issues);
  return structuredClone(value) as AiEpilogueConfig;
}
type Character = { id: string; name: string; narrativeRole: string; personalRoute?: { endingIds: string[] } };
type CatalogAsset = { id: string; name: string; kind: string };
export function catalog(documents: DocumentView[]) {
  const characters = documents.flatMap(doc => Object.entries(doc.files).filter(([path]) => path.startsWith('characters/') && path.endsWith('.json'))
    .map(([, raw]) => JSON.parse(raw).data as Character));
  const raw = documents.flatMap(doc => Object.entries(doc.files)).find(([path]) => path === 'assets/index.json')?.[1];
  const assets: CatalogAsset[] = raw ? JSON.parse(raw).data.assets : [];
  const endingScenes = new Map<string, string[]>();
  for (const doc of documents) for (const [path, text] of Object.entries(doc.files)) if (path.startsWith('scenes/') && path.endsWith('/script.gal')) {
    const metadata = doc.files[path.replace(/script\.gal$/, 'scene.json')];
    const name = metadata ? JSON.parse(metadata).data.name as string : '';
    for (const node of parse({ documentId: doc.documentId, revision: doc.revision, text }).cst) {
      const id = (node.object?.value as { endingId?: string } | undefined)?.endingId;
      if (node.valid && node.command === 'end' && id && name) endingScenes.set(id, [...new Set([...(endingScenes.get(id) ?? []), name])]);
    }
  }
  return { characters, assets, endingScenes };
}
export function configEdit(documents: DocumentView[], input: AiEpilogueConfig, locale = 'zh-CN'): EditInput {
  const issues = configIssues(input, locale, documents); if (issues.length) throw new ConfigError(issues);
  const config = parseConfig(input, locale);
  const document = documents.find(item => configPath in item.files), documentId = document?.documentId ?? createId([documents, config]);
  const expected = documents.filter(item => item === document || Object.keys(item.files).some(path => path.startsWith('characters/') || path === 'assets/index.json'))
    .map(item => ({ ref: { kind: 'document' as const, id: item.documentId }, revision: item.revision }));
  return { label: translate(locale, '配置 AI 后日谈', 'Configure AI afterstory', 'AI アフターストーリーを設定'), origin: 'plugin', expected, preparedAssets: [], requiredRefs: [], patches: document
    ? [{ kind: 'json', documentId, changes: [{ path: '/data', before: JSON.parse(document.files[configPath]!).data, after: config as unknown as Json, op: 'set' }] }]
    : [{ kind: 'document', documentId, op: 'create', before: null, after: { format: 'json', files: {
      [configPath]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data: config }, null, 2) + '\n' } } }] };
}
export function contextPreview(documents: DocumentView[], input: AiEpilogueConfig, entryId?: string, locale = 'zh-CN') {
  const config = parseConfig(input, locale), entry = config.entries.find(item => item.id === entryId) ?? config.entries[0];
  if (!entry) throw new ConfigError([{ field: 'entries', message: translate(locale, '请先配置一个 AI 后日谈入口。', 'Create an AI afterstory entry first.', 'AI アフターストーリーの入口を作成してください。') }]);
  const character = catalog(documents).characters.find(item => item.id === entry.characterId);
  return { entryId: entry.id, character: { id: entry.characterId, name: character?.name ?? '', setting: entry.characterSetting },
    startingPoint: entry.startingPoint, allowedFacts: entry.publicFacts, interactionRules: entry.interactionRules,
    endingCondition: entry.endingCondition, allowedAssetIds: entry.assetIds };
}
