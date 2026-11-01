import { DialogueContentSchema, dialoguePlainText } from '@galcraft/contracts';
import type { Id } from '@galcraft/contracts';
import { createCommandRegistry, parse, type ParseResult } from '@galcraft/dsl';
import { commandName } from './command-picker.js';
import type { AuthoringSource } from './controller.js';

export type MoveInstruction = { id: Id; name: string; preview: string };
export type MoveScene = { id: Id; name: string; label: string; instructions: MoveInstruction[]; error: string };
export type MovePosition = 'end' | 'start' | 'before';
export type MoveInstructionsModel = { sourceName: string; instructions: MoveInstruction[]; scenes: MoveScene[]; error: string };
const text = (locale: string, zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;

export function buildMoveInstructionsModel(source: AuthoringSource, sourceSceneId: Id, selected: readonly Id[], locale: string,
  writingDrafts: ReadonlyMap<Id, string> = new Map()): MoveInstructionsModel {
  const registry = createCommandRegistry(source.project.engineVersion);
  const instructions = (parsed: ParseResult, drafts = false): MoveInstruction[] => parsed.cst.flatMap(node => {
    if (!node.valid || !node.id) return [];
    const spec = registry.get(node.command), args = node.object?.value as Record<string, unknown> | undefined;
    const name = spec ? commandName(spec, locale) : text(locale, '扩展指令', 'Extension instruction', '拡張命令');
    const target = typeof args?.sceneId === 'string' ? source.scenes.find(scene => scene.sceneId === args.sceneId)?.name : '';
    const raw = drafts && writingDrafts.has(node.id) ? writingDrafts.get(node.id)! : DialogueContentSchema.safeParse(args?.text).success ? dialoguePlainText(DialogueContentSchema.parse(args?.text)) :
      typeof args?.name === 'string' ? args.name : target || '';
    const preview = raw.replace(/\s+/g, ' ').trim();
    return [{ id: node.id, name, preview: preview.length > 90 ? preview.slice(0, 90) + '…' : preview }];
  });
  const entries = source.scenes.map(scene => {
    const parsed = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text });
    return { scene, parsed, instructions: instructions(parsed, scene.sceneId === sourceSceneId),
      error: parsed.issues.some(issue => issue.severity === 'error') ? text(locale,
        `「${scene.name}」源码存在语法错误。请先修复此场景，再移动指令。`,
        `“${scene.name}” has source syntax errors. Fix this scene before moving instructions.`,
        `「${scene.name}」のソースに構文エラーがあります。修正してから命令を移動してください。`) : '' };
  });
  const origin = entries.find(entry => entry.scene.sceneId === sourceSceneId), chosen = new Set(selected);
  const missing = selected.some(id => !origin?.instructions.some(instruction => instruction.id === id));
  return { sourceName: origin?.scene.name ?? '', instructions: origin?.instructions.filter(instruction => chosen.has(instruction.id)) ?? [],
    error: origin?.error || (!origin || missing || !chosen.size ? text(locale, '所选指令已变化，请重新选择。', 'The selected instructions changed. Select them again.', '選択した命令が変更されました。選択し直してください。') : ''),
    scenes: entries.filter(entry => entry.scene.sceneId !== sourceSceneId).map(entry => ({ id: entry.scene.sceneId, name: entry.scene.name,
      label: `${source.project.chapters.find(chapter => chapter.id === entry.scene.chapterId)?.name ?? text(locale, '未分章节', 'No chapter', '章なし')} / ${entry.scene.name}`,
      instructions: entry.instructions, error: entry.error })) };
}

export function resolveMovePosition(target: MoveScene, position: MovePosition, beforeId: Id | null, locale: string): { beforeId: Id | null; error: string } {
  if (target.error) return { beforeId: null, error: target.error };
  if (position === 'end') return { beforeId: null, error: '' };
  if (position === 'start') return { beforeId: target.instructions[0]?.id ?? null, error: '' };
  if (beforeId && target.instructions.some(instruction => instruction.id === beforeId)) return { beforeId, error: '' };
  return { beforeId: null, error: text(locale, target.instructions.length ? '请选择要插入到哪条指令之前。' : '目标场景为空，请选择开头或末尾。',
    target.instructions.length ? 'Choose the instruction to insert before.' : 'The target scene is empty. Choose start or end.',
    target.instructions.length ? 'どの命令の前に挿入するか選択してください。' : '移動先のシーンは空です。先頭または末尾を選択してください。') };
}
