import { AuthoringOutlineSchema, AssetSchema, ProjectSchema, createId, PerformanceGuidance } from '@galcraft/contracts';

import { parse, createCommandRegistry, type CompileInput } from '@galcraft/dsl';
import type { ContextPart } from './types.js';
import type { PlanningDocument } from './planning.js';
import type { FieldSpec } from '@galcraft/contracts';
export type ProductionContextInput = { performance?: boolean; usage?: import('../recipes/schema.js').RecipeUsage; sceneId?: string | null; characterId?: string | null; statementId?: string | null; statementIds?: string[]; textRange?: { start: number; end: number } | null; pageIds?: string[]; componentIds?: string[] };


/** Select useful authoring facts while leaving optional references visible to the author. */
export function productionContext(documents: PlanningDocument[], current: CompileInput, input: ProductionContextInput): ContextPart[] {
  const parts: ContextPart[] = [], usage = input.usage ?? 'script';
  const locate = (path: string) => { const document = documents.find(document => path in document.files); return document ? { document, text: document.files[path]! } : null; };
  const add = (kind: ContextPart['kind'], label: string, text: string, document: PlanningDocument | null = null, included = true) => {
    if (!text) return;
    parts.push({ id: createId(), kind, label, included, source: document ? { ref: { kind: 'document', id: document.documentId }, revision: document.revision } : null,
      text, media: null, attachment: null, authorEdited: false });
  };
  const script = locate(`scenes/${input.sceneId}/script.gal`);
  const parsed = script ? parse({ documentId: script.document.documentId, revision: script.document.revision, text: script.text }) : null;
  const ids = input.statementIds ?? (input.statementId ? [input.statementId] : []);
  const selected = parsed?.cst.filter(node => node.id && ids.includes(node.id)) ?? [];
  const range = input.textRange ?? (selected.length ? { start: selected[0]!.start, end: selected.at(-1)!.end } : null);
  const validRange = script && range && range.start >= 0 && range.end <= script.text.length && range.end >= range.start ? range : null;
  const nearby = script ? validRange ? script.text.slice(Math.max(0, validRange.start - 1500), validRange.end + 1500) : script.text : '';
  const relatedCharacters = new Set(current.characters.filter(character => character.id === input.characterId || nearby.includes(character.id)).map(character => character.id));
  const projectFile = locate('project.json');
  if (projectFile) { const data = ProjectSchema.parse(JSON.parse(projectFile.text).data); add('setting', '作品信息 / Project', JSON.stringify({ name: data.name, description: data.description, canvas: data.canvas, languages: data.languages }), projectFile.document); }
  const outline = locate('authoring/outline.json');
  if (outline) { const data = AuthoringOutlineSchema.parse(JSON.parse(outline.text).data);
    add('setting', '当前章节大纲 / Current outline', JSON.stringify({ setting: data.setting, style: data.style, audienceNotes: data.audienceNotes,
      characters: usage === 'background' ? [] : data.characters.filter(character => relatedCharacters.has(character.characterId)),
      chapters: data.chapters.filter(chapter => chapter.scenes.some(scene => scene.sceneId === input.sceneId)).map(chapter => ({ chapterId: chapter.chapterId, summary: chapter.summary, scenes: chapter.scenes.filter(scene => scene.sceneId === input.sceneId) })) }), outline.document);
  }
  for (const character of [...current.characters].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = locate(`characters/${character.id}.json`) ?? documents.flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('characters/')).map(([path, text]) => ({ document, text }))).find(entry => JSON.parse(entry.text).data.id === character.id);
    add('character', `${character.name} · ${character.narrativeRole === 'viewpoint' ? '玩家视角' : character.narrativeRole === 'main' ? '主角色' : character.narrativeRole === 'supporting' ? '配角' : '未分类'}`,
      JSON.stringify({ id: character.id, name: character.name, narrativeRole: character.narrativeRole, description: character.description, appearance: character.appearance, personalRoute: character.personalRoute }), source?.document ?? null,
      usage !== 'background' && relatedCharacters.has(character.id));
  }
  const assetFile = locate('assets/index.json');
  if (assetFile) { const assets = AssetSchema.array().parse(JSON.parse(assetFile.text).data.assets);
    const relevant = (asset: import('@galcraft/contracts').Asset) => nearby.includes(asset.id) || asset.sceneIds?.includes(input.sceneId ?? '') || asset.characterId !== null && relatedCharacters.has(asset.characterId ?? '');
    const describe = (asset: import('@galcraft/contracts').Asset) => ({ id: asset.id, name: asset.name, kind: asset.kind, description: asset.source?.description, tags: asset.tags, characterId: asset.characterId });
    add('assetCatalog', '关联素材 / Related assets', JSON.stringify(assets.filter(relevant).map(describe)), assetFile.document);
    for (const character of current.characters.filter(character => relatedCharacters.has(character.id) && ['script', 'figure', 'cg', 'difference', 'ui'].includes(usage))) {
      for (const assetId of character.appearance.referenceAssets) {
        const asset = assets.find(asset => asset.id === assetId), variant = asset?.variants.find(variant => variant.id === asset.activeVariantId);
        const file = variant?.files.find(file => file.path === variant.entry);
        if (!asset || !variant || !file) throw new Error(`Character reference image is missing: ${character.name} / ${assetId}`);
        if (parts.some(part => part.media?.assetId === assetId && part.media.variantId === variant.id)) continue;
        parts.push({ id: createId(), kind: 'media', label: `${character.name} · ${asset.name}`, included: true,
          source: { ref: { kind: 'document', id: assetFile.document.documentId }, revision: assetFile.document.revision }, text: null,
          media: { assetId, variantId: variant.id, candidateId: null, artifactIndex: null, localPath: '', mime: file.mime, kind: asset.kind, typeVersion: variant.typeData?.typeVersion ?? 1 },
          attachment: null, authorEdited: false });
      }
    }
    if (assets.some(asset => !relevant(asset))) add('assetCatalog', '其他素材（按需加入） / Other assets', JSON.stringify(assets.filter(asset => !relevant(asset)).map(describe)), assetFile.document, false);
  }
  if (script) {
    if (validRange) {
      add('script', '选区前文 / Before selection', script.text.slice(Math.max(0, validRange.start - 1500), validRange.start), script.document);
      add('script', '选定剧情 / Selected script', script.text.slice(validRange.start, validRange.end), script.document);
      add('script', '选区后文 / After selection', script.text.slice(validRange.end, validRange.end + 1500), script.document);
    } else add('script', '当前场景 / Current scene', script.text, script.document);
  }
  if (usage === 'script') {
    const names = new Set([...PerformanceGuidance.commands, 'bgm', 'playEffect', ...parsed?.cst.map(node => node.command) ?? []]);
    const registry = createCommandRegistry(current.engineVersion, current.pluginCommands);
    const field = (spec: FieldSpec): object => ({ path: spec.path, type: spec.type, ...(spec.required ? { required: true } : {}), ...(spec.refKind ? { ref: spec.refKind } : {}), ...(spec.enumValues ? { values: spec.enumValues } : {}), ...(spec.children ? { fields: spec.children.map(field) } : {}), ...(spec.item ? { item: field(spec.item) } : {}), default: spec.default, nullable: spec.nullable, unit: spec.unit, ...(spec.min !== undefined ? { min: spec.min } : {}), ...(spec.max !== undefined ? { max: spec.max } : {}), ...(spec.exclusiveMin !== undefined ? { exclusiveMin: spec.exclusiveMin } : {}) });
    const basic: Record<string, string[]> = { say: ['speaker','text','append','voice','voiceVolume','textLocale','target'], changeBg: ['op','assetId','fit','positionX','positionY','transition'], changeFigure: ['op','objectId','characterId','assetId','station','framing','portrait','difference','reset','transition'] };
    const commands = [...registry].filter(([name]) => names.has(name));
    const compact = (key: string, spec: import('@galcraft/contracts').CommandSpec) => {
      const used = new Set((parsed?.cst ?? []).filter(node => node.command === key && !!node.id && nearby.includes(node.id)).flatMap(node => Object.keys(node.object?.value ?? {})));
      return { key, fields: spec.fields.filter(entry => entry.required || used.has(entry.path) || (basic[key] ? basic[key].includes(entry.path) : !['note','when','continue','skippable','model','effects','transition'].includes(entry.path))).map(field) };
    };
    add('instruction', '本轮合法指令 / Relevant commands', JSON.stringify({ syntax: '<command> <JSON object> @<6-character A-Za-z0-9 ID>;', commands: commands.map(([key, spec]) => compact(key, spec)),
      scenes: (current.scenes ?? []).map(scene => ({ id: scene.id, name: scene.name })), variables: (current.variables ?? []).filter(variable => nearby.includes(variable.id)), missingAssets: 'Use comment text for pending bindings. Never invent asset or character IDs.' }));
    if (input.performance) add('instruction', '演出配方 / Staging recipe', `${PerformanceGuidance.principles}\n\n${PerformanceGuidance.shortScene}`);
    if (input.performance) add('instruction', '演出扩展字段 / Extended presentation fields', JSON.stringify(commands.filter(([key]) => PerformanceGuidance.commands.includes(key as typeof PerformanceGuidance.commands[number])).map(([key,spec]) => ({key,fields:spec.fields.map(field)}))));
  }
  for (const document of documents) for (const [path, text] of Object.entries(document.files)) {
    if (input.pageIds?.length && (path === 'ui/template.json' || path.startsWith('ui/styles/') || path.startsWith('ui/pages/') && input.pageIds.includes(document.documentId))) add(path.startsWith('ui/styles/') ? 'style' : 'ui', path, text, document);
  }
  if (usage === 'ui') add('instruction', '页面公开字段 / Public UI fields', '页面只修改layout、background的公开叶字段；组件只修改normal、states、layout或visible、locked。保留页面与组件ID。UIPatch提供summary/config/styles/assets；config包含key,pageId,componentId,path,operation,value,dependsOn。');
  return parts;
}
