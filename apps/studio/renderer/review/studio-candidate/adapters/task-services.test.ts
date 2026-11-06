import { afterEach, expect, it, vi } from 'vitest';
import { GenerationInputSchema, NativeAnimationSchema, type AnimationGenerationRequest } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import type { CollaborationScope } from '@galcraft/collaboration/contracts';
import { unwrap } from '../../../pages/Production/bridge.js';
import { candidateFixture } from '../../../stories/review/studio-candidate/fixtures.js';
import { CandidateSession } from '../application/session.js';
import { candidateAssets } from '../application/services.js';

const sessions: CandidateSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); vi.useRealTimers(); });
async function open() {
  const { seed, createServices } = candidateFixture();
  const session = new CandidateSession(seed, createServices);
  sessions.push(session);
  await session.open();
  return session;
}

it('resolves project-sized media against the current canvas and freezes that version until submit', async () => {
  const session = await open(), { production } = session.tasks, { ui } = session.getSnapshot();
  await session.tasks.openDraft('background', session.documentId(ui.sceneId), ui.lineId);
  production.field('positive', '春夜的花店'); production.field('sizeMode', 'project');
  const materials = structuredClone(production.variant!.context);
  const resize = async (width: number) => {
    const document = session.host.list().find(item => 'project.json' in item.files)!;
    const before = JSON.parse(document.files['project.json']!).data.canvas.width;
    unwrap(await session.applyEdit({ label: '调整画布宽度', origin: 'field', expected: [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }],
      patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/canvas/width', op: 'set', before, after: width }] }], preparedAssets: [], requiredRefs: [] }));
  };
  await resize(1600); await production.saveDraft(true);
  const bridge = production.bridge.production;
  const plan = unwrap(await bridge.plan({ draftId: production.draft!.id, name: '当前画布' }));
  expect(plan.task.items[0]!.input).toMatchObject({ width: 1600, height: 1080 });
  expect(unwrap(await bridge.overview()).tasks).toHaveLength(0);
  await resize(1440);
  expect(await bridge.submit(plan.planId)).toMatchObject({ ok: false, error: { code: 'PRODUCTION_SOURCE_STALE' } });
  const current = unwrap(await bridge.plan({ draftId: production.draft!.id, name: '更新画布' }));
  expect(current.task.items[0]!.input).toMatchObject({ width: 1440, height: 1080 });
  expect(production.variant!.context).toEqual(materials);
  production.field('sizeMode', 'custom'); production.field('width', 768); await production.saveDraft(true);
  const custom = unwrap(await bridge.plan({ draftId: production.draft!.id, name: '本次尺寸' }));
  expect(custom.task.items[0]!.input).toMatchObject({ width: 768 });
});

it('adopts a background in one asset and source edit group, then undoes both', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const session = await open(), { production } = session.tasks, { ui } = session.getSnapshot();
  const before = session.sceneSource(ui.sceneId)!;
  const count = candidateAssets(session.host.list()).length;
  await session.tasks.openDraft('background', before.documentId, ui.lineId);
  production.field('positive', '春夜的花店');
  await production.saveDraft(true);
  const bridge = production.bridge.production;
  const draft = production.draft!;
  const plan = unwrap(await bridge.plan({ draftId: draft.id, name: '背景审阅' }));
  const task = unwrap(await bridge.submit(plan.planId));
  vi.setSystemTime(Date.now() + 5000);
  const overview = unwrap(await bridge.overview({ taskId: task.id }));
  expect(overview.tasks[0]!.items[0]!.state).toBe('review');
  expect(overview.candidates).toHaveLength(2);
  const { candidate } = overview.candidates[0]!;
  const adoption = unwrap(await bridge.select({ taskId: task.id, selections: [{ itemId: candidate.itemId, candidateId: candidate.id }],
    target: 'project', expected: overview.versions, adoptions: { [candidate.id]: { mode: 'bind', name: '春夜花店.png' } } }));
  expect(adoption).toHaveProperty('planId');
  if (!('planId' in adoption)) throw new Error('Missing adoption plan');
  const receipt = unwrap(await bridge.apply({ planId: adoption.planId, expected: adoption.input.expected }));
  expect(receipt.assetIds).toHaveLength(1);
  expect(session.sceneSource(ui.sceneId)!.text).toContain('changeBg');
  expect(session.sceneSource(ui.sceneId)!.text).toContain(receipt.assetIds[0]);
  expect(candidateAssets(session.host.list()).some(asset => asset.id === receipt.assetIds[0])).toBe(true);
  expect(unwrap(await bridge.apply({ planId: adoption.planId, expected: adoption.input.expected })).operationId).toBe(receipt.operationId);
  const status = async () => unwrap(await bridge.overview()).candidates.find(value => value.candidate.id === candidate.id)?.adoption;
  expect(await status()).toBe('adopted');
  const unrelated = session.getSnapshot().project.scenes.find(value => value.id === ui.sceneId)!.lines.find(value => value.id !== ui.lineId)!;
  unwrap(await session.authorOperation({ op: 'commands.fields', sceneId: ui.sceneId, ids: [unrelated.id], changes: [{ field: 'text', op: 'set', value: '另一次编辑。' }] }));
  expect(await status()).toBe('adopted');
  await session.save();
  expect(await status()).toBe('saved');
  await session.undo(ui.sceneId);
  expect(await status()).toBe('saved');
  await session.undo(ui.sceneId);
  expect(await status()).toBe('unadopted');
  expect(session.sceneSource(ui.sceneId)!.text).toBe(before.text);
  expect(candidateAssets(session.host.list())).toHaveLength(count);
});

it('keeps the original failure, runs a new retry, and cancels a separately queued task', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const session = await open(), { production } = session.tasks, { ui } = session.getSnapshot();
  await session.tasks.openDraft('script', session.documentId(ui.sceneId), ui.lineId);
  production.field('instruction', '把最后一句交给夜色。');
  await production.saveDraft(true);
  const bridge = production.bridge.production;
  const plan = unwrap(await bridge.plan({ draftId: production.draft!.id, name: '剧情审阅' }));
  session.tasks.failNextTask();
  const original = unwrap(await bridge.submit(plan.planId));
  vi.setSystemTime(Date.now() + 5000);
  const failure = unwrap(await bridge.overview()).tasks[0]!;
  expect(failure.items[0]!.state).toBe('failed');
  const retry = unwrap(await bridge.retry({ taskId: original.id, itemId: failure.items[0]!.id, confirmNewRequest: true }));
  expect(retry.sendSummary).toEqual(plan.sendSummary.map(summary => ({ ...summary, itemId: retry.task.items[0]!.id })));
  expect(retry.task.items[0]!.input).toEqual(plan.task.items[0]!.input);
  expect(unwrap(await bridge.overview()).tasks).toHaveLength(1);
  const retried = unwrap(await bridge.submit(retry.planId));
  expect(retried.previousTaskId).toBe(original.id);
  expect(retried.items[0]!.attempts[0]!.id).not.toBe(failure.items[0]!.attempts[0]!.id);
  vi.setSystemTime(Date.now() + 5000);
  expect(unwrap(await bridge.overview()).tasks.map(task => task.items[0]!.state)).toEqual(['failed', 'review']);
  const third = unwrap(await bridge.submit(unwrap(await bridge.retry({ taskId: original.id, itemId: failure.items[0]!.id, confirmNewRequest: true })).planId));
  expect(unwrap(await bridge.cancel(third.id)).local).toBe('stopped');
  expect(unwrap(await bridge.resume(third.id)).items[0]).toMatchObject({ state: 'cancelled', attempts: [{ outcome: 'cancelled' }] });
  expect(unwrap(await bridge.resume(third.id)).items[0]!.attempts[0]!.sentAt).toBeUndefined();
});

it('sends a prepared media step only after the author reviews the chosen result', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const session = await open(), { production } = session.tasks, bridge = production.bridge.production;
  const { ui } = session.getSnapshot();
  await session.tasks.openDraft('background', session.documentId(ui.sceneId), ui.lineId);
  const recipe = production.data.recipes.find(recipe => recipe.purposes.includes('imagePrompt') && recipe.uses.includes('background') && !recipe.production)!;
  const text = production.data.connections.find(connection => connection.purposes.includes('text'))!;
  production.update({ promptPreparation: { recipeId: recipe.id, purpose: 'imagePrompt', usage: 'background', scope: recipe.scope, parameterValues: {} } });
  production.field('promptConnectionId', text.id);
  production.field('instruction', '春夜街道的暖色灯笼。');
  await production.saveDraft(true);
  const plan = unwrap(await bridge.plan({ draftId: production.draft!.id, name: '先准备提示词' }));
  expect(plan.task.items.map(item => item.operation)).toEqual(['imagePrompt', 'image']);
  const task = unwrap(await bridge.submit(plan.planId));
  const mediaItem = task.items[1]!;
  expect(mediaItem).toMatchObject({ state: 'blocked', attempts: [] });
  vi.setSystemTime(Date.now() + 5000);
  const result = unwrap(await bridge.overview());
  const [first, second] = result.candidates.map(entry => entry.candidate);
  expect(await bridge.reviewStage({ taskId: task.id, itemId: mediaItem.id })).toMatchObject({ ok: false, error: { code: 'STAGE_BLOCKED' } });
  const select = async (candidate: NonNullable<typeof first>) => unwrap(await bridge.select({ taskId: task.id,
    selections: [{ itemId: candidate.itemId, candidateId: candidate.id }], target: 'taskOnly', expected: result.versions }));
  await select(first!);
  const old = unwrap(await bridge.reviewStage({ taskId: task.id, itemId: mediaItem.id }));
  await select(second!);
  expect(await bridge.confirmStage(old)).toMatchObject({ ok: false, error: { code: 'STAGE_REVIEW_STALE' } });
  const reviewed = unwrap(await bridge.reviewStage({ taskId: task.id, itemId: mediaItem.id }));
  expect(reviewed.summary).toMatchObject({ requests: 1, destination: expect.stringContaining('审核图像') });
  expect(reviewed.input).not.toEqual(old.input);
  expect(unwrap(await bridge.overview()).tasks[0]?.items[1]).toMatchObject({ state: 'blocked', attempts: [] });
  const sent = unwrap(await bridge.confirmStage(reviewed));
  expect(sent.items[1]).toMatchObject({ state: 'queued', input: reviewed.input, attempts: [{ outcome: 'pending' }] });
});

it('keeps page structure manual and adopts UI SVG into the common asset index', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const session = await open(), { production } = session.tasks, bridge = production.bridge.production;
  const page = unwrap(await bridge.overview()).pages[0]!;
  const pageBefore = session.host.list().find(value => value.documentId === page.documentId)!;
  await expect(session.tasks.openDraft('page', page.documentId)).rejects.toThrow('手工编辑');
  await session.tasks.openDraft('ui-assets', page.documentId);
  production.setOperation('svg');
  production.field('instruction', '绘制一枚灯笼图标。');
  await production.saveDraft(true);
  const plan = unwrap(await bridge.plan({ draftId: production.draft!.id, name: '灯笼图标' }));
  expect(plan.task.items[0]).toMatchObject({ operation: 'svg', target: { usage: 'ui', sceneId: null } });
  const task = unwrap(await bridge.submit(plan.planId));
  vi.setSystemTime(Date.now() + 5000);
  const overview = unwrap(await bridge.overview()), candidate = overview.candidates[0]!.candidate;
  expect(unwrap(await bridge.candidateContent(candidate.id)).media[0]!.mime).toBe('image/svg+xml');
  const adoption = unwrap(await bridge.select({ taskId: task.id, selections: [{ itemId: candidate.itemId, candidateId: candidate.id }],
    target: 'project', expected: overview.versions, adoptions: { [candidate.id]: { mode: 'library', name: '灯笼.svg' } } }));
  if (!('planId' in adoption)) throw new Error('Missing adoption plan');
  const receipt = unwrap(await bridge.apply({ planId: adoption.planId, expected: adoption.input.expected }));
  expect(candidateAssets(session.host.list()).find(asset => asset.id === receipt.assetIds[0])?.name).toBe('灯笼.svg');
  expect(session.host.list().find(value => value.documentId === page.documentId)).toEqual(pageBefore);
});

it('freezes entry A, captured material B and continuous target C independently', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const session = await open(), { production } = session.tasks, bridge = production.bridge.production;
  const entry = unwrap(await bridge.overview()).scenes.find(scene => scene.statements.some(statement => statement.command === 'say'))!;
  const materialName = '制作发送材料 B';
  const targetName = '制作采用位置 C';
  unwrap(await session.authorOperation({ op: 'scene.duplicate', id: entry.id, name: materialName }));
  unwrap(await session.authorOperation({ op: 'scene.duplicate', id: entry.id, name: targetName }));
  const scenes = unwrap(await bridge.overview()).scenes;
  const material = scenes.find(scene => scene.name === materialName)!;
  const target = scenes.find(scene => scene.name === targetName)!;
  const entryLine = entry.statements.find(statement => statement.command === 'say')!;
  const materialLine = material.statements.find(statement => statement.command === 'say')!;
  const replacement = '这段新材料不属于已捕获快照。';
  await session.tasks.openDraft('script', entry.documentId, entryLine.id);
  await production.captureMaterials({ sceneId: material.id, statementId: materialLine.id });
  const captured = structuredClone(production.variant!.context);
  unwrap(await session.authorOperation({ op: 'commands.fields', sceneId: material.id, ids: [materialLine.id],
    changes: [{ field: 'text', op: 'set', value: replacement }] }));
  await production.refresh();
  await production.setQuickScene(target.id);
  const range = target.statements.slice(0, 2).map(statement => statement.id);
  expect(range).toHaveLength(2);
  production.update({ target: { ...production.variant!.target, statementId: range[0]!, replaceStatementIds: range } });
  production.field('instruction', '用两句旁白写灯光落下。');
  await production.saveDraft(true);
  const sourceDraftId = production.draft!.id;
  const plan = unwrap(await bridge.plan({ draftId: sourceDraftId, name: '冻结制作' }));
  expect(unwrap(await bridge.overview()).tasks).toEqual([]);
  expect(plan.task.context).toEqual(captured);
  expect(plan.task.context[0]!.source).toMatchObject({ ref: { id: material.documentId }, revision: material.revision });
  const item = plan.task.items[0]!;
  expect(item.target).toMatchObject({ sceneId: target.id, statementId: range[0], replaceStatementIds: range });
  expect(item.sourceVersions).toEqual([{ ref: { kind: 'document', id: target.documentId }, revision: target.revision }]);
  const input = GenerationInputSchema.parse(item.input);
  if (input.purpose !== 'text') throw new Error('Expected a text request');
  const sent = input.messages.map(message => message.text).join('\n');
  expect(sent).toContain(materialLine.label);
  expect(sent).not.toContain(replacement);
  expect(item.input).not.toHaveProperty('reviewSpeaker');
  const task = unwrap(await bridge.submit(plan.planId));
  production.taskId = task.id;
  await production.refresh();
  expect(production.originFor()).toMatchObject({ documentId: entry.documentId, statementId: entryLine.id, version: { revision: entry.revision } });
  vi.setSystemTime(Date.now() + 5000);
  const result = unwrap(await bridge.overview());
  const { candidate } = result.candidates[0]!;
  expect(result.tasks[0]?.items[0]?.input).toEqual(input);
  const targetPath = `scenes/${target.id}/script.gal`;
  const currentTargetText=()=>session.host.list().find(document=>document.documentId===target.documentId)!.files[targetPath]!;
  const originalTarget=currentTargetText();
  const preview=unwrap(await bridge.previewScript(candidate.id));
  expect(preview.project.entry.sceneId).toBe(target.id);
  expect(currentTargetText()).toBe(originalTarget);
  const selection={taskId:task.id,selections:[{itemId:item.id,candidateId:candidate.id}],target:'project' as const,expected:result.versions};
  const cancelled=unwrap(await bridge.select(selection));
  if(!('planId' in cancelled))throw new Error('Expected adoption review');
  unwrap(await bridge.discardAdoption(cancelled.planId));
  expect(currentTargetText()).toBe(originalTarget);
  const adoption=unwrap(await bridge.select(selection));
  if(!('input' in adoption))throw new Error('Expected adoption plan');
  const replacementPatch=adoption.input.patches.find(patch=>patch.kind==='text');
  expect(replacementPatch?.kind==='text'&&parse({documentId:target.documentId!,revision:target.revision!,text:replacementPatch.edits[0]!.after}).cst.map(node=>node.command)).toEqual(['say','wait','say']);
  unwrap(await bridge.apply({planId:adoption.planId,expected:adoption.input.expected}));
  const adoptedTarget=currentTargetText();
  expect(adoptedTarget).not.toBe(originalTarget);
  expect(session.sceneSource(material.id)!.text).toContain(replacement);
  await session.undo(target.id);
  if(session.getSnapshot().historyReview)await session.confirmHistory(true);
  expect(currentTargetText()).toBe(originalTarget);
  await session.redo(target.id);
  if(session.getSnapshot().historyReview)await session.confirmHistory(true);
  expect(currentTargetText()).toBe(adoptedTarget);
  expect(await bridge.select(selection)).toMatchObject({ok:false,error:{code:'ADOPTION_CONFLICT'}});
  expect(await bridge.previewScript(candidate.id)).toMatchObject({ok:false,error:{code:'ADOPTION_CONFLICT'}});

  await session.tasks.openDraft('script', entry.documentId, entryLine.id);
  production.update({ context: [] });
  await production.setQuickScene(target.id);
  production.field('instruction', '独立写一段开场。');
  await production.saveDraft(true);
  const empty = unwrap(await bridge.plan({ draftId: production.draft!.id, name: '无材料制作' }));
  expect(empty.task.context).toEqual([]);
  expect(JSON.stringify(empty.task.items[0]!.input)).not.toContain(target.statements.find(statement => statement.command === 'say')!.label);
  expect(unwrap(await bridge.overview()).tasks).toHaveLength(1);
  const confirmed = unwrap(await bridge.submit(empty.planId));
  expect(confirmed.context).toEqual([]);
  expect(confirmed.items[0]!.input).toEqual(empty.task.items[0]!.input);
});

it('reviews a scoped native animation and adopts versions or bindings through the shared transaction', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const session = await open(), { production } = session.tasks, bridge = production.bridge.production;
  const { ui } = session.getSnapshot();
  const animation = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 500, tracks: [
    { path: '/x', mode: 'add', keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 100, value: 1 }, { timeMs: 500, value: 0 }] },
    { path: '/y', mode: 'add', keyframes: [{ timeMs: 300, value: 2 }] },
  ] });
  const original = unwrap(await session.services.saveAnimation!({ animation, name: '春灯浮动.gca' }));
  const existing = candidateAssets(session.host.list()).find(asset => asset.id === original.assetId)!;
  const index = session.host.list().find(document => 'assets/index.json' in document.files)!;
  const patch: AnimationGenerationRequest = { instruction: '在中段轻轻移动。', mode: 'patch', currentAnimation: animation, paths: ['/x'],
    range: { startMs: 100, endMs: 200 }, targetContext: '春灯', preserveDuration: true, allowDelete: false,
    assetId: existing.id, assetRevision: existing.revision };
  const run = async (request: AnimationGenerationRequest, origin: Parameters<typeof session.tasks.openAnimationProduction>[1]) => {
    await session.tasks.openAnimationProduction(request, origin);
    const plan = unwrap(await bridge.plan({ draftId: production.draft!.id, name: '春灯动画候选' }));
    expect(plan.task.items[0]).toMatchObject({
      operationSnapshot: { provider: { id: 'org.galcraft.animation-generation', version: '0.1.0' } },
      input: { fields: request },
    });
    const task = unwrap(await bridge.submit(plan.planId));
    vi.setSystemTime(Date.now() + 5000);
    const overview = unwrap(await bridge.overview());
    const candidate = overview.candidates.find(entry => entry.candidate.taskId === task.id)!.candidate;
    expect(candidate.artifacts[0]).toMatchObject({ kind: 'animation', port: 'animation', typeVersion: 1 });
    return { task, candidate, versions: overview.versions };
  };
  const adopt = async (result: Awaited<ReturnType<typeof run>>, mode: 'library' | 'bind') => {
    const { task, candidate, versions } = result;
    const plan = unwrap(await bridge.select({ taskId: task.id, selections: [{ itemId: candidate.itemId, candidateId: candidate.id }],
      target: 'project', expected: versions, adoptions: { [candidate.id]: { mode } } }));
    if (!('planId' in plan)) throw new Error('Missing adoption plan');
    return unwrap(await bridge.apply({ planId: plan.planId, expected: plan.input.expected }));
  };
  const revised = await run(patch, { documentId: index.documentId, assetId: existing.id, viewId: 'assets:' + existing.id });
  const media = unwrap(await bridge.candidateContent(revised.candidate.id));
  const version = NativeAnimationSchema.parse(JSON.parse(media.text));
  expect(version.durationMs).toBe(animation.durationMs);
  expect(version.tracks[1]).toEqual(animation.tracks[1]);
  expect(version.tracks[0]!.keyframes.at(-1)).toEqual(animation.tracks[0]!.keyframes.at(-1));
  expect(version.tracks[0]!.keyframes).not.toEqual(animation.tracks[0]!.keyframes);
  const receipt = await adopt(revised, 'library');
  expect(receipt.assetIds).toEqual([existing.id]);
  const next = candidateAssets(session.host.list()).find(asset => asset.id === existing.id)!;
  expect(next.revision).toBe(existing.revision + 1);
  expect(next.variants.find(variant => variant.id === next.activeVariantId)?.parentId).toBe(existing.activeVariantId);

  unwrap(await session.authorOperation({ op: 'commands.insert', sceneId: ui.sceneId, beforeId: ui.lineId,
    commands: [{ command: 'setComplexAnimation', args: { target: { kind: 'stage' }, animation } }] }));
  const before = session.sceneSource(ui.sceneId)!;
  const statement = parse(before).cst.find(node => node.command === 'setComplexAnimation')!;
  const count = candidateAssets(session.host.list()).length;
  const bound = await run({ ...patch, assetId: null, assetRevision: null }, { documentId: before.documentId, statementId: statement.id!,
    viewId: `professional:${ui.sceneId}:${statement.id}` });
  const binding = await adopt(bound, 'bind');
  const actual = parse(session.sceneSource(ui.sceneId)!).cst.find(node => node.id === statement.id)!.object!.value;
  expect(actual).toMatchObject({ resourceId: binding.assetIds[0], target: { kind: 'stage' } });
  expect(actual).not.toHaveProperty('animation');
  expect(candidateAssets(session.host.list())).toHaveLength(count + 1);
  await session.undo(ui.sceneId);
  expect(session.sceneSource(ui.sceneId)!.text).toBe(before.text);
  expect(candidateAssets(session.host.list())).toHaveLength(count);
});

it('checks current collaboration scope and pause, records outcomes, and locates the exact receipt', async () => {
  const session = await open(), second = await open(), { ui } = session.getSnapshot();
  const source = session.sceneSource(ui.sceneId)!;
  const bridge = session.tasks.collaboration;
  await bridge.start();
  const scope: CollaborationScope = { mode: 'restricted', documents: [source.documentId], tools: ['galcraft_authoring'],
    createKinds: [], operations: [], connectionIds: [], models: [], workflowIds: [], maxGenerations: 0 };
  const round = unwrap(await bridge.create({ goal: '校对对白', harness: 'codex', scope }));
  expect(round.writeSessionId).toBe(session.writeSessionId);
  const invoke = session.tasks.invokeCollaborationEdit;
  const paused = unwrap(await bridge.update({ id: round.id, expectedRevision: round.scopeRevision, paused: true }));
  expect(await invoke({ documentId: source.documentId, statementId: ui.lineId, revision: source.revision, text: '暂停时不会写入。' })).toMatchObject({ ok: false, error: { code: 'SESSION_PAUSED' } });
  unwrap(await bridge.update({ id: round.id, expectedRevision: paused.scopeRevision, paused: false }));
  expect(await invoke({ documentId: 'OtherDocument', statementId: ui.lineId, revision: source.revision, text: '范围外不会写入。' })).toMatchObject({ ok: false, error: { code: 'DOCUMENT_SCOPE' } });
  unwrap(await invoke({ documentId: source.documentId, statementId: ui.lineId, revision: source.revision, text: '春夜的风停了一会儿。' }));
  expect(session.sceneSource(ui.sceneId)!.text).toContain('春夜的风停了一会儿。');
  expect(second.sceneSource(ui.sceneId)!.text).toBe(source.text);
  const page = unwrap(await bridge.overview({ history: { sessionId: round.id, offset: 0, limit: 25 } })).callPage!;
  expect(page.items.map(item => item.state)).toEqual(['completed', 'failed', 'failed']);
  const call = unwrap(await bridge.readCall({ sessionId: round.id, callId: page.items[0]!.callId }));
  expect(call.result).toMatchObject({ documents: expect.arrayContaining([expect.objectContaining({ ref: { kind: 'document', id: source.documentId } })]) });
  const navigate = vi.fn();
  session.tasks.attachNavigator(navigate);
  await bridge.open({ sessionId: round.id, page: 'creation', documentId: source.documentId });
  expect(navigate).toHaveBeenCalledWith({ page: 'creation', documentId: source.documentId, statementId: ui.lineId });
  await session.undo(ui.sceneId);
  expect(session.sceneSource(ui.sceneId)!.text).toBe(source.text);
});

it('stores a project-scoped recipe with the project documents', async () => {
  const session = await open(), production = session.tasks.production;
  const bridge = production.bridge.production, overview = unwrap(await bridge.overview());
  const source = overview.recipes.find(value => value.scope === 'official')!;
  const saved = unwrap(await bridge.copyRecipe({ recipeId: source.id, sourceScope: 'official', scope: 'project', projectId: production.projectId }));
  const path = 'authoring/recipes/' + saved.id + '.json';
  expect(session.host.list().find(value => value.documentId === saved.id)?.files[path]).toBeDefined();
  expect(unwrap(await bridge.overview()).recipes.find(value => value.id === saved.id)).toMatchObject({ scope: 'project', revision: 1 });
  unwrap(await bridge.deleteRecipe({ recipeId: saved.id, scope: 'project', expectedRevision: saved.revision }));
  expect(session.host.list().some(value => path in value.files)).toBe(false);
});
