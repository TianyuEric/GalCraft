import type { Project } from '@galcraft/contracts';
import type { PublishGuiDraft } from './Publish.js';

/** Fields applied by the release form; build jobs and output files have their own lifecycle. */
export const PublishHistoryPaths = ['/data/releaseVersion', '/data/platform/steamAppId', '/data/name', '/data/display/icon', '/data/release'];

export type PublishIdentityField = 'steamAppId' | 'version' | 'brandName' | 'brandIcon' | 'executableName' | 'publisher' | 'windowsSigning';
export type PublishIdentityBase=Pick<Project,'projectId'|'name'|'releaseVersion'|'release'|'platform'|'display'>;
export function publishIdentityBase(project:Project):PublishIdentityBase{return structuredClone({projectId:project.projectId,name:project.name,releaseVersion:project.releaseVersion,release:project.release,platform:project.platform,display:project.display});}
export function publishIdentityChanges(draft: PublishGuiDraft, project: PublishIdentityBase): PublishIdentityField[] {
  const fields: [PublishIdentityField, unknown, unknown][] = [
    ['steamAppId', draft.steamAppId ?? '', project.platform.steamAppId ?? ''],
    ['version', draft.version, project.releaseVersion], ['brandName', draft.brandName, project.name],
    ['brandIcon', draft.brandIcon, project.display.icon ?? ''],
  ];
  if (draft.target === 'windows') fields.push(
    ['executableName', draft.executableName, project.release?.executableName ?? 'Game.exe'],
    ['publisher', draft.publisher, project.release?.publisher ?? ''],
    ['windowsSigning', draft.windowsSigning, project.release?.windowsSigning ?? 'unsigned'],
  );
  return fields.filter(([, value, baseline]) => value !== baseline).map(([field]) => field);
}
export function mergePublishIdentity(base:PublishIdentityBase,draft:PublishGuiDraft,current:Project,resolution?:'draft'|'current'):{project:Project;conflicts:PublishIdentityField[]}{
  const project=structuredClone(current),conflicts:PublishIdentityField[]=[],changed=publishIdentityChanges(draft,base),currentChanged=publishIdentityChanges(draft,current);
  const read=(value:PublishIdentityBase,field:PublishIdentityField)=>field==='steamAppId'?value.platform.steamAppId??'':field==='version'?value.releaseVersion:field==='brandName'?value.name:field==='brandIcon'?value.display.icon??'':field==='executableName'?value.release?.executableName??'Game.exe':field==='publisher'?value.release?.publisher??'':value.release?.windowsSigning??'unsigned';
  for(const field of changed){
    if(read(base,field)!==read(current,field)&&currentChanged.includes(field)){conflicts.push(field);if(resolution==='current')continue;}
    if(field==='brandName')project.name=draft.brandName.trim();else if(field==='version')project.releaseVersion=draft.version;else if(field==='steamAppId')project.platform.steamAppId=draft.steamAppId||null;else if(field==='brandIcon')project.display.icon=draft.brandIcon||null;
    else project.release={executableName:current.release?.executableName??'Game.exe',publisher:current.release?.publisher??'',windowsSigning:current.release?.windowsSigning??'unsigned',...project.release,[field]:draft[field]};
  }
  return {project,conflicts};
}
