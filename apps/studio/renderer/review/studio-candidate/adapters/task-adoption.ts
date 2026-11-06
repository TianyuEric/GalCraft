import { AnimationGenerationRequestSchema, CharacterSchema, VoicePresetSchema, createId, resolveAnimationGeneration, type DocumentView, type EditInput, type Json, type Patch, type Result } from '@galcraft/contracts';
import { applyTextEdits, parse } from '@galcraft/dsl';
import { prepareAuthoringEdit, type AuthorOperation } from '@galcraft/documents/authoring';
import { availableAssetName } from '@galcraft/assets/naming';
import type { Candidate, TaskItem } from '@galcraft/authoring/production';
import type { ProductionBridge } from '../../../../desktop-bridge.js';
import { authoringSource } from '../application/documents.js';
import { candidateAssets, prepareCandidateAnimation, prepareCandidateAsset } from '../application/services.js';
import { documentVersion, taskError, taskOk } from './task-model.js';

export type CandidateOutput = { text: string; media: { uri: string; mime: string }[] };
type Choice = NonNullable<Parameters<ProductionBridge['select']>[0]['adoptions']>[string];
export type AdoptionChoice = { candidate: Candidate; item: TaskItem; output: CandidateOutput; choice?: Choice };
const fields = (values: Record<string, Json>) => Object.entries(values).map(([field, value]) => ({ field, value, op: 'set' as const }));
type FieldChange = Extract<AuthorOperation, { op: 'commands.fields' }>['changes'][number];

/** Plans each operation against the accumulated read-only projection. Commits only the final diff. */
export function prepareMediaTaskAdoption(documents: DocumentView[], selections: AdoptionChoice[]): Result<EditInput> {
  const staged = structuredClone(documents);
  const assetIds: string[] = [];
  const edits: Patch[] = [];
  const replaced = new Set<string>();
  const animationTargets = new Set<string>();
  const stage = (patches: Patch[]) => {
    for (const patch of patches) {
      const document = staged.find(value => value.documentId === patch.documentId);
      if (!document) throw new Error('采用位置已离开当前作品。');
      if (patch.kind === 'text') {
        const path = Object.keys(document.files).find(path => path.endsWith('.gal'))!;
        document.files[path] = applyTextEdits(document.files[path]!, patch.edits.map(edit => ({ start: edit.start, end: edit.end, oldText: edit.before, text: edit.after })));
      } else if (patch.kind === 'json') {
        const path = Object.keys(document.files).find(path => path.endsWith('.json'))!;
        const value = JSON.parse(document.files[path]!);
        for (const change of patch.changes) {
          const keys = change.path.slice(1).split('/');
          const member = keys.pop()!;
          const target = keys.reduce((record, key) => record[key], value);
          if (change.op === 'remove') delete target[member];
          else target[member] = change.after;
        }
        document.files[path] = JSON.stringify(value, null, 2) + '\n';
      } else throw new Error('采用需要当前作品已有的文档。');
      edits.push(patch);
    }
  };
  const stageOperation = (op: AuthorOperation) => {
    const result = prepareAuthoringEdit(staged, op);
    if (!result.ok) throw new Error(result.error.message);
    stage(result.value.patches);
  };
  const replaceFields = (sceneId: string, id: string, changes: FieldChange[]) => {
    for (const { field } of changes) {
      const key = sceneId + '/' + id + '/' + field;
      if (replaced.has(key)) throw new Error('同一个语句字段请选择一个候选。');
      replaced.add(key);
    }
    stageOperation({ op: 'commands.fields', sceneId, ids: [id], changes });
  };
  const replace = (sceneId: string, id: string, values: Record<string, Json>) => replaceFields(sceneId, id, fields(values));
  try {
    for (const { candidate, item, output, choice } of selections) {
      const target = item.target;
      const scene = authoringSource(staged).scenes.find(value => value.sceneId === target.sceneId);
      const parsed = scene ? parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst : [];
      const node = parsed.find(value => value.id === target.statementId);
      const beforeId = node?.id ?? (['end', 'changeScene', 'jumpLabel', 'return'].includes(parsed.at(-1)?.command ?? '') ? parsed.at(-1)?.id ?? null : null);
      if (candidate.artifacts.some(artifact => artifact.kind === 'animation' && artifact.role === 'primary')) {
        const input = candidate.input;
        const request = AnimationGenerationRequestSchema.parse(input && typeof input === 'object' && !Array.isArray(input) ? input.fields : undefined);
        const animation = resolveAnimationGeneration(candidate.editedText ?? output.text, request);
        const assets = candidateAssets(staged), existing = assets.find(asset => asset.id === request.assetId);
        if (request.assetId && animationTargets.has(request.assetId)) throw new Error('同一动画素材一次采用一个候选。');
        if (request.assetId) animationTargets.add(request.assetId);
        const name = availableAssetName(choice?.name || existing?.name || 'animation.gca', assets.filter(asset => asset.id !== request.assetId).map(asset => asset.name));
        const prepared = prepareCandidateAnimation(staged, { name, animation, assetId: request.assetId ?? undefined, expectedRevision: request.assetRevision ?? undefined });
        if (!prepared.ok) return prepared;
        const asset = prepared.value.asset;
        if (!existing) asset.source = { kind: 'generation', description: '候选审核动画', usage: 'localReview', taskId: candidate.taskId, candidateId: candidate.id };
        stage(prepared.value.input.patches);
        assetIds.push(asset.id);
        if (choice?.mode === 'bind') {
          if (!scene || !node?.id || !['setAnimation', 'setComplexAnimation'].includes(node.command)) throw new Error('请选择冻结的动画指令。');
          const current = node.object?.value as Record<string, unknown> | undefined;
          const changes: FieldChange[] = node.command === 'setAnimation' ? fields({ presetId: asset.id })
            : [...fields({ resourceId: asset.id }), ...['animation', 'segments'].filter(key => current?.[key] != null).map(field => ({ field, op: 'inherit' as const, value: null }))];
          replaceFields(scene.sceneId, node.id, changes);
        }
        continue;
      }
      if (output.media.length) {
        const media = output.media[0]!;
        const name = availableAssetName(choice?.name || candidate.artifacts[0]!.localPath, candidateAssets(staged).map(asset => asset.name));
        const asset = prepareCandidateAsset(staged, { name, mime: media.mime, uri: media.uri, usage: target.usage });
        if (!asset.ok) return asset;
        stage(asset.value.input.patches);
        const assetId = asset.value.asset.id;
        assetIds.push(assetId);
        if (choice?.mode === 'voicePreset') {
          const preset = choice.voicePreset;
          const document = preset && staged.find(value => `characters/${preset.characterId}.json` in value.files);
          if (target.usage !== 'voice' || !preset || !document) throw new Error('请为参考声音选择有效角色。');
          const path = `characters/${preset.characterId}.json`;
          const data = CharacterSchema.parse(JSON.parse(document.files[path]!).data);
          const old = data.voicePresets[preset.locale];
          const updated = VoicePresetSchema.parse({ id: old?.id ?? createId(staged), revision: (old?.revision ?? 0) + 1, speed: old?.speed ?? 1,
            emotion: old?.emotion ?? null, advanced: old?.advanced ?? {}, model: preset.model, connectionId: preset.connectionId, locale: preset.locale,
            voice: { kind: 'reference', assetId, transcript: preset.transcript, locale: preset.referenceLocale } });
          stageOperation({ op: 'character.update', id: preset.characterId, changes: { voicePresets: { ...data.voicePresets, [preset.locale]: updated } } });
          continue;
        }
        if (choice?.mode !== 'bind') continue;
        if (!scene) throw new Error('请选择有效的采用场景。');
        if (target.usage === 'voice') {
          if (node?.command !== 'say' || !node.id) throw new Error('请选中一条有效对白再绑定语音。');
          const previous = node.object?.value as { voiceByLocale?: Record<string, Json> } | undefined;
          replace(scene.sceneId, node.id, target.locale ? { voiceByLocale: { ...previous?.voiceByLocale, [target.locale]: assetId } } : { voice: assetId });
          continue;
        }
        const visual = ['figure', 'difference', 'cg'].includes(target.usage);
        if (target.usage === 'ui') throw new Error('UI 素材可入库后在页面组件中选择。');
        const allowed = target.usage === 'background' ? ['changeBg'] : target.usage === 'bgm' ? ['bgm'] : ['changeFigure', 'changeIllustration', 'changeIllustrationDiff'];
        if (choice.placement === 'replace' && (!node?.id || !allowed.includes(node.command))) throw new Error('请选择用途匹配的替换指令。');
        const args: Record<string, Json> = { assetId };
        if (target.usage === 'background') Object.assign(args, choice.frame ?? item.backgroundPreview?.frame);
        const operation = (node?.object?.value as { op?: string } | undefined)?.op;
        const match = node?.id && allowed.includes(node.command) && operation !== 'clear' && operation !== 'exit' && operation !== 'stop';
        if (choice.placement !== 'new' && match && (!visual || choice.placement === 'replace')) {
          if (node.command === 'changeIllustrationDiff') args.stateName = null;
          replace(scene.sceneId, node.id!, args);
        } else {
          if (choice.placement === 'replace') throw new Error('所选指令不是可替换的演出对象。');
          const command = target.usage === 'background' ? 'changeBg' : target.usage === 'bgm' ? 'bgm'
            : choice.use === 'figure' && target.characterId ? 'changeFigure' : 'changeIllustration';
          if (command === 'changeFigure') args.characterId = target.characterId;
          if (command === 'bgm') args.op = 'play';
          stageOperation({ op: 'commands.insert', sceneId: scene.sceneId, beforeId, commands: [{ command, args }] });
        }
        continue;
      }
      throw new Error('此候选没有可采用的媒体产物；讨论与准备文字用于继续制作。');
    }
  } catch (cause) {
    return taskError('ADOPTION_INVALID', cause instanceof Error ? cause.message : String(cause));
  }
  const touched = new Set(edits.map(patch => patch.documentId));
  const patches: Patch[] = edits.filter(patch => patch.kind !== 'text');
  for (const documentId of touched) {
    const original = documents.find(value => value.documentId === documentId)!;
    const next = staged.find(value => value.documentId === documentId)!;
    for (const [path, before] of Object.entries(original.files)) if (path.endsWith('.gal') && next.files[path] !== before)
      patches.push({ kind: 'text', documentId, edits: [{ start: 0, end: before.length, before, after: next.files[path]! }] });
  }
  if (!patches.length) return taskError('ADOPTION_EMPTY', '此候选没有产生作品修改。');
  return taskOk({ label: '采用制作候选', origin: 'candidate', expected: documents.filter(document => touched.has(document.documentId)).map(documentVersion),
    patches, preparedAssets: assetIds, requiredRefs: [] });
}
