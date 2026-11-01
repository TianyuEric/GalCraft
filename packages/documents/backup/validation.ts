import { createId } from '@galcraft/contracts';
import { stat } from 'node:fs/promises';

import { assetReferenceTarget, AssetSchema, CharacterSchema, FlowSchema, GalleryEntrySchema, LockSchema, ProjectSchema, SceneSchema, VariableSchema, normalizeCharacterAuthoringData, normalizeProjectAuthoringData, type AssetReference, type Issue } from '@galcraft/contracts';
import { compile } from '@galcraft/dsl';
import { readTemplateDocuments, templateIssues, collectTemplateAssets } from '@galcraft/templates';
import { compileStyle } from '@galcraft/templates/compiler';
import type { WorkingDocument } from '@galcraft/documents';
import type { BackupProviders } from './types.js';
import { problem } from './types.js';
import { under } from './files.js';

export function projectData(documents: WorkingDocument[]) {
  const files = Object.assign({}, ...documents.map(document => document.files)) as Record<string, string>;
  const data = (path: string) => { if (!files[path]) throw new Error(`缺少作品文档：${path}`); return JSON.parse(files[path]!).data; };
  return { files, data, project: ProjectSchema.parse(normalizeProjectAuthoringData(data('project.json'))), lock: LockSchema.parse(data('dependencies.lock.json')) };
}
export async function validateProject(directory: string, documents: WorkingDocument[], providers: BackupProviders): Promise<Issue[]> {
  const issues: Issue[] = [];
  try {
    const { files, data, project, lock } = projectData(documents), assets = AssetSchema.array().parse(data('assets/index.json').assets);
    const collection = providers.collectAssets(JSON.parse(files['assets/index.json']!)); issues.push(...collection.issues);
    for (const file of collection.files) { try { if ((await stat(under(directory, file.path))).size !== file.bytes) throw new Error('文件大小不同'); }
      catch { issues.push(problem('BACKUP_ASSET_MISSING', `素材文件缺失或大小不同：${file.path}`)); } }
    const template = readTemplateDocuments(documents); templateIssues(template).forEach(message => issues.push(problem('RESTORE_TEMPLATE', message)));
    for (const id of collectTemplateAssets(template)) if (!assets.some(asset => asset.id === id)) issues.push(problem('RESTORE_UI_ASSET', `页面引用素材缺失：${id}`));
    for (const style of template.styles) {
      const source = files[style.sourcePath], css = style.compiledPath ? files[style.compiledPath] : null;
      if (source === undefined || css == null) { issues.push(problem('RESTORE_STYLE_MISSING', `样式文件缺失：${style.name}`)); continue; }
      const compiled = compileStyle({ style, source, instanceId: template.instanceId, modules: files }); issues.push(...compiled.style.issues);
    }
    const selected = <T>(prefix: string, schema: { parse(data: unknown): T }) => Object.entries(files).filter(([path]) => path.startsWith(prefix) && path.endsWith('.json')).map(([, text]) => schema.parse(JSON.parse(text).data));
    const scenes = Object.entries(files).filter(([path]) => path.endsWith('/scene.json')).map(([, text]) => SceneSchema.parse(JSON.parse(text).data));
    const characters = selected('characters/', { parse: value => CharacterSchema.parse(normalizeCharacterAuthoringData(value)) });
    const pluginDocuments: Record<string, any> = {}, assetReferences: AssetReference[] = [];
    for (const [path, text] of Object.entries(files).filter(([path]) => path.startsWith('plugins/') && path.endsWith('.json'))) {
      const provider = providers.pluginDocuments(path), content = JSON.parse(text).data;
      if (!provider) { issues.push(problem('RESTORE_PLUGIN_DOCUMENT', `插件文档提供方待补齐：${path}`)); continue; }
      pluginDocuments[path.split('/')[1]!] = content;
      const document = documents.find(document => document.files[path] !== undefined)!;
      const source = { documentId: document.documentId, revision: document.revision };
      for (const ref of provider.collectReferences(content)) {
        if (ref.kind === 'asset' || ref.kind === 'variant') {
          const target = assetReferenceTarget(ref, assets);
          if (target) assetReferences.push({ ...target, owner: { kind: 'document', id: document.documentId }, source, usage: provider.key, required: true });
          else issues.push({ ...problem('RESTORE_PLUGIN_REFERENCE', `插件引用缺失：${provider.key}/${ref.id}`), source, related: [ref] });
        } else {
          const present = ref.kind === 'character' ? characters.some(value => value.id === ref.id) : ref.kind === 'scene' ? scenes.some(value => value.id === ref.id) : documents.some(value => value.documentId === ref.id);
          if (!present) issues.push({ ...problem('RESTORE_PLUGIN_REFERENCE', `插件引用缺失：${provider.key}/${ref.id}`), source, related: [ref] });
        }
      }
    }
    const result = compile({ project, projectId: project.projectId, engineVersion: project.engineVersion, lock, scenes, characters,
      debugScenarios: documents.flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('authoring/debug/') && path.endsWith('.json')).map(([, text]) => ({ documentId: document.documentId, revision: document.revision, data: JSON.parse(text).data }))),
      variables: selected('variables/', VariableSchema), assets, assetReferences, gallery: selected('gallery/', GalleryEntrySchema), flows: selected('flows/', FlowSchema), template, pluginDocuments, pluginCommands: providers.pluginCommands?.(),
      documents: documents.filter(document => document.format === 'dsl').map(document => ({ documentId: document.documentId, revision: document.revision, kind: 'scene',
        sceneId: SceneSchema.parse(JSON.parse(Object.entries(document.files).find(([path]) => path.endsWith('/scene.json'))![1]).data).id,
        text: Object.entries(document.files).find(([path]) => path.endsWith('/script.gal'))?.[1] ?? '' })), cancelOperationId: createId() });
    issues.push(...result.issues);
    issues.push(...await providers.validate?.(directory, documents) ?? []);
  } catch (error) { issues.push(problem('RESTORE_VALIDATION', String(error))); }
  return issues;
}
