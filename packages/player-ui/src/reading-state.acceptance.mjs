import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createId, RuntimeStateSchema } from '@galcraft/contracts';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { SessionController } from '@galcraft/runtime';
import { PlayerDataService } from '@galcraft/player-ui/data';
import { PlayerLongTermService } from '@galcraft/player-ui/long-term';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { WindowsPlayerStorage } from '../../../apps/player-windows/main/storage.mjs';

const repo = resolve(import.meta.dirname, '../../..'), output = join(repo, 'test-results/latest/sample-reading-collaboration/w2');
await mkdir(output, { recursive: true }); await mkdir(join(repo, 'tmp/testing'), { recursive: true });
const directory = await mkdtemp(join(repo, 'tmp/testing/reading-state-'));
const ok = value => ({ ok: true, value, warnings: [] });
const value = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
const snapshot = structuredClone(FixtureSnapshot), scene = snapshot.scenes[0], base = scene.instructions.find(item => item.opcode === 'say');
const first = createId(), second = createId();
const say = (statementId, text) => ({ ...base, statementId, args: { speaker: { kind: 'narrator' }, text }, source: { ...base.source, statementId } });
scene.instructions = [say(first, '首次停留和存档保持未读。'), say(second, '进入下一句后才记录上一句。')];
const domain = { projectId: snapshot.projectId, kind: 'player', instance: 'src-real-disk' };
const host = { target: 'windows', storage: new WindowsPlayerStorage(directory) };
const open = async restored => {
  const data = new PlayerDataService(host, domain, 'zh-CN', 'zh-CN'); value(await data.open());
  const longTerm = new PlayerLongTermService(data), runtime = new SessionController({ contributions: emptyContributions(), longTerm,
    stage: { prepare: async input => ok({ state: input.state, delta: null }) } });
  const position = { sceneId: scene.scene.id, statementId: first };
  const prepared = value(await runtime.prepareSession({ snapshot, domain, target: null, source: restored ?
    { kind: 'restored', state: RuntimeStateSchema.parse(restored.state), history: restored.history, voiceLocale: 'zh-CN' } :
    { kind: 'entry', scenario: { schemaVersion: 1, id: createId(), name: 'SRC actual Windows storage', projectId: snapshot.projectId,
      entry: position, target: position, initialProgress: {}, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate', engineVersion: snapshot.engineVersion, pluginVersions: [] } } }));
  value(runtime.activate(prepared.id)); longTerm.setActiveSession(prepared.sessionId); value(await runtime.start());
  return { data, longTerm, runtime };
};
const checks = [];
let current = await open();
assert(!current.data.current().longTerm.readStatements.includes(first));
value(await current.runtime.updateTextProgress({ token: current.runtime.inspect().token, textShown: 100000 }));
assert(!current.data.current().longTerm.readStatements.includes(first));
const record = current.data.makeRecord({ snapshot, inspection: current.runtime.inspect(), kind: 'manual' });
value(await current.data.save({ kind: 'manual', record, expectedIndexRevision: current.data.current().index.revision, overwriteConfirmed: false }));
checks.push({ id: 'A2-DISK-1', actual: 'First stay, full reveal and saved manual A leave readStatements empty.' });
current.runtime.dispose();
current = await open(record);
const diskRecord = value(await current.data.record(record.recordId)); assert(diskRecord);
assert(!current.data.current().longTerm.readStatements.includes(first));
value(await current.runtime.dispatch({ kind: 'advance', token: current.runtime.inspect().token }));
assert.equal(current.runtime.inspect().state.position.statementId, second);
assert(current.data.current().longTerm.readStatements.includes(first));
assert(!current.data.current().longTerm.readStatements.includes(second));
checks.push({ id: 'A2-DISK-2', actual: 'A loaded from real saved bytes stays unread until successful A→B; B remains unread.' });
current.runtime.dispose();
current = await open(diskRecord);
assert.equal(current.runtime.inspect().state.position.statementId, first);
assert(current.data.current().longTerm.readStatements.includes(first));
assert(!current.runtime.inspect().state.pendingReadStatementId);
checks.push({ id: 'A2-DISK-3', actual: 'A fresh data service and restored old A consume current on-disk longTerm with A read.' });
const report = { result: 'passed', executedAt: new Date().toISOString(), target: 'M05 + M07 actual WindowsPlayerStorage disk save/reopen',
  environment: { os: process.platform, node: process.version, storage: 'Official WindowsPlayerStorage, real files and M02 file transactions',
    stage: 'Silent two-line fixture; no external media, stage prepares unchanged state.' }, directory, projectId: snapshot.projectId,
  statementIds: { first, second }, record, longTerm: current.data.current().longTerm, checks };
await writeFile(join(output, 'disk-report.json'), JSON.stringify(report, null, 2)); current.runtime.dispose();
console.log(JSON.stringify({ result: report.result, directory, checks: checks.map(check => check.id) }));
