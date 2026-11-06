import { expect, test } from 'vitest';
import { candidateFixture } from '../../../stories/review/studio-candidate/fixtures.js';
import { CandidateSession } from './session.js';
import { readTemplateDocuments } from '@galcraft/templates';
import { parse } from '@galcraft/dsl';

test('task handoff and runtime stage follow the last actual editor selection without changing an existing handoff', async () => {
  const { seed, createServices } = candidateFixture(), session = new CandidateSession(seed, createServices);
  await session.open();
  try {
    const scene = seed.ui.sceneId, source = session.sceneSource(scene)!;
    const command = parse(source).cst.find(node => node.command === 'changeBg')!;
    session.activateView('commands:' + scene); session.selectCommand(scene, command.id!);
    expect(session.editingStatement()).toBe(command.id);
    session.activateView('writing:' + scene);
    const line = session.getSnapshot().project.scenes.find(item => item.id === scene)!.lines[1]!;
    session.revealLine(scene, line.id);
    session.rememberViewState('stage:mode', 'runtime');
    session.activateView('collaboration');
    expect(session.editingStatement()).toBe(line.id);
    expect(session.source('stage').id).toBe(line.id);
    expect(session.tasks.scope(source.documentId).statementId).toBe(line.id);
  } finally { session.dispose(); }
});

test('page inspector commands address its object and explicit source stays pinned across editing focus', async () => {
  const { seed, createServices } = candidateFixture(), session = new CandidateSession(seed, createServices);
  await session.open();
  try {
    const page = readTemplateDocuments(session.host.list()).pages.find(page => page.key === 'title')!;
    session.activateView('page:title'); session.activateView('inspector');
    expect(session.inspectorView()).toBe('page:title');
    expect(session.getSnapshot().commandTarget).toBe(page.id);
    session.pinInspectorObject('page:title');
    session.activateView('writing:' + seed.ui.sceneId); session.activateView('inspector');
    expect(session.inspectorView()).toBe('page:title');
    expect(session.getSnapshot().commandTarget).toBe(page.id);
    session.pinInspectorObject();
    expect(session.inspectorView()).toBe('writing:' + seed.ui.sceneId);
    expect(session.getSnapshot().commandTarget).toBe(seed.ui.sceneId);
    session.pin('inspector');
    session.activateView('page:title'); session.activateView('inspector');
    expect(session.inspectorView()).toBeUndefined();
    expect(session.getSnapshot().commandTarget).toBe(seed.ui.sceneId);
  } finally { session.dispose(); }
});
