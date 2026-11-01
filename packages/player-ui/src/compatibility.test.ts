import { describe, expect, it } from 'vitest';
import type { EntryMapping } from '@galcraft/contracts';
import { FixtureSnapshot, FixtureSaveRecord, FixtureFlowEntry } from '@galcraft/contracts/fixtures';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { SessionController } from '@galcraft/runtime';
import type { StageController } from '@galcraft/stage';
import { StageCommandService } from '@galcraft/stage';
import { PlayerDataService } from './data.js';
import { PlayerLongTermService } from './long-term.js';
import { RestoreCoordinator, type EngineRestorePort } from './restore.js';
import { reportCompatibility, parseCompatibilityFile, compatibilityLongTerm } from './compatibility.js';
import { archiveText, writeArchive } from './archive.js';

const ok = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
async function setup(mappings: EntryMapping[] = [], onPrepare = () => {}, engine: EngineRestorePort | null = null) {
  const snapshot = structuredClone(FixtureSnapshot); snapshot.lock.plugins = [];
  const record = structuredClone(FixtureSaveRecord); record.dependencyVersions = structuredClone([snapshot.lock.engine, snapshot.lock.template]); record.state.plugins = {};
  let writes = 0, releases = 0;
  const data = new PlayerDataService({ target: 'web', storage: { read: async () => ok(null), commit: async () => { writes++; return ok({ revision: writes }); } } },
    { kind: 'player', projectId: snapshot.projectId, instance: 'existing' }, 'zh-CN', 'zh-CN');
  await data.open();
  const contributions = emptyContributions();
  const session = new SessionController({ longTerm: new PlayerLongTermService(data), contributions, stage: new StageCommandService({ asset: () => { throw new Error('No command execution during validation'); } }) });
  const stage = { prepareStage: async (_id: string, state: unknown, key: unknown) => { onPrepare(); return ok({ id: crypto.randomUUID(), state, restoreKey: key }); },
    discardPrepared: () => { releases++; } } as unknown as StageController;
  const restore = new RestoreCoordinator(snapshot, data, session, stage, null, mappings, engine);
  return { snapshot, record, session, data, input: { snapshot, target: 'web' as const, restore, contributions, manifests: [], entryMappings: mappings },
    effects: () => ({ writes, releases }) };
}
describe('representative save reports', () => {
  it('uses the declared engine converter, preserves provenance and rejects identity changes', async () => {
    let invalid = false;
    const context = await setup([], () => {}, { prepare: async (source, target) => {
      const converted = structuredClone(source); converted.record.engineVersion = target.engineVersion;
      converted.record.dependencyVersions[0]!.version = target.engineVersion;
      if (invalid) converted.record.projectId = crypto.randomUUID();
      return ok({ source: converted, conversions: [{ provider: 'galcraft', from: '0.9.0', to: target.engineVersion }] });
    } });
    context.record.engineVersion = '0.9.0'; context.record.dependencyVersions[0]!.version = '0.9.0';
    const files = [{ file: 'older-engine.json', bytes: archiveText(context.record) }];
    const report = await reportCompatibility({ ...context.input, files });
    expect(report.samples[0]?.conversions).toEqual([{ provider: 'galcraft', from: '0.9.0', to: '0.1.0' }]);
    expect(report.samples[0]?.result).toBe('readable'); expect(context.record.engineVersion).toBe('0.9.0');
    invalid = true;
    const rejected = await reportCompatibility({ ...context.input, files });
    expect(rejected.samples[0]?.issues[0]?.code).toBe('RESTORE_ENGINE_CONVERSION');
    expect(context.effects()).toEqual({ writes: 0, releases: 1 });
  });
  it('validates JSON with the real restore coordinator without activating or writing the current player', async () => {
    const context = await setup(), before = context.data.current();
    const report = await reportCompatibility({ ...context.input, files: [{ file: 'save.json', bytes: archiveText(context.record) }] });
    expect(report.samples[0]?.result).toBe('readable'); expect(report.samples[0]?.longTermBasis).toBe('projectInitial');
    expect(context.session.inspect()).toBeNull(); expect(context.data.current()).toEqual(before);
    expect(context.effects()).toEqual({ writes: 0, releases: 1 });
  });
  it('keeps an old save at its statement ID after inserting and renaming dialogue', async () => {
    const context = await setup();
    const position = structuredClone(context.record.state.position);
    const scene = context.snapshot.scenes.find(item => item.scene.id === position.sceneId)!;
    const index = scene.instructions.findIndex(item => item.statementId === position.statementId);
    expect(index).toBeGreaterThanOrEqual(0);
    const inserted = structuredClone(scene.instructions[index]!);
    inserted.statementId = crypto.randomUUID();
    inserted.source.statementId = inserted.statementId;
    inserted.args = { ...(inserted.args as object), text: 'Inserted dialogue' };
    scene.instructions.splice(index, 0, inserted);
    scene.instructions[index + 1]!.args = { ...(scene.instructions[index + 1]!.args as object), text: 'Renamed dialogue' };
    const report = await reportCompatibility({ ...context.input, files: [{ file: 'old-save.json', bytes: archiveText(context.record) }] });
    expect(report.samples[0]).toMatchObject({ result: 'readable', position });
    expect(context.effects()).toEqual({ writes: 0, releases: 1 });
  });
  it('reads ZIP manifest records and preserves every flow-entry origin', async () => {
    const context = await setup();
    const longTerm = compatibilityLongTerm(context.snapshot, context.input.contributions, [], null).longTerm;
    const entry = { ...structuredClone(FixtureFlowEntry), dependencyVersions: context.record.dependencyVersions,
      releaseVersion: '0.8.0', state: context.record.state };
    longTerm.flowEntries[entry.nodeId] = entry;
    const second = { ...entry, nodeId: crypto.randomUUID(), releaseVersion: '0.9.0' }; longTerm.flowEntries[second.nodeId] = second;
    const bytes = writeArchive({ 'manifest.json': archiveText({ format: 'galcraft-player-data', schemaVersion: 1,
      projectId: context.snapshot.projectId, createdAt: new Date().toISOString(), releaseVersions: ['0.1.0', '0.8.0', '0.9.0'],
      records: [context.record.recordId], index: context.data.current()!.index, longTerm, preferences: null }),
      [`records/${context.record.recordId}.json`]: archiveText(context.record) });
    const report = await reportCompatibility({ ...context.input, files: [{ file: 'data.zip', bytes }] });
    expect(report.samples.map(item => [item.source.kind, item.fromRelease, item.result, item.longTermBasis])).toEqual([
      ['save', '0.1.0', 'readable', 'provided'], ['flowEntry', '0.8.0', 'readable', 'provided'], ['flowEntry', '0.9.0', 'readable', 'provided']]);
    expect(context.effects()).toEqual({ writes: 0, releases: 3 });
  });
  it('reports a deleted position and incompatible variable values without fabricated successes', async () => {
    const context = await setup();
    context.record.state.position.statementId = crypto.randomUUID();
    const report = await reportCompatibility({ ...context.input, files: [{ file: 'deleted.json', bytes: archiveText(context.record) }, { file: 'bad.json', bytes: archiveText({}) }] });
    expect(report.samples[0]?.result).toBe('incompatible'); expect(report.samples[0]?.issues[0]?.code).toBe('RESTORE_MAPPING');
    expect(report.fileIssues).toHaveLength(1); expect(report.samples).toHaveLength(1);
    context.record.state.progress[crypto.randomUUID()] = true;
    const invalid = await reportCompatibility({ ...context.input, files: [{ file: 'state.json', bytes: archiveText(context.record) }] });
    expect(invalid.samples[0]?.issues[0]?.code).toBe('RESTORE_VARIABLE');
  });
  it('releases preparation on cancellation and marks missing samples', async () => {
    const signal = new AbortController(), context = await setup([], () => signal.abort());
    const report = await reportCompatibility({ ...context.input, signal: signal.signal, files: [{ file: 'save.json', bytes: archiveText(context.record) }] });
    expect(report.samples).toHaveLength(0); expect(report.missingSamples).toHaveLength(1);
    expect(context.effects()).toEqual({ writes: 0, releases: 1 });
  });
  it('allows an event-loop cancellation while processing a batch', async () => {
    const signal = new AbortController(), context = await setup();
    const files = Array.from({ length: 30 }, (_, index) => ({ file: `save-${index}.json`, bytes: archiveText(context.record) }));
    const pending = reportCompatibility({ ...context.input, files, signal: signal.signal });
    setTimeout(() => signal.abort(), 0);
    const report = await pending;
    expect(report.missingSamples.length).toBeGreaterThan(0);
    expect(report.samples.length).toBeLessThan(files.length);
    expect(context.effects()).toEqual({ writes: 0, releases: report.samples.length });
  });
  it('rejects a save from another project and distinguishes no samples from compatibility', async () => {
    const context = await setup();
    expect(() => parseCompatibilityFile({ file: 'other.json', bytes: archiveText({ ...context.record, projectId: crypto.randomUUID() }) }, context.snapshot.projectId)).toThrow();
    const report = await reportCompatibility({ ...context.input, files: [] });
    expect(report.samples).toHaveLength(0); expect(report.missingSamples).toHaveLength(1);
  });
});
