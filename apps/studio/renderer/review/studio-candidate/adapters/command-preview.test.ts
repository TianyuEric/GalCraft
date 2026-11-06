import { expect, it } from 'vitest';
import { createId, type Result } from '@galcraft/contracts';
import { completions, CoreCommandSpecs, parse, parseExpression } from '@galcraft/dsl';
import { candidateFixture } from '../../../stories/review/studio-candidate/fixtures.js';
import { CandidateSession } from '../application/session.js';
import { candidateAssets } from '../application/services.js';
import { applyCommandOperation, candidateCommandFields, commandArgs, commandRegistry, commandSource, previewPosition, previewVersion } from './command-preview.js';

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

it('keeps Live2D model controls and excludes legacy image animation fields from the candidate editor', () => {
  const figure = CoreCommandSpecs.find(spec => spec.key === 'changeFigure')!;
  const model = (fields: typeof figure.fields) => fields.find(field => field.path === 'model');
  const removed = ['imageMouth', 'imageBlink', 'imageFaceCombinations'];
  expect(model(candidateCommandFields(figure.key, figure.fields, 'image'))).toBeUndefined();
  for (const kind of ['live2d', undefined] as const) {
    const controls = model(candidateCommandFields(figure.key, figure.fields, kind))?.children?.map(field => field.path);
    expect(controls).toContain('motion');
    expect(controls).toContain('blink');
    expect(controls?.filter(field => removed.includes(field))).toEqual([]);
  }
  expect(model(figure.fields)?.children?.map(field => field.path)).toEqual(expect.arrayContaining(removed));

  const beforeCaret = 'changeFigure {model:{';
  const source = parse({ documentId: createId(), revision: 1, text: `${beforeCaret}}} @${createId()};` });
  const suggestions = completions(source, beforeCaret.length, commandRegistry('0.1.0', []), [], [], () => createId()).map(item => item.label);
  expect(suggestions).toContain('motion');
  expect(suggestions.filter(field => removed.includes(field))).toEqual([]);
});

it('uses scene identity for non-dialogue transactions and compiles the effective command for preview', async () => {
  const { seed, createServices } = candidateFixture();
  const session = new CandidateSession(seed, createServices);
  try {
    await session.open();
    const [first, second] = value(await session.services.read()).scenes;
    expect(first && second).toBeTruthy();
    const sceneId = first!.sceneId, otherId = second!.sceneId;
    session.activateDocument(otherId);
    const scene = () => session.sceneSource(sceneId)!;
    const other = () => session.sceneSource(otherId)!;
    const openingLine = commandSource(scene()).cst[0]!.id!;
    const asset = candidateAssets(session.host.list()).find(item => item.kind === 'image')!;
    value(await applyCommandOperation(session, scene(), { op: 'commands.insert', sceneId, beforeId: openingLine,
      commands: [{ command: 'changeBg', args: { assetId: asset.id, op: 'show' } }] }, []));
    const original = scene();
    const changed = commandSource(original).cst[0]!;
    expect(changed.command).toBe('changeBg');
    expect(other().text).toBe(second!.text);
    const target = previewPosition(original, changed.id);
    expect(target).toEqual({ sceneId, statementId: changed.id });
    const compiled = value(await session.services.compilePreview!());
    expect(compiled.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(compiled.snapshot?.scenes.find(item => item.scene.id === sceneId)?.instructions[0])
      .toMatchObject({ opcode: 'changeBg', statementId: changed.id, args: { assetId: asset.id } });

    const previousVersion = previewVersion(session.host.list(), target);
    value(await applyCommandOperation(session, scene(), { op: 'commands.fields', sceneId, ids: [changed.id!],
      changes: [{ field: 'positionX', op: 'set', value: 0.25 }] }, []));
    expect(previewVersion(session.host.list(), target)).not.toBe(previousVersion);
    expect(await applyCommandOperation(session, original, { op: 'commands.remove', sceneId, ids: [changed.id!] }, []))
      .toMatchObject({ ok: false, error: { code: 'CANDIDATE_COMMAND_STALE' } });

    value(await applyCommandOperation(session, scene(), { op: 'commands.duplicate', sceneId, ids: [changed.id!], beforeId: openingLine }, []));
    const copied = commandSource(scene()).cst[1]!;
    expect(copied.id).not.toBe(changed.id);
    expect(commandArgs(copied.object?.value)).toMatchObject({ assetId: asset.id, positionX: 0.25 });
    expect(commandArgs(copied.object?.value).objectId).not.toBe(commandArgs(changed.object?.value).objectId);
    value(await applyCommandOperation(session, scene(), { op: 'commands.move', sceneId, ids: [copied.id!], targetSceneId: sceneId, beforeId: changed.id }, []));
    expect(commandSource(scene()).cst[0]?.id).toBe(copied.id);

    const draft = other().text + '\nnot valid';
    session.sourceDraft(otherId, draft);
    const move = { op: 'commands.move' as const, sceneId, ids: [copied.id!], targetSceneId: otherId, beforeId: null };
    expect(await applyCommandOperation(session, scene(), move, [], other())).toMatchObject({ ok: false, error: { code: 'CANDIDATE_COMMAND_DRAFT' } });
    expect(previewPosition(other(), commandSource(other()).cst[0]?.id ?? null, session.getSnapshot().ui.sourceErrors[otherId])).toBeNull();
    session.sourceDraft(otherId, null);

    value(await applyCommandOperation(session, scene(), move, [], other()));
    expect(commandSource(other()).cst.at(-1)?.id).toBe(copied.id);
    expect(commandSource(scene()).cst.some(node => node.id === copied.id)).toBe(false);
    await session.undo(otherId);
    expect(commandSource(scene()).cst[0]?.id).toBe(copied.id);
    expect(other().text).toBe(second!.text);

    value(await applyCommandOperation(session, scene(), { op: 'commands.remove', sceneId, ids: [copied.id!] }, []));
    expect(commandSource(scene()).cst[0]?.id).toBe(changed.id);
  } finally {
    session.dispose();
  }
});

it('duplicates sentence events by formal statement mapping and undoes the copy together', async () => {
  const { seed, createServices } = candidateFixture();
  const session = new CandidateSession(seed, createServices);
  try {
    await session.open();
    const sceneId = seed.ui.sceneId;
    const lines = () => session.getSnapshot().project.scenes.find(scene => scene.id === sceneId)!.lines;
    const [first, second] = lines();
    session.insertEvent(sceneId, first!.id, 'pause', 1);
    session.insertEvent(sceneId, second!.id, 'expression', 2);
    const source = session.sceneSource(sceneId)!;
    const expected = lines().slice(0, 2).map(line => line.events);
    const copied = value(await applyCommandOperation(session, source, { op: 'commands.duplicate', sceneId,
      ids: [second!.id, first!.id], beforeId: null }, []));
    const duplicates = copied.added.map(id => lines().find(line => line.id === id)!);
    for (const [index, line] of duplicates.entries()) {
      expect(line.events.map(({ id: _, ...event }) => event)).toEqual(expected[index]!.map(({ id: _, ...event }) => event));
      expect(line.events.every(event => !expected[index]!.some(original => original.id === event.id))).toBe(true);
    }
    await session.undo(sceneId);
    expect(lines().some(line => copied.added.includes(line.id))).toBe(false);
    expect(lines().slice(0, 2).map(line => line.events)).toEqual(expected);
  } finally {
    session.dispose();
  }
});

it('compiles sound, variables and scene flow created through the same command transaction', async () => {
  const { seed, createServices } = candidateFixture();
  const session = new CandidateSession(seed, createServices);
  try {
    await session.open();
    const sceneId = seed.ui.sceneId;
    const other = value(await session.services.read()).scenes.find(scene => scene.sceneId !== sceneId)!;
    const audio = value(await session.services.importAssets!(['/practice/music/spring-01.opus'])).succeeded[0]!;
    value(await session.authorOperation({ op: 'variable.create', name: '计数', type: 'number', scope: 'progress', initial: 0 }));
    const variable = value(await session.services.read()).variables!.find(item => item.name === '计数')!;
    const expression = parseExpression('1');
    if (!expression.ok) throw new Error(expression.message);
    const receipt = value(await applyCommandOperation(session, session.sceneSource(sceneId)!, { op: 'commands.insert', sceneId, beforeId: null,
      commands: [
        { command: 'playEffect', args: { assetId: audio.id, op: 'play' } },
        { command: 'setVar', args: { variableId: variable.id, op: 'assign', value: expression.expr } },
        { command: 'changeScene', args: { sceneId: other.sceneId } },
      ],
    }, []));
    const compiled = value(await session.services.compilePreview!());
    expect(compiled.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(compiled.snapshot?.scenes.find(item => item.scene.id === sceneId)?.instructions.filter(item => receipt.added.includes(item.statementId)))
      .toMatchObject([
        { opcode: 'playEffect', args: { assetId: audio.id } },
        { opcode: 'setVar', args: { variableId: variable.id } },
        { opcode: 'changeScene', args: { sceneId: other.sceneId } },
      ]);
  } finally {
    session.dispose();
  }
});
