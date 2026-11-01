import { expect, it } from 'vitest';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import type { PublishGuiDraft } from './Publish.js';
import { publishIdentityChanges,mergePublishIdentity,publishIdentityBase } from './publish-identity.js';
it('distinguishes work signing policy from the local certificate and output choices',()=>{
  const project=structuredClone(FixtureProject),draft={target:'windows',steamAppId:project.platform.steamAppId??'',version:project.releaseVersion,brandName:project.name,brandIcon:project.display.icon??'',executableName:'Game.exe',publisher:'',windowsSigning:'unsigned',certificate:'local-choice',output:'D:/release'} as PublishGuiDraft;
  expect(publishIdentityChanges(draft,project)).toEqual([]);
  expect(publishIdentityChanges({...draft,windowsSigning:'certificate'},project)).toEqual(['windowsSigning']);
  expect(publishIdentityChanges({...draft,windowsSigning:'certificate'},{...project,release:{executableName:'Game.exe',publisher:'',windowsSigning:'certificate'}})).toEqual([]);
});
it('retains the original form base and merges only authored release fields with intervening work',()=>{
  const base=structuredClone(FixtureProject),draft={target:'windows',steamAppId:base.platform.steamAppId??'',version:base.releaseVersion,brandName:'Author title',brandIcon:base.display.icon??'',executableName:'Game.exe',publisher:'',windowsSigning:'unsigned'} as PublishGuiDraft;
  const latest={...base,release:{executableName:'Game.exe',publisher:'Harness publisher',windowsSigning:'unsigned' as const}};
  const merged=mergePublishIdentity(publishIdentityBase(base),draft,latest);expect(merged.conflicts).toEqual([]);expect(merged.project.name).toBe('Author title');expect(merged.project.release?.publisher).toBe('Harness publisher');
  latest.name='Harness title';expect(mergePublishIdentity(publishIdentityBase(base),draft,latest).conflicts).toEqual(['brandName']);
  expect(mergePublishIdentity(publishIdentityBase(base),draft,latest,'current').project.name).toBe('Harness title');expect(mergePublishIdentity(publishIdentityBase(base),draft,latest,'draft').project.name).toBe('Author title');
});
