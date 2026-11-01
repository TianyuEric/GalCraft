import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import type { BuildInput, Result } from '@galcraft/contracts';
import { ReleaseBuilder, type BuildMaterial } from './build.js';
import type { EngineManifest } from './manifest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../tmp/testing/publishing-b');
const output = join(root, 'release');
const pass = async (): Promise<Result<{ evidencePaths: string[] }>> => ({ ok: true, value: { evidencePaths: [] }, warnings: [] });
function fixture() {
  const snapshot = structuredClone(FixtureSnapshot); snapshot.assets = [];
  const savedVersions = snapshot.documents.map(item => ({ ref: { kind: 'document' as const, id: item.documentId }, revision: item.revision }));
  const input: BuildInput = { projectId: snapshot.projectId, target: 'web', outputDirectory: output, releaseVersion: '0.1.0', snapshotId: snapshot.snapshotId,
    savedVersions, keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] };
  const material: BuildMaterial = { project: snapshot.project, snapshot, savedVersions,
    engine: { manifest: { version: '0.1.0' } as EngineManifest, directory: root, target: 'web', availability: 'ready' },
    files: [], textFiles: { 'index.html': 'runtime fixture', 'game/style.css': '' }, capabilities: [], issues: [], entry: 'index.html', gameDirectory: 'game', instructions: '<p>HTTP</p>' };
  return { input, material };
}
function planned(builder: ReleaseBuilder, input: BuildInput, material: BuildMaterial) {
  const plan = builder.planBuild(input, material); if (!plan.ok) throw new Error(plan.error.message); return plan.value.planId;
}
beforeEach(async () => { await mkdir(root, { recursive: true }); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
describe('saved release planning and directory transactions', () => {
  it('requires an explicit mobile builder, commits its real artifact and keeps the previous artifact on cancellation', async () => {
    const { input, material } = fixture(); input.target = 'android'; material.engine.target = 'android';
    expect(new ReleaseBuilder(pass).planBuild(input, material)).toMatchObject({ ok: false, error: { code: 'BUILD_TARGET_BUILDER_REQUIRED' } });
    input.targetBuilder = { key: 'example.mobile/build', pluginId: 'example.mobile', version: '0.1.0' }; input.targetOptions = { output: 'apk' };
    const builder = new ReleaseBuilder(pass, undefined, undefined, async ({ stagingDirectory }, signal) => {
      signal.throwIfAborted(); await writeFile(join(stagingDirectory, 'story.apk'), 'actual provider artifact');
      return { ok: true, value: { entry: 'story.apk', handoff: { path: 'story.apk', kind: 'file' }, artifacts: [{ path: 'story.apk', kind: 'apk', bytes: 24 }] }, warnings: [] };
    });
    const result = await builder.build(planned(builder, input, material)); expect(result).toMatchObject({ ok: true, value: { target: 'android', handoff: { kind: 'file' } } });
    const before = await readFile(join(output, 'story.apk'), 'utf8');
    let cancelled: ReleaseBuilder;
    cancelled = new ReleaseBuilder(pass, (id, phase) => { if (phase === 'verifying') cancelled.cancel(id); }, undefined, async () => { throw new Error('Cancelled provider must not commit'); });
    expect((await cancelled.build(planned(cancelled, input, material))).ok).toBe(false);
    expect(await readFile(join(output, 'story.apk'), 'utf8')).toBe(before);
  });
  it('projects author metadata out of the Player snapshot and preserves real audio loop metadata',async()=>{
    const builder=new ReleaseBuilder(pass),{input,material}=fixture();
    const asset=structuredClone(FixtureSnapshot.assets[0]!);asset.files=[];
    asset.metadata={durationSec:9.6,sampleRate:48000,channels:2,loop:{startSec:0,endSec:9.6,tail:'wrap'},
      authorDocument:{documentId:'Source',pluginId:'org.galcraft.music-composition',contributionKey:'org.galcraft.music-composition/score',stateVersion:1}};
    material.snapshot.assets=[asset];expect((await builder.build(planned(builder,input,material))).ok).toBe(true);
    const released=JSON.parse(await readFile(join(output,'game/snapshot.json'),'utf8'));
    expect(released.assets[0].metadata).toEqual({durationSec:9.6,sampleRate:48000,channels:2,loop:{startSec:0,endSec:9.6,tail:'wrap'}});
    expect(material.snapshot.assets[0]!.metadata.authorDocument?.documentId).toBe('Source');
  });
  it('records unsigned Windows output and preserves it when selected signing fails', async () => {
    const { input, material } = fixture(); input.target = 'windows'; material.engine.target = 'windows';
    const first = new ReleaseBuilder(pass);
    const result = await first.build(planned(first, input, material));
    expect(result).toMatchObject({ ok: true, value: { signature: { status: 'unsigned' } } });
    const before = await readFile(join(output, 'release.manifest.json'), 'utf8');
    input.windowsSigning = { mode: 'certificate', certificateThumbprint: 'a'.repeat(40) };
    const failed = new ReleaseBuilder(pass, undefined, async () => { throw new Error('Selected certificate unavailable'); });
    const id = planned(failed, input, material);
    expect(await failed.build(id)).toMatchObject({ ok: false, error: { code: 'BUILD_FAILED' } });
    expect(failed.receipt(id)).toMatchObject({ ok: true, value: null });
    expect(await readFile(join(output, 'release.manifest.json'), 'utf8')).toBe(before);
    const unavailable = new ReleaseBuilder(pass);
    expect(unavailable.planBuild(input, material)).toMatchObject({ ok: true, value: { issues: [{ code: 'BUILD_SIGNING_UNAVAILABLE' }] } });
  });
  it('rejects release and complete saved vector mismatch', () => {
    const builder = new ReleaseBuilder(pass), { input, material } = fixture();
    expect(builder.planBuild({ ...input, releaseVersion: '1.1.0' }, material).ok).toBe(false);
    expect(builder.planBuild({ ...input, savedVersions: input.savedVersions.slice(1) }, material).ok).toBe(false);
    material.snapshot.project.releaseVersion = '1.1.0'; expect(builder.planBuild(input, material).ok).toBe(false);
    material.snapshot.project.releaseVersion = '0.1.0';
    material.snapshot.documents.pop(); expect(builder.planBuild(input, material).ok).toBe(false);
  });
  it('freezes the selected version and excludes local source paths from manifest', async () => {
    const builder = new ReleaseBuilder(pass), { input, material } = fixture();
    const planId = planned(builder, input, material);
    material.snapshot.project.name = 'later edit'; input.releaseVersion = '1.1.0'; material.textFiles['index.html'] = 'later';
    const result = await builder.build(planId); expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.releaseVersion).toBe('0.1.0'); expect(result.value.localTest.result).toBe('notExecuted');
    const manifest = JSON.parse(await readFile(join(output, 'release.manifest.json'), 'utf8'));
    expect(manifest.version).toBe('0.1.0'); expect(manifest.name).toBe(FixtureSnapshot.project.name);
    expect(JSON.stringify(manifest)).not.toContain(root); expect(await readFile(join(output, 'index.html'), 'utf8')).toBe('runtime fixture');
  });
  it('keeps the previous release on verification failure and cancellation', async () => {
    const first = new ReleaseBuilder(pass), { input, material } = fixture();
    expect((await first.build(planned(first, input, material))).ok).toBe(true);
    const before = await readFile(join(output, 'release.manifest.json'), 'utf8');
    const failed = new ReleaseBuilder(async () => { throw new Error('target failed'); });
    expect((await failed.build(planned(failed, input, material))).ok).toBe(false);
    const cancelled = new ReleaseBuilder(pass, (id, phase) => { if (phase === 'verifying') cancelled.cancel(id); });
    expect((await cancelled.build(planned(cancelled, input, material))).ok).toBe(false);
    expect(await readFile(join(output, 'release.manifest.json'), 'utf8')).toBe(before);
  });
  it('returns a failed receipt and keeps the previous release when staging cannot write a file', async () => {
    const { input, material } = fixture();
    const first = new ReleaseBuilder(pass);
    expect((await first.build(planned(first, input, material))).ok).toBe(true);
    const beforeManifest = await readFile(join(output, 'release.manifest.json'), 'utf8');
    const beforeEntry = await readFile(join(output, 'index.html'), 'utf8');
    material.textFiles['index.html/child.txt'] = 'cannot be written under a file';
    const failed = new ReleaseBuilder(pass), planId = planned(failed, input, material);
    const result = await failed.build(planId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BUILD_FAILED');
    const receipt = await failed.receipt(planId); expect(receipt.ok).toBe(true);
    if (receipt.ok) expect(receipt.value).toBeNull();
    expect(await readFile(join(output, 'release.manifest.json'), 'utf8')).toBe(beforeManifest);
    expect(await readFile(join(output, 'index.html'), 'utf8')).toBe(beforeEntry);
  });
  it('recovers old output after first rename and retains installed output after second rename', async () => {
    const builder = new ReleaseBuilder(pass), { input, material } = fixture();
    expect((await builder.build(planned(builder, input, material))).ok).toBe(true);
    const previous = join(root, '.release.previous-interrupted'), staging = join(root, '.release.staging-interrupted');
    await rename(output, previous); await mkdir(staging);
    const log = join(root, '.release.galcraft-build.json');
    await writeFile(log, JSON.stringify({ output, previous, staging, phase: 'oldMoved' }));
    await builder.recover(output); expect(await readFile(join(output, 'index.html'), 'utf8')).toBe('runtime fixture');
    await rename(output, previous); await writeFile(join(staging, 'index.html'), 'installed'); await rename(staging, output);
    await writeFile(log, JSON.stringify({ output, previous, staging, phase: 'oldMoved' }));
    await builder.recover(output); expect(await readFile(join(output, 'index.html'), 'utf8')).toBe('installed');
  });
  it('refuses an unrelated nonempty output directory', async () => {
    await mkdir(output); await writeFile(join(output, 'author.txt'), 'keep');
    const builder = new ReleaseBuilder(pass), { input, material } = fixture();
    expect(await builder.checkOutput(input)).toMatchObject({ ok: false, error: { code: 'BUILD_OUTPUT_NOT_RELEASE' } });
    expect(await builder.build(planned(builder, input, material))).toMatchObject({ ok: false, error: { code: 'BUILD_OUTPUT_NOT_RELEASE' } });
    expect(await readFile(join(output, 'author.txt'), 'utf8')).toBe('keep');
  });
  it('accepts new, empty and matching releases, and rejects files, invalid manifests and other targets', async () => {
    const builder = new ReleaseBuilder(pass), { input, material } = fixture();
    expect((await builder.checkOutput(input)).ok).toBe(true);
    await writeFile(output, 'personal file');
    expect(await builder.checkOutput(input)).toMatchObject({ ok: false, error: { code: 'BUILD_OUTPUT_INVALID' } });
    await rm(output); await mkdir(output);
    expect((await builder.checkOutput(input)).ok).toBe(true);
    await writeFile(join(output, 'release.manifest.json'), '{}');
    expect(await builder.checkOutput(input)).toMatchObject({ ok: false, error: { code: 'BUILD_OUTPUT_NOT_RELEASE' } });
    await rm(join(output, 'release.manifest.json'));
    expect((await builder.build(planned(builder, input, material))).ok).toBe(true);
    expect((await builder.checkOutput(input)).ok).toBe(true);
    expect(await builder.checkOutput({ ...input, target: 'windows' })).toMatchObject({ ok: false, error: { code: 'BUILD_OUTPUT_MISMATCH' } });
    expect(await builder.checkOutput({ ...input, projectId: 'OtherA' })).toMatchObject({ ok: false, error: { code: 'BUILD_OUTPUT_MISMATCH' } });
  });
  it('rechecks a directory changed after planning without replacing its new contents', async () => {
    const builder = new ReleaseBuilder(pass), { input, material } = fixture();
    expect((await builder.checkOutput(input)).ok).toBe(true);
    const planId = planned(builder, input, material);
    await mkdir(output); await writeFile(join(output, 'personal.txt'), 'keep');
    expect(await builder.build(planId)).toMatchObject({ ok: false, error: { code: 'BUILD_OUTPUT_NOT_RELEASE' } });
    expect(await readFile(join(output, 'personal.txt'), 'utf8')).toBe('keep');
    expect(builder.receipt(planId)).toMatchObject({ ok: true, value: null });
  });
});
