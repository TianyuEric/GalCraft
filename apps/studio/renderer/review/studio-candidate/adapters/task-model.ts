import { createId, dialoguePlainText, DialogueContentSchema, GenerationInputSchema, type DocumentView, type Issue, type Result, type VersionRef } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import type { ContextPart, TaskItem } from '@galcraft/authoring/production';
import { inputTextSummary } from '@galcraft/authoring/production/preview';
import type { Overview, ProductionBridge } from '../../../../desktop-bridge.js';
import { authoringSource } from '../application/documents.js';
import type { CandidateSession } from '../application/session.js';

export const taskOk = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export function taskIssue(code: string, message: string, owner: 'M10' | 'M12' = 'M10'): Issue {
  return { code, message, owner, severity: 'error', related: [], actions: [] };
}
export function taskError<T>(code: string, message: string, owner: 'M10' | 'M12' = 'M10'): Result<T> {
  const error = taskIssue(code, message, owner);
  return { ok: false, error, issues: [error] };
}
export const taskTime = () => new Date().toISOString();
export const documentVersion = (document: Pick<DocumentView, 'documentId' | 'revision'>): VersionRef =>
  ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
export const unsupported = async <T>(): Promise<Result<T>> => taskError('REVIEW_HOST_UNAVAILABLE', '此操作需要原生文件或外部执行宿主。');

export function requestSummary(item: TaskItem) {
  const parsed = GenerationInputSchema.safeParse(item.input);
  const config = item.configSnapshot;
  let endpoint = '';
  if (config?.baseUrl) {
    try { endpoint = new URL(config.baseUrl).origin; } catch { /* Invalid routes are handled by connection validation. */ }
  }
  const input = parsed.success ? parsed.data : null;
  const attachments = !input ? [] : input.purpose === 'text' ? input.messages.flatMap(message => message.attachments)
    : input.purpose === 'image' || 'fields' in input ? input.references
    : input.purpose === 'difference' || input.purpose === 'matting' ? [input.reference]
    : input.purpose === 'speech' && input.referenceAudio ? [input.referenceAudio] : [];
  return {
    itemId: item.id,
    destination: [config?.name ?? '审核宿主', endpoint].filter(Boolean).join(' · '),
    model: config?.model ?? '',
    textCharacters: input ? inputTextSummary(input).textCharacters : 0,
    media: attachments.map(value => 'variantId' in value && value.variantId ? `${value.localPath} · ${value.variantId}` : value.localPath),
    requests: 1,
    price: null,
  };
}

export function projectTaskSource(documents: DocumentView[]) {
  const source = authoringSource(documents);
  const scenes = source.scenes.map(scene => ({
    id: scene.sceneId, documentId: scene.documentId, revision: scene.revision, name: scene.name,
    statements: parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst.flatMap(node => {
      if (!node.id || !node.valid) return [];
      const args = node.object?.value as { speaker?: { kind?: string; id?: string }; text?: unknown; silent?: boolean } | undefined;
      const content = DialogueContentSchema.safeParse(args?.text);
      return [{
        id: node.id, command: node.command, label: content.success ? dialoguePlainText(content.data) : node.command,
        characterId: args?.speaker?.kind === 'character' ? args.speaker.id ?? null : null, silent: args?.silent,
      }];
    }),
  })) satisfies Overview['scenes'];
  const pages = documents.flatMap(document => Object.entries(document.files).flatMap(([path, raw]) => {
    if (!path.endsWith('.json') || !path.includes('pages/')) return [];
    const data = JSON.parse(raw).data as { id?: string; key?: string; titleKey?: string };
    return data?.id && data.key ? [{ id: data.id, key: data.key, documentId: document.documentId, revision: document.revision }] : [];
  }));
  return { ...source, scenes, pages, versions: documents.map(documentVersion) };
}

export function captureTaskContext(documents: DocumentView[], input: Parameters<ProductionBridge['context']>[0]): ContextPart[] {
  const source = authoringSource(documents);
  const scene = source.scenes.find(item => item.sceneId === input.sceneId);
  const pages: ContextPart[] = input.pageIds.flatMap(id => {
    const path = 'ui/pages/' + id + '.json';
    const document = documents.find(value => path in value.files);
    if (!document) return [];
    const data = JSON.parse(document.files[path]!).data as { key: string };
    return [{ id: createId(documents), kind: 'ui', label: data.key, included: true, source: documentVersion(document),
      text: JSON.stringify(data, null, 2), media: null, attachment: null, authorEdited: false }];
  });
  if (!scene) return pages;
  const parsed = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text });
  const selected = input.statementIds?.length ? input.statementIds : input.statementId ? [input.statementId] : [];
  let text = scene.text;
  if (selected.length && !input.performance) {
    text = parsed.cst.filter(node => node.id && selected.includes(node.id)).map(node => scene.text.slice(node.start, node.end)).join('\n');
  }
  if (input.textRange && selected.length === 1) {
    const node = parsed.cst.find(node => node.id === selected[0]);
    const content = DialogueContentSchema.safeParse((node?.object?.value as { text?: unknown } | undefined)?.text);
    if (content.success) text = dialoguePlainText(content.data).slice(input.textRange.start, input.textRange.end);
  }
  return [...pages, {
    id: createId(documents), kind: 'script', label: scene.name, included: true, source: documentVersion(scene), text,
    media: null, attachment: null, authorEdited: false,
  }];
}

export function currentVersions(documents: DocumentView[], expected: readonly VersionRef[]) {
  return expected.every(version => version.ref.kind === 'document'
    && documents.some(document => document.documentId === version.ref.id && document.revision === version.revision));
}

export function hasUnappliedTaskSource(session: CandidateSession, documentIds: string[]) {
  const drafts = session.getSnapshot().ui.sourceDrafts;
  if (!Object.keys(drafts).length) return false;
  return authoringSource(session.host.list()).scenes.some(scene => documentIds.includes(scene.documentId)
    && drafts[scene.sceneId] !== undefined && drafts[scene.sceneId] !== scene.text);
}
