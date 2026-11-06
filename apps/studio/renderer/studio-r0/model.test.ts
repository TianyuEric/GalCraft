import { describe, expect, it } from 'vitest';
import { ReviewStore, type Candidate, type ReviewServices } from './model.js';
import { createReviewSeed } from '../stories/review/studio-r0/galcraft/fixtures.js';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {
    promise,
    resolve,
    reject
  };
}
const services: ReviewServices = {
  save: async () => {},
  produce: async () => []
};
describe('shared Studio review session', () => {
  it('returns to each document position and reconciles a removed split line on undo', () => {
    const store = new ReviewStore(createReviewSeed(), services);
    store.selectLine('street', 'l24', 8);
    store.activateDocument('shop');
    store.selectLine('shop', 's02', 4);
    store.activateDocument('street');
    expect(store.getSnapshot().ui.selection).toEqual({
      lineId: 'l24',
      start: 8,
      end: 8
    });
    store.edit('拆句', project => {
      project.scenes[0]!.lines.splice(24, 0, {
        id: 'split-line',
        text: '新句',
        speakerId: 'qibai',
        events: []
      });
    });
    store.selectLine('street', 'split-line');
    store.undo();
    expect(store.getSnapshot().project.scenes[0]!.lines.some(line => line.id === store.getSnapshot().ui.lineId)).toBe(true);
    store.activateDocument('shop');
    expect(store.getSnapshot().ui.selection).toEqual({
      lineId: 's02',
      start: 4,
      end: 4
    });
    store.dispose();
  });
  it('rebases inline anchors, then restores text and anchors in the same undo', () => {
    const store = new ReviewStore(createReviewSeed(), services);
    const original = store.getSnapshot().project.scenes[0]!.lines[23]!;
    store.updateText('street', 'l24', `今晚，${original.text}`);
    expect(store.getSnapshot().project.scenes[0]!.lines[23]!.events.map(e => e.offset)).toEqual(original.events.map(e => e.offset + 3));
    store.undo();
    expect(store.getSnapshot().project.scenes[0]!.lines[23]).toEqual(original);
    expect(store.getSnapshot().dirty).toBe(false);
    store.dispose();
  });
  it('keeps selection, preview and panel pins outside content history', () => {
    const store = new ReviewStore(createReviewSeed(), services);
    store.pin('stage');
    store.selectLine('street', 'l26');
    store.previewCandidate('candidate-a');
    expect(store.source('stage').id).toBe('l24');
    expect(store.source('inspector').id).toBe('l26');
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.getSnapshot().dirty).toBe(false);
    store.dispose();
  });
  it('keeps changes made while a save is in flight dirty', async () => {
    const saved = deferred<void>(),
      store = new ReviewStore(createReviewSeed(), {
        ...services,
        save: () => saved.promise
      });
    store.updateText('street', 'l24', '第一次修改');
    store.endEditGroup();
    const saving = store.save();
    store.updateText('street', 'l24', '保存期间的下一次修改');
    saved.resolve();
    await saving;
    expect(store.getSnapshot().dirty).toBe(true);
    store.undo();
    expect(store.getSnapshot().dirty).toBe(false);
    store.dispose();
  });
  it('does not let a cancelled request clear or overwrite its immediate retry', async () => {
    const first = deferred<Candidate[]>(),
      second = deferred<Candidate[]>();
    let count = 0;
    const store = new ReviewStore(createReviewSeed(), {
      ...services,
      produce: () => ++count === 1 ? first.promise : second.promise
    });
    const a = store.produce();
    store.cancelProduction();
    const b = store.produce();
    first.resolve([{
      id: 'stale',
      name: 'old',
      url: 'old.png',
      expression: 'smile',
      description: ''
    }]);
    await a;
    await store.produce();
    expect(count).toBe(2);
    expect(store.getSnapshot().ui.production.status).toBe('running');
    second.resolve([{
      id: 'new',
      name: 'new',
      url: 'new.png',
      expression: 'surprised',
      description: ''
    }]);
    await b;
    expect(store.getSnapshot().ui.production.candidates[0]?.id).toBe('new');
    store.dispose();
  });
  it('adopts a tried candidate in one reversible content operation and isolates instances', () => {
    const seed = createReviewSeed(),
      store = new ReviewStore(seed, services),
      other = new ReviewStore(seed, services);
    store.updateUi(ui => {
      ui.production.candidates = [{
        id: 'new',
        name: '新表情',
        url: 'new.png',
        expression: 'surprised',
        description: ''
      }];
    });
    store.previewCandidate('new');
    expect(store.getSnapshot().dirty).toBe(false);
    const before = structuredClone(store.getSnapshot().project);
    store.adoptCandidate('new');
    expect(store.getSnapshot().project.assets.some(a => a.id === 'new')).toBe(true);
    expect(store.getSnapshot().ui.preview.temporaryCandidateId).toBeNull();
    expect(other.getSnapshot().project.assets.some(a => a.id === 'new')).toBe(false);
    store.undo();
    expect(store.getSnapshot().project).toEqual(before);
    store.dispose();
    other.dispose();
  });
  it('keeps a failed save and invalid source draft available for correction', async () => {
    let calls = 0;
    const store = new ReviewStore(createReviewSeed(), {
      ...services,
      save: async () => {
        calls++;
        throw new Error('会话服务离线');
      }
    });
    store.updateText('street', 'l24', '已保留的草稿');
    await store.save();
    expect(store.getSnapshot().error).toBe('会话服务离线');
    expect(store.getSnapshot().dirty).toBe(true);
    store.updateUi(ui => {
      ui.sourceDrafts.street = '[';
      ui.sourceErrors.street = '未闭合';
    });
    await store.save();
    expect(calls).toBe(1);
    expect(store.getSnapshot().ui.sourceDrafts.street).toBe('[');
    expect(store.getSnapshot().project.scenes[0]!.lines[23]!.text).toBe('已保留的草稿');
    store.dispose();
  });
});
