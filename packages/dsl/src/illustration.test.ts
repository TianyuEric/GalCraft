import { expect, test } from 'vitest';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, FixtureVariables } from '@galcraft/contracts/fixtures';
import { compile, type CompileInput } from './compiler.js';

function input(text: string): CompileInput {
  return { projectId: FixtureProject.projectId, engineVersion: FixtureProject.engineVersion, lock: FixtureLock, project: FixtureProject,
    documents: [{ documentId: 'IllDoc', revision: 1, kind: 'scene', sceneId: FixtureIds.street, text }], scenes: [FixtureScenes[0]!],
    characters: FixtureCharacters, variables: FixtureVariables, assets: [FixtureAsset], gallery: [], flows: [], template: FixtureTemplate, cancelOperationId: 'Cancel' };
}
test('publishes the same illustration identity and named-state references without requiring a character', () => {
  const result = compile(input(`changeIllustration {objectId:"Ill001",assetId:"${FixtureAsset.id}",states:[{name:"happy",assetId:"${FixtureAsset.id}"}]} @IllSay;
changeIllustrationDiff {objectId:"Ill001",stateName:"happy"} @IllDif;`));
  expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
  expect(result.symbols.objects.Ill001).toMatchObject({ documentId: 'IllDoc', statementId: 'IllSay' });
  expect(result.snapshot!.scenes[0]!.instructions.map(instruction => instruction.opcode)).toEqual(['changeIllustration', 'changeIllustrationDiff']);
});
test('diagnoses conflicting difference sources, duplicate names and invalid frame sizes at their source', () => {
  const result = compile(input(`changeIllustration {objectId:"Ill001",assetId:"${FixtureAsset.id}",illustrationFrame:{widthRatio:0},states:[{name:"happy",assetId:"${FixtureAsset.id}"},{name:"happy",assetId:"${FixtureAsset.id}"}]} @IllSay;
changeIllustrationDiff {objectId:"Ill001",stateName:"happy",assetId:"${FixtureAsset.id}"} @IllDif;`));
  expect(result.snapshot).toBeNull();
  expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['FIELD_RANGE', 'ILLUSTRATION_STATES', 'ILLUSTRATION_STATE_SOURCE']));
  expect(result.issues.every(issue => issue.source?.documentId === 'IllDoc')).toBe(true);
});
test('rejects an image selected as a custom transition animation at the exact field', () => {
  const result = compile(input(`changeIllustration {objectId:"Ill001",assetId:"${FixtureAsset.id}",transition:{enter:{preset:"custom",resourceId:"${FixtureAsset.id}"}}} @IllSay;`));
  expect(result.snapshot).toBeNull();
  expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error',
    source: expect.objectContaining({ documentId: 'IllDoc', statementId: 'IllSay', field: expect.stringContaining('resourceId') }) }));
});
