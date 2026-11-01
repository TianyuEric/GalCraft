import { productionMessages } from '@galcraft/plugins/contracts';
import translations from './display-translations.json' with { type: 'json' };
import type { FieldSpec, Json, ProductionOperationDefinition } from '@galcraft/contracts';
import type { PluginDefinition } from '@galcraft/plugins/contracts';
import { createMotionProject, motionProjectSchema, operationId, parseMotionProject, projectDocumentKey, renderProviderKey } from './project.js';
import { projectToolKey } from './tools.js';
export const projectField: FieldSpec = {path: 'project', label: 'Motion Canvas project', description: 'Edit TS/TSX sources, exact asset bindings and output settings; preparation freezes the project.', labelKey: `${projectDocumentKey}-label`, descriptionKey: `${projectDocumentKey}-description`, type: 'object', required: true, nullable: false, default: createMotionProject() as unknown as Json, unit: 'none', group: 'basic', summary: true, keywords: ['视频','Motion Canvas','TSX']};
export const motionRenderOperation: ProductionOperationDefinition = {
  contractVersion: 1, id: operationId, version: 1, title: 'Motion Canvas video', description: 'Render an editable Motion Canvas project with exact image, font and audio bindings into standard MP4 candidates. Read projectInfo describe/validate/runtime first. Use actual references with matching images/fonts/audio ports and exact versions. Rendering requires the optional local toolchain and a configured plugin connection.', purpose: operationId, providerKey: renderProviderKey, execution: 'local',
  fields: [projectField], inputSchema: {type: 'object', properties: {project: motionProjectSchema}, required: ['project'], additionalProperties: false},
  inputs: [{key: 'images', type: 'image', required: false, multiple: true, mimeTypes: ['image/png','image/jpeg','image/webp']},
    {key: 'fonts', type: 'font', required: false, multiple: true, mimeTypes: ['font/otf','font/ttf','font/woff','font/woff2','application/font-sfnt']},
    {key: 'audio', type: 'audio', required: false, multiple: false, mimeTypes: ['audio/ogg','audio/opus','audio/wav','audio/mpeg','audio/mp4']}],
  outputs: [{key: 'video', type: 'video', required: true, multiple: false, mimeTypes: ['video/mp4']}],
  capabilities: {query: false, refetch: false, cancelPerTask: true, resume: false}, adoption: {kind: 'asset', assetKind: 'video', usages: ['cg']},
};
export const definition: PluginDefinition = {
  productionOperations: [motionRenderOperation],
  documents: [{key: projectDocumentKey, titleKey: `${projectDocumentKey}-title`, schema: {type: 'object', properties: {project: motionProjectSchema}, required: ['project'], additionalProperties: false}, fields: [projectField], initial: {project: createMotionProject()} as unknown as Json, stateVersion: 1, instances: 'multiple',
    validate(data) {const parsed = parseMotionProject(data && typeof data === 'object' && !Array.isArray(data) ? data.project : undefined); return parsed.ok ? {...parsed, value: {project: parsed.value} as unknown as Json} : parsed;},
    collectReferences(data) {const parsed = parseMotionProject(data && typeof data === 'object' && !Array.isArray(data) ? data.project : undefined); if (!parsed.ok) return []; const references = parsed.value.bindings.flatMap(binding => [{kind:'asset' as const,id:binding.assetId},{kind:'variant' as const,id:binding.variantId}]); return references.filter((reference,index) => references.findIndex(item => item.kind === reference.kind && item.id === reference.id) === index);},
    rewriteReferences(data, mapping) {const parsed = parseMotionProject(data && typeof data === 'object' && !Array.isArray(data) ? data.project : undefined); if (!parsed.ok) return parsed; const project = parsed.value; project.bindings = project.bindings.map(binding => ({...binding, assetId: mapping[binding.assetId] ?? binding.assetId, variantId: mapping[binding.variantId] ?? binding.variantId})); return {ok: true, warnings: [], value: {project} as unknown as Json};},
  }],
  messages: {'zh-CN': {[`${projectDocumentKey}-title`]: 'Motion Canvas 作者工程', [`${projectDocumentKey}-label`]: '视频工程', [`${projectDocumentKey}-description`]: 'TS/TSX 文件、素材别名与输出设置'}, en: {[`${projectDocumentKey}-title`]: 'Motion Canvas source', [`${projectDocumentKey}-label`]: 'Video project', [`${projectDocumentKey}-description`]: 'TS/TSX files, resource aliases and render settings'}, ja: {[`${projectDocumentKey}-title`]: 'Motion Canvas 制作ソース', [`${projectDocumentKey}-label`]: '動画プロジェクト', [`${projectDocumentKey}-description`]: 'TS/TSX ファイル、素材別名と出力設定'}},
};
for (const [locale,title] of Object.entries({'zh-CN':'Motion Canvas project与工具链',en:'Motion Canvas project and toolchain',ja:'Motion Canvas プロジェクトとツールチェーン'})) definition.messages![locale]![`${projectToolKey}-title`]=title;
for (const [locale,description] of Object.entries({'zh-CN':'读取视频工程结构、检查素材绑定，并确认本地渲染工具链。',en:'Read video project structure, validate asset bindings and inspect the local render toolchain.',ja:'動画プロジェクトの構造、素材の紐付け、ローカル描画環境を確認します。'})) definition.messages![locale]![`${projectToolKey}-description`]=description;
productionMessages(definition.productionOperations!, translations, definition.messages);
export function createDefinition(): PluginDefinition {return definition;}
