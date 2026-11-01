import { expect, it } from 'vitest';
import { StartupClipSchema, StartupSequenceSchema, createId } from '@galcraft/contracts';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, FixtureVariables } from '@galcraft/contracts/fixtures';
import { compile, type CompileInput } from './compiler.js';

it('checks startup clip media kind and actual duration at its project source', () => {
  const project = structuredClone(FixtureProject), asset = structuredClone(FixtureAsset), clipId = createId();
  project.display.startupSequence = StartupSequenceSchema.parse({ clips: [StartupClipSchema.parse({ id: clipId, kind: 'video', name: '开场视频', assetId: asset.id, startSec: 2, endSec: 5 })] });
  const source = { documentId: createId(), revision: 1, field: '/data/display/startupSequence/clips/0/assetId' };
  const input: CompileInput = { projectId: project.projectId, engineVersion: project.engineVersion, lock: FixtureLock, project,
    documents: [{ documentId: createId(), revision: 1, kind: 'scene', sceneId: FixtureIds.street, text: `say {speaker:{kind:"narrator"},text:"开始"} @${createId()};` }],
    scenes: [FixtureScenes[0]!], characters: FixtureCharacters, variables: FixtureVariables, assets: [asset], gallery: [], flows: [], template: FixtureTemplate, cancelOperationId: createId(),
    assetReferences: [{ assetId: asset.id, variantId: null, owner: { kind: 'document', id: source.documentId }, source, usage: 'startup', required: true }] };
  expect(compile(input).issues.find(issue => issue.code === 'STARTUP_ASSET_KIND')?.source).toEqual(source);
  asset.kind = 'video'; asset.variants[0]!.metadata.durationSec = 4;
  expect(compile(input).issues.find(issue => issue.code === 'STARTUP_VIDEO_RANGE')?.source).toEqual(source);
  asset.variants[0]!.metadata.durationSec = 6;
  const result = compile(input); expect(result.issues.filter(issue => issue.code.startsWith('STARTUP_'))).toEqual([]);
  expect(result.snapshot?.assets.some(item => item.assetId === asset.id)).toBe(true);
});
