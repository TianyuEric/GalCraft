import { createId, type EditInput } from '@galcraft/contracts';
import type { Project, Id } from '@galcraft/contracts';
export type AuthoringSource = { projectDocumentId: Id; projectRevision: number; project: Project; scenes: {sceneId:Id;documentId:Id;revision:number;name:string;chapterId:Id}[] };

const base = (source: AuthoringSource, label: string): EditInput => ({ label, origin: 'field', expected: [{ ref: { kind: 'document', id: source.projectDocumentId }, revision: source.projectRevision }], patches: [], preparedAssets: [], requiredRefs: [] });
export function renameWorkbenchObject(source: AuthoringSource, id: string, name: string): EditInput | string | null {
  const trimmed = name.trim(); if (!trimmed) return '名称不能为空';
  const chapter = source.project.chapters.find(item => item.id === id), scene = source.scenes.find(item => item.sceneId === id);
  if (!chapter && !scene) return '对象已变化，请重新选择';
  const siblings = chapter ? source.project.chapters : source.scenes.filter(item => item.chapterId === scene!.chapterId).map(item => ({ id: item.sceneId, name: item.name }));
  if (siblings.some(item => item.id !== id && item.name === trimmed)) return '同一分组已有此名称';
  if ((chapter ?? scene)!.name === trimmed) return null;
  const input = base(source, `重命名${chapter ? '章节' : '场景'} ${(chapter ?? scene)!.name}`);
  if (chapter) input.patches.push({ kind: 'json', documentId: source.projectDocumentId, changes: [{ path: '/data/chapters', before: source.project.chapters, after: source.project.chapters.map(item => item.id === id ? { ...item, name: trimmed } : item), op: 'set' }] });
  else { input.expected = [{ ref: { kind: 'document', id: scene!.documentId }, revision: scene!.revision }]; input.patches.push({ kind: 'json', documentId: scene!.documentId, changes: [{ path: '/data/name', before: scene!.name, after: trimmed, op: 'set' }] }); }
  return input;
}
export function createWorkbenchChapter(source: AuthoringSource, name: string): EditInput | string {
  const trimmed = name.trim(); if (!trimmed) return '章节名称不能为空';
  if (source.project.chapters.some(item => item.name === trimmed)) return '已有此章节名称';
  const input = base(source, `新建章节 ${trimmed}`);
  input.patches.push({ kind: 'json', documentId: source.projectDocumentId, changes: [{ path: '/data/chapters', before: source.project.chapters, after: [...source.project.chapters, { id: createId(source), name: trimmed, sceneIds: [] }], op: 'set' }] }); return input;
}
export function moveWorkbenchObjects(source: AuthoringSource, ids: string[], targetId: string | null, index?: number): EditInput | string | null {
  const target = source.project.chapters.find(item => item.id === targetId);
  const selected = new Set(ids), chapters = source.project.chapters.filter(item => selected.has(item.id)), scenes = source.scenes.filter(item => selected.has(item.sceneId));
  if (chapters.length && scenes.length) return '请分别移动章节或场景';
  if (!chapters.length && !target) return '目标章节已变化';
  if (chapters.length && index !== undefined && targetId !== null) return '章节只能在顶层排序';
  const input = base(source, chapters.length ? `移动 ${chapters.length} 个章节` : `移动 ${scenes.length} 个场景到 ${target!.name}`);
  let next = source.project.chapters;
  if (chapters.length) {
    if (index === undefined && (!target || selected.has(targetId!))) return null;
    const slot = index ?? source.project.chapters.findIndex(item => item.id === targetId);
    const at = slot - source.project.chapters.slice(0, slot).filter(item => selected.has(item.id)).length;
    next = source.project.chapters.filter(item => !selected.has(item.id)); next.splice(Math.max(0, at), 0, ...chapters);
  } else {
    if (!scenes.length) return '请选择场景或章节';
    const ordered = source.project.chapters.flatMap(chapter => chapter.sceneIds).filter(id => selected.has(id));
    if (index === undefined && scenes.every(scene => scene.chapterId === targetId) && target!.sceneIds.slice(-ordered.length).every((id, index) => id === ordered[index])) return null;
    const slot = index ?? target!.sceneIds.length;
    const at = slot - target!.sceneIds.slice(0, slot).filter(id => selected.has(id)).length;
    next = source.project.chapters.map(chapter => { const sceneIds = chapter.sceneIds.filter(id => !selected.has(id)); if (chapter.id === targetId) sceneIds.splice(Math.max(0, at), 0, ...ordered); return { ...chapter, sceneIds }; });
    for (const scene of scenes) if (scene.chapterId !== targetId) { input.expected.push({ ref: { kind: 'document', id: scene.documentId }, revision: scene.revision }); input.patches.push({ kind: 'json', documentId: scene.documentId, changes: [{ path: '/data/chapterId', before: scene.chapterId, after: targetId, op: 'set' }] }); }
  }
  if (JSON.stringify(next) === JSON.stringify(source.project.chapters)) return null;
  input.patches.unshift({ kind: 'json', documentId: source.projectDocumentId, changes: [{ path: '/data/chapters', before: source.project.chapters, after: next, op: 'set' }] }); return input;
}
