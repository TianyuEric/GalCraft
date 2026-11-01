import { describe, expect, it } from 'vitest';
import {
  AssetSchema, CancelResultSchema, ConnectionCheckSchema, ConnectionConfigSchema, DefaultTimeoutSecByPurpose,
  DialoguePartSchema, DomainSchema, IdSchema, InterfaceOperations, IssueSchema, LayoutSchema, LockSchema, OfficialActionSchema,
  ProjectSchema, RelativePathSchema, RestoreKeySchema, RevisionSchema, RuntimeStateSchema,
  SaveRecordSchema, SnapshotSchema, SourceSchema, StorageBatchSchema, UIAnimationSchema, VersionSchema,
  FlowEntryRecordSchema, HostInputSchema, LifecycleEventSchema, VisualSchema, resultSchema, operationSchema,
  createId, reserveIds, validateJsonData, GenerationOutputJsonSchema,
  ReleaseIdentitySchema, WindowsSigningSchema,
} from './index.js';
import type { Result } from './index.js';
import {
  FixtureAsset, FixtureConnection, FixtureDomains, FixtureDsl, FixtureFlowEntry, FixtureIds,
  FixtureLock, FixtureProject, FixtureRuntimeState, FixtureSaveRecord, FixtureSnapshot, FixtureTemplate, fixtureId,
} from './fixtures.js';
import { z } from 'zod';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

it('preserves legacy projects while validating work-owned executable identity and explicit local certificate selection', () => {
  expect(ProjectSchema.parse(wire(FixtureProject)).release).toBeUndefined();
  const release = { executableName: '春日来信.exe', publisher: 'Example Studio', windowsSigning: 'unsigned' };
  expect(ReleaseIdentitySchema.parse(release)).toEqual(release);
  expect(ProjectSchema.parse({ ...wire(FixtureProject), release }).projectId).toBe(FixtureProject.projectId);
  expect(ReleaseIdentitySchema.safeParse({ ...release, executableName: '../game.exe' }).success).toBe(false);
  expect(ReleaseIdentitySchema.safeParse({ ...release, executableName: 'CON.exe' }).success).toBe(false);
  expect(WindowsSigningSchema.safeParse({ mode: 'certificate' }).success).toBe(false);
  expect(WindowsSigningSchema.parse({ mode: 'unsigned' })).toEqual({ mode: 'unsigned' });
});

it('retries namespace and Windows case collisions and reserves each new identity', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const sequence = ['Qa1bC2', 'Zz8Yx7', 'Zz8Yx7', 'Ww9Vu6'];
  let attempts = 0;
  const fill = (bytes: Uint8Array) => { bytes.fill(255); const value = sequence[attempts++]!;
    [...value].forEach((char, index) => { bytes[index] = alphabet.indexOf(char); }); };
  reserveIds({ files: { 'scenes/qa1bc2/script.gal': 'end {} @qa1bc2;' } });
  expect(createId([], fill)).toBe('Zz8Yx7');
  expect(createId([], fill)).toBe('Ww9Vu6');
  expect(attempts).toBe(4);
  const generated = Array.from({ length: 100 }, () => createId());
  expect(generated.every(value => /^[A-Za-z0-9]{6}$/.test(value))).toBe(true);
  expect(new Set(generated.map(value => value.toLowerCase())).size).toBe(100);
});

describe('F shared wire contracts', () => {
  it('preserves old projects and checks protagonist and string progress bindings for custom names', () => {
    const snapshot=structuredClone(FixtureSnapshot), variableId=fixtureId(0xfa1);
    expect(ProjectSchema.parse(FixtureProject).player.name).toBeUndefined();
    snapshot.project.player.name={characterId:FixtureIds.protagonist,defaultName:'旅行者',allowCustom:false,variableId:null,maxLength:24,promptPolicy:'always'};
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
    const invalidName=structuredClone(snapshot);invalidName.project.player.name!.defaultName='   ';
    expect(SnapshotSchema.safeParse(invalidName).success).toBe(false);
    invalidName.project.player.name!.defaultName='长姓名';invalidName.project.player.name!.maxLength=1;
    expect(SnapshotSchema.safeParse(invalidName).success).toBe(false);
    snapshot.project.player.name.allowCustom=true;
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(false);
    snapshot.project.player.name.variableId=variableId;
    snapshot.variables.push({id:variableId,name:'主角姓名',scope:'progress',type:'number',initial:0});
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(false);
    snapshot.variables[snapshot.variables.length-1]={id:variableId,name:'主角姓名',scope:'progress',type:'string',initial:'旅行者'};
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
    snapshot.project.player.name.characterId=fixtureId(0xfa2);
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
  it('accepts six-character identities and legacy UUIDs, revisions and exact SemVer', () => {
    expect(IdSchema.safeParse(FixtureIds.projectA).success).toBe(true);
    expect(IdSchema.safeParse('Ab3dE6').success).toBe(true);
    expect(IdSchema.safeParse('00000000-0000-4000-8000-000000000001').success).toBe(true);
    for (const value of ['abcde', 'abcdefg', 'abc_de', '中文abc1']) expect(IdSchema.safeParse(value).success).toBe(false);
    expect(IdSchema.safeParse('AAAAAAAA-0000-4000-8000-000000000001').success).toBe(false);
    expect(IdSchema.safeParse('00000000-0000-1000-8000-000000000001').success).toBe(false);
    expect(RevisionSchema.safeParse(0).success).toBe(true);
    expect(RevisionSchema.safeParse(-1).success).toBe(false);
    expect(RevisionSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    for (const value of ['0.1.0', '1.1.0', '0.1.0-rc.1+build.3']) expect(VersionSchema.safeParse(value).success).toBe(true);
    for (const value of ['^0.1.0', '~0.1.0', 'latest', 'v0.1.0', '1.0', '0.1.0-01']) expect(VersionSchema.safeParse(value).success).toBe(false);
    expect(RelativePathSchema.safeParse('assets/files/voice.wav').success).toBe(true);
    expect(RelativePathSchema.safeParse('C:/Users/Creator/voice.wav').success).toBe(false);
  });

  it('keeps one exact Lock and eight isolated domain identities', () => {
    expect(LockSchema.parse(wire(FixtureLock))).toEqual(FixtureLock);
    expect(FixtureLock.engine.id).toBe('galcraft');
    expect(LockSchema.safeParse({ ...FixtureLock, engine: { ...FixtureLock.engine, version: '^0.1.0' } }).success).toBe(false);
    expect(FixtureDomains.map(domain => DomainSchema.parse(wire(domain)))).toEqual(FixtureDomains);
    expect(new Set(FixtureDomains.map(domain => `${domain.projectId}/${domain.kind}/${domain.instance}`)).size).toBe(8);
    expect(DomainSchema.safeParse({ projectId: FixtureIds.projectA, kind: 'player', instance: 'other' }).success).toBe(false);
  });

  it('preserves Result, Issue, cancellation and restore identity', () => {
    const issue = IssueSchema.parse({ code: 'PLAN_STALE', severity: 'error', message: '版本已变化', owner: 'M02', related: [], actions: ['compare'] });
    const success: Result<number> = { ok: true, value: 10, warnings: [] };
    const failure: Result<number> = { ok: false, error: issue, issues: [issue] };
    expect(resultSchema(z.number()).parse(wire(success))).toEqual(success);
    expect(resultSchema(z.number()).parse(wire(failure))).toEqual(failure);
    expect(operationSchema(z.number()).parse({ operationId: FixtureIds.request, state: 'completed', phase: 'saved', result: success })).toMatchObject({ result: success });
    expect(CancelResultSchema.parse({ local: 'commitInProgress', remote: 'notApplicable' })).toEqual({ local: 'commitInProgress', remote: 'notApplicable' });
    expect(RestoreKeySchema.parse({ requestId: FixtureIds.request, sessionId: FixtureIds.session, snapshotId: FixtureIds.snapshot })).toEqual({ requestId: FixtureIds.request, sessionId: FixtureIds.session, snapshotId: FixtureIds.snapshot });
    expect(SourceSchema.parse({ documentId: FixtureIds.streetDocument, statementId: FixtureIds.statements[0], range: { start: 2, end: 4 }, revision: 1 }).range).toEqual({ start: 2, end: 4 });
    expect(SourceSchema.safeParse({ documentId: FixtureIds.streetDocument, range: { start: 4, end: 2 }, revision: 1 }).success).toBe(false);
  });

  it('shares F-BASE project, asset and snapshot fields across the wire', () => {
    expect(ProjectSchema.parse(wire(FixtureProject))).toEqual(FixtureProject);
    expect(AssetSchema.parse(wire(FixtureAsset))).toEqual(FixtureAsset);
    expect(SnapshotSchema.parse(wire(FixtureSnapshot))).toEqual(FixtureSnapshot);
    const say = FixtureSnapshot.scenes.flatMap(scene => scene.instructions).filter(value => value.opcode === 'say');
    expect(say.map(value => value.statementId)).toEqual(FixtureIds.statements);
    expect(new Set(say.map(value => (value.args as { voice: string | null }).voice)).size).toBe(8);
    expect(say.some(value => (value.args as { speaker: { kind: string } }).speaker.kind === 'narrator')).toBe(true);
    expect(say.some(value => (value.args as { speaker: { id?: string }; voice: string | null }).speaker.id === FixtureIds.protagonist && (value.args as { voice: string | null }).voice === null)).toBe(true);
    expect(FixtureSnapshot.scenes[0]?.instructions.some(value => value.opcode === 'choose')).toBe(true);
    const choice = FixtureSnapshot.scenes[0]?.instructions.find(value => value.opcode === 'choose');
    expect((choice?.args as { options: { target: { sceneId: string } }[] }).options.some(option => option.target.sceneId === FixtureIds.bookshop)).toBe(true);
    const assetIds = new Set(FixtureSnapshot.assets.map(asset => asset.assetId));
    expect(say.every(value => (value.args as { voice: string | null }).voice === null || assetIds.has((value.args as { voice: string }).voice))).toBe(true);
    expect(FixtureDsl.street.match(/@[A-Za-z0-9]{6};/g)).toHaveLength(6);
    expect(FixtureDsl.bookshop.match(/@[A-Za-z0-9]{6};/g)).toHaveLength(4);
    expect(SnapshotSchema.safeParse({ ...FixtureSnapshot, releaseVersion: '1.1.0' }).success).toBe(false);
    expect(SnapshotSchema.safeParse({ ...FixtureSnapshot, template: { ...FixtureTemplate, version: '1.1.0' } }).success).toBe(false);
  });

  it('keeps save and flow entry origins independent from plugin state versions', () => {
    expect(RuntimeStateSchema.parse(wire(FixtureRuntimeState))).toEqual(FixtureRuntimeState);
    expect(SaveRecordSchema.parse(wire(FixtureSaveRecord))).toEqual(FixtureSaveRecord);
    expect(FlowEntryRecordSchema.parse(wire(FixtureFlowEntry))).toEqual(FixtureFlowEntry);
    const changed = { ...FixtureFlowEntry, releaseVersion: '1.1.0', state: { ...FixtureRuntimeState, plugins: {
      'org.galcraft.affection': { version: '0.1.0', stateVersion: 2, progress: { relation: 40 } },
    } } };
    expect(FlowEntryRecordSchema.parse(wire(changed)).releaseVersion).toBe('1.1.0');
    expect(FlowEntryRecordSchema.parse(wire(changed)).state.plugins['org.galcraft.affection']?.stateVersion).toBe(2);
  });

  it('keeps task timeouts and connection checks purpose-specific', () => {
    expect(ConnectionConfigSchema.parse(wire(FixtureConnection))).toEqual(FixtureConnection);
    expect(DefaultTimeoutSecByPurpose).toEqual({ text: 120, image: 600, difference: 600, speech: 600, music: 600, matting: 600 });
    const check = {
      connectionId: FixtureIds.connection, connectionRevision: 1, workflowBindingId: fixtureId(0x702), workflowRevision: 2,
      purpose: 'image', imageUsage: 'background', model: 'fixture-model', reachable: 'passed', mapping: 'passed',
      trial: { taskId: null, result: 'notRun', checkedAt: null }, issues: [],
    };
    expect(ConnectionCheckSchema.parse(check)).toEqual(check);
    expect(ConnectionCheckSchema.safeParse({ ...check, imageUsage: 'invalid' }).success).toBe(false);
  });

  it('keeps PlayerHost storage and UI input at the documented boundary', () => {
    const batch = { domain: FixtureDomains[0], expectedRevision: 0, writes: [{ key: 'save/1', bytes: new Uint8Array([1, 2]) }], deletes: [] };
    expect(StorageBatchSchema.parse(batch).writes[0]?.bytes).toEqual(new Uint8Array([1, 2]));
    expect(HostInputSchema.parse({ action: 'back', phase: 'down', origin: 'system' })).toEqual({ action: 'back', phase: 'down', origin: 'system' });
    expect(LifecycleEventSchema.parse({ type: 'background', at: '2026-09-23T00:00:00Z' }).type).toBe('background');
    expect(OfficialActionSchema.parse({ kind: 'saveSlot', slotId: FixtureIds.save })).toEqual({ kind: 'saveSlot', slotId: FixtureIds.save });
    expect(InterfaceOperations.I07).toContain('prepareRestore');
    expect(InterfaceOperations.I11).toContain('resolveEngine');
  });

  it('rejects invalid shared layout and dialogue state', () => {
    const layout = FixtureTemplate.pages[0]!.layout;
    expect(LayoutSchema.safeParse({ ...layout, x: { unit: 'auto' } }).success).toBe(false);
    expect(LayoutSchema.safeParse({ ...layout, minWidth: -1 }).success).toBe(false);
    expect(LayoutSchema.safeParse({ ...layout, maxWidth: 1, minWidth: 2 }).success).toBe(false);
    expect(LayoutSchema.safeParse({ ...layout, width: { unit: 'px', value: -100 } }).success).toBe(false);
    expect(LayoutSchema.safeParse({ ...layout, height: { unit: 'percent', value: -1 } }).success).toBe(false);
    expect(LayoutSchema.safeParse({ ...layout, x: { unit: 'px', value: -100 } }).success).toBe(true);
    const visual = FixtureTemplate.defaultVisual;
    expect(VisualSchema.safeParse({ ...visual, fontSize: 0 }).success).toBe(false);
    expect(VisualSchema.safeParse({ ...visual, lineHeight: 0 }).success).toBe(false);
    expect(VisualSchema.safeParse({ ...visual, opacity: 2 }).success).toBe(false);
    expect(VisualSchema.safeParse({ ...visual, background: { ...visual.background, positionX: -1 } }).success).toBe(false);
    expect(VisualSchema.safeParse({ ...visual, background: { ...visual.background, positionY: 2 } }).success).toBe(false);
    expect(UIAnimationSchema.safeParse({ id: FixtureIds.projectA, name: 'fade', version: 1, segments: [
      { durationMs: 100, easing: { family: 'linear', direction: 'in' }, opacity: 2 },
    ], reduced: 'fade' }).success).toBe(false);
    const part = FixtureRuntimeState.presentation.text.parts[0]!;
    expect(DialoguePartSchema.safeParse({ ...part, characterId: null }).success).toBe(false);
    expect(DialoguePartSchema.safeParse({ ...part, speakerKind: 'narrator', characterId: FixtureIds.an }).success).toBe(false);
  });
});

it('validates recursive local definitions through union branches and preserves null usage',()=>{
  const output={artifacts:[{kind:'image',localPath:'D:/output.png',mime:'image/png',bytes:12,metadata:{width:1920,provider:{labels:['海边',null]}},groupId:'Group1',role:'primary',background:null}],usage:null};
  expect(validateJsonData(GenerationOutputJsonSchema,output).ok).toBe(true);
  expect(validateJsonData(GenerationOutputJsonSchema,{...output,artifacts:[{...output.artifacts[0],bytes:'wrong'}]}).ok).toBe(false);
  const schema:import('./common.js').Json={$defs:{item:{type:'object',properties:{count:{type:'integer',minimum:0}},required:['count'],additionalProperties:false}},anyOf:[{$ref:'#/$defs/item'},{type:'null'}]};
  expect(validateJsonData(schema,{count:1}).ok).toBe(true);
  expect(validateJsonData(schema,{count:-1}).ok).toBe(false);
  expect(validateJsonData({$ref:'https://example.com/schema'},{}).ok).toBe(false);
  expect(validateJsonData({$ref:'#/$defs/missing'},{}).ok).toBe(false);
});
