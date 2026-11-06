import { afterEach, describe, expect, it } from 'vitest';
import { DialogueContentSchema, DocumentViewSchema, IdSchema, type Result } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import { sourceLine } from '../../../studio-r0/model.js';
import { candidateFixture } from '../../../stories/review/studio-candidate/fixtures.js';
import { createReviewSeed } from '../../../stories/review/studio-r0/galcraft/fixtures.js';
import { createCandidateHost, type CandidateHost } from '../adapters/candidate-host.js';
import { workbenchBridge } from '../../../pages/Production/bridge.js';
import { authoringSource, createCandidateSeed, createEmptyCandidateSeed, copyCandidateIdentity, dataOf, prepareCandidateEdit, projectProjection, type CandidateSeed, type SceneExtension } from './documents.js';
import { fail, ok } from './services.js';
import { CandidateSession } from './session.js';

const sessions: CandidateSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); });

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code + ': ' + result.error.message);
  return result.value;
}

async function openCandidate() {
  const { seed, createServices } = candidateFixture();
  const session = new CandidateSession(seed, createServices);
  sessions.push(session);
  await session.open();
  expect(session.getSnapshot().ready).toBe(true);
  return session;
}

function sceneSource(host: CandidateHost, sceneId: string) {
  return authoringSource(host.list()).scenes.find(scene => scene.sceneId === sceneId)!;
}

function sceneNodes(host: CandidateHost, sceneId: string) {
  const source = sceneSource(host, sceneId);
  const parsed = parse({ documentId: source.documentId, revision: source.revision, text: source.text });
  expect(parsed.issues.filter(issue => issue.severity === 'error')).toEqual([]);
  return parsed.cst;
}

function storedDialogue(host: CandidateHost, sceneId: string, lineId: string) {
  const node = sceneNodes(host, sceneId).find(node => node.id === lineId)!;
  return DialogueContentSchema.parse((node.object!.value as Record<string, unknown>).text);
}

function storedEvents(host: CandidateHost, seed: CandidateSeed, sceneId: string) {
  const doc = host.list().find(document => document.documentId === seed.extensionDocuments[sceneId])!;
  return (dataOf(doc) as SceneExtension).events;
}

function firstAnchoredLine(session: CandidateSession) {
  const scene = projectProjection(session.host.list(), session.seed).scenes[0]!;
  return { scene, line: scene.lines.find(line => line.events.length > 0)! };
}

describe('candidate scene documents', () => {
  it('saves the active document while retaining another document and then saves the whole work', async () => {
    const session=await openCandidate(),[first,second]=session.getSnapshot().project.scenes;
    session.updateText(first!.id,first!.lines[0]!.id,first!.lines[0]!.text+' 第一幕修改');session.endEditGroup();
    session.updateText(second!.id,second!.lines[0]!.id,second!.lines[0]!.text+' 第二幕修改');session.endEditGroup();
    session.activateView(`writing:${first!.id}`);
    expect(await session.save(false)).toBe(true);
    expect(session.host.list().find(document=>document.documentId===session.documentId(first!.id))!.dirty).toBe(false);
    expect(session.host.list().find(document=>document.documentId===session.documentId(second!.id))!.dirty).toBe(true);
    await session.reviewSave();
    expect(session.getSnapshot().saveReview!.plan.members).toContain(session.documentId(second!.id));
    expect(session.getSnapshot().saveReview!.plan.members).not.toContain(session.documentId(first!.id));
    session.closeSaveReview();expect(await session.save()).toBe(true);expect(session.getSnapshot().dirty).toBe(false);
  });

  it('keeps manuscript commands with the document when changing to production and collaboration', async () => {
    const session = await openCandidate(), { scene, line } = firstAnchoredLine(session);
    const documentId = session.documentId(scene.id), edited = `${line.text} 未保存文稿`;
    const sceneDocument = () => session.host.list().find(document => document.documentId === documentId)!;
    session.updateText(scene.id, line.id, edited);
    session.activateView('production');
    expect(session.getSnapshot()).toMatchObject({ commandTarget: '', canSaveCurrent: true, canUndo: false, canRedo: false });
    expect(await session.save(false)).toBe(true);
    await session.undo();
    expect(sceneDocument().dirty).toBe(true);
    expect(storedDialogue(session.host, scene.id, line.id)).toBe(edited);

    const { production } = session.tasks;
    await session.tasks.openDraft('script', documentId, line.id);
    production.field('instruction', '为文稿另做制作草稿');
    expect(production.draftDirty).toBe(true);
    session.activateView('production-inspector');
    expect(await session.save(false)).toBe(true);
    expect(production.draftDirty).toBe(false);
    expect(unwrap(await production.bridge.production.overview()).drafts).toContainEqual(production.draft);
    expect(sceneDocument().dirty).toBe(true);

    for (const view of ['production-explorer', 'collaboration', 'collaboration-explorer', 'collaboration-inspector', 'outline']) {
      session.activateView(view);
      expect(session.getSnapshot()).toMatchObject({ commandTarget: '', canSaveCurrent: false, canUndo: false, canRedo: false });
      expect(await session.save(false)).toBe(false);
      await session.undo();
      await session.redo();
      expect(sceneDocument().dirty).toBe(true);
      expect(storedDialogue(session.host, scene.id, line.id)).toBe(edited);
    }
    expect(await session.save(false, documentId)).toBe(true);
    expect(sceneDocument().dirty).toBe(false);
    session.updateText(scene.id, line.id, `${edited} 再编辑`);
    expect(await session.save()).toBe(true);
    expect(sceneDocument().dirty).toBe(false);
  });

  it('checks guarded history members before applying direct and reviewed operations', async () => {
    const session = await openCandidate();
    const { plugins, documents } = workbenchBridge(session.services.bridge);
    const pluginId = 'org.galcraft.affection';
    const manifest = unwrap(await plugins.list()).entries.find(entry => entry.manifest.id === pluginId)!.manifest;
    const enabled = async () => unwrap(await plugins.list()).lock?.plugins.some(entry => entry.id === pluginId);
    const { edit } = unwrap(await plugins.planChange({ pluginId, version: manifest.version }));
    const lockId = edit.members[0]!;
    unwrap(await documents.applyEdit(edit.planId, edit.input.expected));
    let open = true;
    const blocked = '插件文档仍然打开';
    const unregister = session.registerHistoryGuard(plan => open && plan.members.includes(lockId) ? fail(blocked) : ok(undefined));
    expect(await documents.planUndo(lockId)).toMatchObject({ ok: false, error: { message: blocked } });
    expect(await session.tasks.production.bridge.documents.planUndo(lockId)).toMatchObject({ ok: false, error: { message: blocked } });
    open = false;
    const planned = unwrap(await documents.planUndo(lockId));
    open = true;
    expect(await documents.undo(planned.planId)).toMatchObject({ ok: false, error: { message: blocked } });
    expect(await enabled()).toBe(true);

    session.activateView('plugin-package');
    await session.undo();
    expect(await enabled()).toBe(true);
    expect(session.getSnapshot().ui.notice).toBe(blocked);
    open = false;
    await session.undo();
    expect(await enabled()).toBe(false);
    open = true;
    await session.redo();
    expect(await enabled()).toBe(false);
    expect(session.getSnapshot().ui.notice).toBe(blocked);
    open = false;
    await session.redo();
    expect(await enabled()).toBe(true);

    const project = session.host.list().find(document => 'project.json' in document.files)!;
    const name = session.getSnapshot().project.name;
    const disable = unwrap(await plugins.planChange({ pluginId, version: null })).edit.input;
    unwrap(await session.applyEdit({ ...disable,
      expected: [...disable.expected, { ref: { kind: 'document', id: project.documentId }, revision: project.revision }],
      patches: [...disable.patches, { kind: 'json', documentId: project.documentId, changes: [{ path: '/data/name', op: 'set', before: name, after: `${name} 已停用` }] }],
    }));
    // A later lock edit joins undo from the project document.
    const reenable = unwrap(await plugins.planChange({ pluginId, version: manifest.version })).edit;
    unwrap(await documents.applyEdit(reenable.planId, reenable.input.expected));
    session.activateView('settings');
    open = true;
    await session.undo();
    expect(session.getSnapshot().historyReview).toBeNull();
    expect(session.getSnapshot().ui.notice).toBe(blocked);
    open = false;
    const reviewed = session.undo();
    await expect.poll(() => session.getSnapshot().historyReview?.members).toEqual(expect.arrayContaining([lockId, project.documentId]));
    open = true;
    session.confirmHistory(true);
    await reviewed;
    expect(await enabled()).toBe(true);
    expect(session.getSnapshot().project.name).toBe(`${name} 已停用`);
    expect(session.getSnapshot().ui.notice).toBe(blocked);
    unregister();
  });
  it('creates an empty independent work and gives a recovery copy a real project identity', () => {
    const base=createCandidateSeed(createReviewSeed()), first=createEmptyCandidateSeed(base,'空白作品'),second=createEmptyCandidateSeed(base,'另一作品');
    for(const seed of [first,second]){
      const projection=projectProjection(seed.documents,seed);
      expect(projection.assets).toEqual([]);expect(projection.characters).toEqual([]);
      expect(projection.scenes).toHaveLength(1);expect(projection.scenes[0]!.lines).toEqual([]);
      expect(authoringSource(seed.documents).project.projectId).toBe(seed.presentation.id);
    }
    const firstIds=new Set(first.documents.map(document=>document.documentId));
    expect(second.documents.every(document=>!firstIds.has(document.documentId))).toBe(true);
    base.taskRecovery={production:{drafts:[{projectId:base.presentation.id}]},collaboration:{sessionId:'original-session'}};
    const copy=copyCandidateIdentity(base,'恢复前副本');
    expect(copy.taskRecovery).toBeUndefined();expect(base.taskRecovery).toBeDefined();
    expect(authoringSource(copy.documents).project).toMatchObject({projectId:copy.presentation.id,name:'恢复前副本'});
    expect(copy.presentation.id).not.toBe(base.presentation.id);
    expect(authoringSource(base.documents).project.name).not.toBe('恢复前副本');
  });

  it('requires a decision before undoing later changes in another related document', async () => {
    const session=await openCandidate(),[first,second]=session.getSnapshot().project.scenes;
    const a=first!.lines[0]!,b=second!.lines[0]!;
    session.edit('关联两幕',project=>{project.scenes[0]!.lines[0]!.text+=' 共同修改';project.scenes[1]!.lines[0]!.text+=' 共同修改';});
    session.endEditGroup();session.updateText(second!.id,b.id,b.text+' 后续独立修改');session.endEditGroup();
    const cancel=session.undo(first!.id);
    await expect.poll(()=>session.getSnapshot().historyReview).not.toBeNull();
    expect(storedDialogue(session.host,second!.id,b.id)).toBe(b.text+' 后续独立修改');
    session.confirmHistory(false);await cancel;
    expect(storedDialogue(session.host,first!.id,a.id)).toBe(a.text+' 共同修改');
    const accepted=session.undo(first!.id);
    await expect.poll(()=>session.getSnapshot().historyReview).not.toBeNull();
    session.confirmHistory(true);await accepted;
    expect(storedDialogue(session.host,first!.id,a.id)).toBe(a.text);
    expect(storedDialogue(session.host,second!.id,b.id)).toBe(b.text);
  });

  it('uses the selected position when inserting repeated characters and keeps the history atomic', async () => {
    const session = await openCandidate();
    const { scene, line } = firstAnchoredLine(session);
    session.edit('准备重复汉字', project => { const target = project.scenes[0]!.lines.find(item => item.id === line.id)!; target.text = '甲甲甲'; target.events = [{ ...line.events[0]!, offset: 1 }]; });
    session.endEditGroup();
    const span = { start: { lineId: line.id, offset: 0 }, end: { lineId: line.id, offset: 0 } };
    session.replaceTextSelection(scene.id, span, '甲', 'continuous');
    expect(storedDialogue(session.host, scene.id, line.id)).toBe('甲甲甲甲');
    expect(storedEvents(session.host, session.seed, scene.id)[line.id]![0]!.offset).toBe(2);
    await session.undo(scene.id);
    expect(storedDialogue(session.host, scene.id, line.id)).toBe('甲甲甲');
    expect(storedEvents(session.host, session.seed, scene.id)[line.id]![0]!.offset).toBe(1);
  });

  it('preserves a middle anchor through two separate source edits and undo', async () => {
    const session = await openCandidate();
    const { scene, line } = firstAnchoredLine(session);
    session.edit('准备源码锚点', project => { const target = project.scenes[0]!.lines.find(item => item.id === line.id)!; target.text = '开头中间结尾'; target.events = [{ ...line.events[0]!, offset: 3 }]; });
    const source = session.sceneSource(scene.id)!;
    expect(await session.commitSource(scene.id, source.text.replace('开头中间结尾', 'A开头中间结尾B'))).toBe(true);
    expect(storedEvents(session.host, session.seed, scene.id)[line.id]![0]!.offset).toBe(4);
    await session.undo(scene.id);
    expect(storedDialogue(session.host, scene.id, line.id)).toBe('开头中间结尾');
    expect(storedEvents(session.host, session.seed, scene.id)[line.id]![0]!.offset).toBe(3);
  });

  it('keeps an event immediately before deleted text at its boundary', async () => {
    const session = await openCandidate();
    const { scene, line } = firstAnchoredLine(session);
    session.edit('准备删除边界', project => { const target = project.scenes[0]!.lines.find(item => item.id === line.id)!; target.text = '甲乙丙'; target.events = [{ ...line.events[0]!, offset: 1 }]; });
    session.replaceTextSelection(scene.id, { start: { lineId: line.id, offset: 1 }, end: { lineId: line.id, offset: 2 } }, '', 'typing');
    expect(storedDialogue(session.host, scene.id, line.id)).toBe('甲丙');
    expect(storedEvents(session.host, session.seed, scene.id)[line.id]).toEqual([{ ...line.events[0]!, offset: 1 }]);
  });

  it('retains exact rich segments when splitting repeated glyphs', async () => {
    const session = await openCandidate();
    const { scene, line } = firstAnchoredLine(session), source = session.sceneSource(scene.id)!;
    const rich = { segments: [{ text: '甲', bold: true }, { text: '甲', ruby: 'B' }, { text: '甲', ruby: 'C' }] };
    expect(await session.commitSource(scene.id, source.text.replace(JSON.stringify(line.text), JSON.stringify(rich)))).toBe(true);
    const span = { start: { lineId: line.id, offset: 1 }, end: { lineId: line.id, offset: 1 } };
    const caret = session.replaceTextSelection(scene.id, span, '\n')!;
    expect(storedDialogue(session.host, scene.id, line.id)).toEqual({ segments: [rich.segments[0]] });
    expect(storedDialogue(session.host, scene.id, caret.lineId)).toEqual({ segments: rich.segments.slice(1) });
  });

  it('edits manuscript and shifts existing anchors in one undoable working change', async () => {
    const session = await openCandidate();
    const { host, seed } = session;
    const { scene, line } = firstAnchoredLine(session);
    const prefix = '远远地，';
    session.target(scene.id);
    session.updateText(scene.id, line.id, prefix + line.text);

    expect(storedDialogue(host, scene.id, line.id)).toBe(prefix + line.text);
    expect(storedEvents(host, seed, scene.id)[line.id]).toEqual(line.events.map(event => ({ ...event, offset: event.offset + prefix.length })));
    await session.undo();
    expect(storedDialogue(host, scene.id, line.id)).toBe(line.text);
    expect(storedEvents(host, seed, scene.id)[line.id]).toEqual(line.events);
    expect(host.history(seed.sceneDocuments[scene.id]!).canUndo).toBe(false);
  });

  it('keeps rich text on both split lines and preserves the existing command order', async () => {
    const review = createReviewSeed();
    const original = review.project.scenes[0]!;
    original.lines = [
      { id: 'head', speakerId: null, text: '前文尾句', events: [{ id: 'marker', kind: 'pause', offset: 3, value: '', durationMs: 200 }] },
      { id: 'next', speakerId: null, text: '下一句', events: [] },
    ];
    const seed = createCandidateSeed(review);
    const sceneId = Object.keys(seed.sceneDocuments)[0]!;
    const document = seed.documents.find(document => document.documentId === seed.sceneDocuments[sceneId])!;
    const path = 'scenes/' + sceneId + '/script.gal';
    const before = projectProjection(seed.documents, seed);
    const [first, second] = before.scenes[0]!.lines;
    const tail = { text: '尾句', color: '#345ABC', ruby: 'びく' };
    document.files[path] = [
      'wait {"durationMs":100} @Wait01;',
      'say ' + JSON.stringify({ speaker: { kind: 'narrator' }, text: { segments: [{ text: '前文', bold: true }, tail] } }) + ' @' + first!.id + ';',
      'wait {"durationMs":250} @Wait02;',
      'say {"speaker":{"kind":"narrator"},"text":"下一句"} @' + second!.id + ';',
      'wait {"durationMs":400} @Wait03;',
    ].join('\n') + '\n';
    document.savedFiles = { ...document.files };
    const host = createCandidateHost(seed.documents);
    const after = structuredClone(before), newId = 'Split1';
    after.scenes[0]!.lines = [
      { ...first!, text: '前文', events: [] },
      { id: newId, speakerId: null, text: tail.text, events: [{ ...first!.events[0]!, offset: 1 }] },
      second!,
    ];
    const plan = prepareCandidateEdit(host.list(), seed, before, after, '拆句');
    unwrap(host.commit(plan));

    expect(sceneNodes(host, sceneId).map(node => node.id)).toEqual(['Wait01', first!.id, newId, 'Wait02', second!.id, 'Wait03']);
    expect(storedDialogue(host, sceneId, first!.id)).toEqual({ segments: [{ text: '前文', bold: true }] });
    expect(storedDialogue(host, sceneId, newId)).toEqual({ segments: [tail] });
    expect(storedEvents(host, seed, sceneId)[newId]).toEqual([{ ...first!.events[0]!, offset: 1 }]);
    expect(sceneSource(host, sceneId).text).toContain('wait {"durationMs":250} @Wait02;');
  });

  it('moves source-edited anchors in the same history group as the source', async () => {
    const session = await openCandidate();
    const { host, seed } = session;
    const { scene, line } = firstAnchoredLine(session);
    const source = sceneSource(host, scene.id);
    const prefix = '此时，';
    session.target(scene.id);
    expect(await session.commitSource(scene.id, source.text.replace(line.text, prefix + line.text))).toBe(true);

    const { documents } = host.bridge;
    const plan = unwrap(await documents.planUndo(source.documentId));
    expect(plan.reverseOrder).toHaveLength(1);
    expect(plan.members).toEqual([source.documentId, seed.extensionDocuments[scene.id]]);
    expect(storedEvents(host, seed, scene.id)[line.id]).toEqual(line.events.map(event => ({ ...event, offset: event.offset + prefix.length })));
    await session.undo();
    expect(sceneSource(host, scene.id).text).toBe(source.text);
    expect(storedEvents(host, seed, scene.id)[line.id]).toEqual(line.events);
  });

  it('clears deleted source anchors and restores them with the original statement', async () => {
    const session = await openCandidate();
    const { host, seed } = session;
    const { scene, line } = firstAnchoredLine(session);
    const source = sceneSource(host, scene.id);
    const node = sceneNodes(host, scene.id).find(node => node.id === line.id)!;
    session.target(scene.id);
    expect(await session.commitSource(scene.id, source.text.slice(0, node.start) + source.text.slice(node.end))).toBe(true);

    expect(sceneNodes(host, scene.id).some(node => node.id === line.id)).toBe(false);
    expect(storedEvents(host, seed, scene.id)).not.toHaveProperty(line.id);
    await session.undo();
    expect(storedDialogue(host, scene.id, line.id)).toBe(line.text);
    expect(storedEvents(host, seed, scene.id)[line.id]).toEqual(line.events);
  });

  it('keeps separate scene histories and valid working documents across undo and redo', async () => {
    const session = await openCandidate();
    const { host, seed } = session;
    const { scene, line } = firstAnchoredLine(session);
    const other = projectProjection(host.list(), seed).scenes[1]!, otherLine = other.lines[0]!;
    session.updateText(scene.id, line.id, '第一场。' + line.text);
    session.updateText(other.id, otherLine.id, '第二场。' + otherLine.text);

    session.target(scene.id);
    await session.undo();
    expect(storedDialogue(host, scene.id, line.id)).toBe(line.text);
    expect(storedDialogue(host, other.id, otherLine.id)).toBe('第二场。' + otherLine.text);
    await session.redo();
    session.target(other.id);
    await session.undo();
    expect(storedDialogue(host, other.id, otherLine.id)).toBe(otherLine.text);
    expect(storedDialogue(host, scene.id, line.id)).toBe('第一场。' + line.text);
    expect(DocumentViewSchema.array().safeParse(host.list()).success).toBe(true);
  });

  it('creates repeatable document and source identities without changing the review fixture', () => {
    const review = createReviewSeed('pinned'), original = structuredClone(review);
    const seed = createCandidateSeed(review);
    expect(createCandidateSeed(review)).toEqual(seed);
    expect(review).toEqual(original);
    const projection = projectProjection(seed.documents, seed);
    const ids = [...seed.documents.map(document => document.documentId), ...projection.scenes.flatMap(scene =>
      [scene.id, ...scene.lines.flatMap(line => [line.id, ...line.events.map(event => event.id)])])];
    expect(new Set(ids).size).toBe(ids.length);
    expect(IdSchema.array().safeParse(ids).success).toBe(true);
    for (const source of [seed.ui.selected, ...Object.values(seed.ui.pins)]) {
      expect(sourceLine(projection, source).line).toBeDefined();
    }
  });
});
