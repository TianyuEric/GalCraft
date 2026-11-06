import { createId, type Asset, type CommandSpec, type DocumentView, type EditInput, type EditReceipt, type FieldSpec, type Id, type Issue, type Json, type Position, type Result } from '@galcraft/contracts';
import { createCommandRegistry, parse } from '@galcraft/dsl';
import { prepareAuthoringEdit, type AuthorOperation } from '@galcraft/documents/authoring';
import type { SceneSource } from '../../../authoring/controller.js';
import { dataOf, type SceneExtension } from '../application/documents.js';
import type { CandidateSession } from '../application/session.js';

export function commandSource(scene: SceneSource) {
  return parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text });
}

export function commandArgs(value: unknown): Record<string, Json> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json> : {};
}

export function candidateCommandFields(command: string, fields: readonly FieldSpec[], assetKind?: Asset['kind']): FieldSpec[] {
  if (command !== 'changeFigure') return [...fields];
  return fields.flatMap(field => {
    if (field.path !== 'model') return [field];
    if (assetKind === 'image') return [];
    return [{ ...field, children: field.children?.filter(child => !['imageMouth', 'imageBlink', 'imageFaceCombinations'].includes(child.path)) }];
  });
}

export function previewPosition(scene: SceneSource | undefined, statementId: Id | null, draftError?: string): Position | null {
  if (!scene || !statementId || draftError) return null;
  const parsed = commandSource(scene);
  if (parsed.issues.some(issue => issue.severity === 'error') || !parsed.cst.some(node => node.valid && node.id === statementId)) return null;
  return { sceneId: scene.sceneId, statementId };
}

export function previewVersion(documents: readonly DocumentView[], target: Position | null, draftError?: string) {
  return JSON.stringify([documents.map(document => [document.documentId, document.revision]), target, draftError]);
}

export function watchCommandVisibility(node: HTMLElement, update: (visible: boolean) => void) {
  const read = () => update(!node.closest('[hidden]'));
  const observer = new MutationObserver(read);
  for (let element: HTMLElement | null = node; element; element = element.parentElement) {
    observer.observe(element, { attributes: true, attributeFilter: ['hidden'] });
  }
  read();
  return () => observer.disconnect();
}

export async function loadCommandSpecs(session: CandidateSession): Promise<Result<CommandSpec[]>> {
  return await session.services.bridge.plugins?.commandSpecs?.() ?? { ok: true, value: [], warnings: [] };
}

export function commandRegistry(engineVersion: string, specs: readonly CommandSpec[]) {
  const registry = new Map(createCommandRegistry(engineVersion, specs));
  const figure = registry.get('changeFigure');
  if (figure) registry.set(figure.key, { ...figure, fields: candidateCommandFields(figure.key, figure.fields) });
  return registry;
}

type CommandOperation = Extract<AuthorOperation, { sceneId: Id }>;
export type CommandReceipt = { edit: EditReceipt; added: Id[] };
function rejected(code: string, message: string): Result<never> {
  const issue: Issue = { code, message, owner: 'M01', severity: 'error', related: [], actions: ['edit'] };
  return { ok: false, error: issue, issues: [issue] };
}

function insertedCommands(input: EditInput, scene: SceneSource) {
  return input.patches.flatMap(patch => patch.kind === 'text' && patch.documentId === scene.documentId
    ? patch.edits.flatMap(edit => parse({ documentId: scene.documentId, revision: scene.revision, text: edit.after }).cst.flatMap(node => node.valid && node.id ? [node.id] : []))
    : []);
}

function copyInlineEvents(input: EditInput, documents: DocumentView[], scene: SceneSource, originals: Id[], copies: Id[]) {
  const sidecar = documents.find(document => `candidate/scenes/${scene.sceneId}.json` in document.files);
  if (!sidecar) return;
  const before = (dataOf(sidecar) as SceneExtension).events;
  const after = { ...before };
  for (const [index, id] of originals.entries()) {
    const events = before[id];
    if (!events?.length) continue;
    after[copies[index]!] = events.map(event => ({ ...event, id: createId([documents, after]) }));
  }
  if (Object.keys(after).length === Object.keys(before).length) return;
  input.expected.push({ ref: { kind: 'document', id: sidecar.documentId }, revision: sidecar.revision });
  input.patches.push({ kind: 'json', documentId: sidecar.documentId, changes: [{ path: '/data/events', op: 'set', before, after }] });
}

export async function applyCommandOperation(session: CandidateSession, scene: SceneSource, operation: CommandOperation, specs: CommandSpec[], target?: SceneSource): Promise<Result<CommandReceipt>> {
  if (operation.sceneId !== scene.sceneId || operation.op === 'commands.move' && operation.targetSceneId !== (target ?? scene).sceneId) {
    return rejected('CANDIDATE_COMMAND_SCOPE', '指令动作的场景与当前工作面不一致。');
  }
  const documents = session.host.list();
  for (const expected of new Set([scene, target ?? scene])) {
    if (documents.find(document => document.documentId === expected.documentId)?.revision !== expected.revision) {
      return rejected('CANDIDATE_COMMAND_STALE', '场景已变化。请重新选择指令或插入位置，当前输入已保留。');
    }
    const draft = session.getSnapshot().ui.sourceDrafts[expected.sceneId];
    if (draft !== undefined && draft !== expected.text) {
      return rejected('CANDIDATE_COMMAND_DRAFT', '此场景有未应用的源码草稿，请先在源码视图应用或恢复。');
    }
    if (commandSource(expected).issues.some(issue => issue.severity === 'error')) {
      return rejected('CANDIDATE_COMMAND_INVALID', '场景源码有语法错误，请先修复后再编辑指令。');
    }
  }
  const planned = prepareAuthoringEdit(documents.filter(document=>!Object.keys(document.files).some(path=>path.startsWith('candidate/'))), operation, specs);
  if (!planned.ok) return planned;
  const added = operation.op === 'commands.insert' || operation.op === 'commands.duplicate' ? insertedCommands(planned.value, scene) : [];
  if (operation.op === 'commands.duplicate') {
    // The formal duplicate plan emits copied statements in CST order, independent of selection order.
    const originals = commandSource(scene).cst.flatMap(node => node.id && operation.ids.includes(node.id) ? [node.id] : []);
    if (added.length !== originals.length) return rejected('CANDIDATE_COMMAND_COPY', '无法确认复制后的指令标识。请重新选择指令。');
    copyInlineEvents(planned.value, documents, scene, originals, added);
  }
  const result = await session.applyEdit(planned.value);
  return result.ok ? { ...result, value: { edit: result.value, added } } : result;
}
