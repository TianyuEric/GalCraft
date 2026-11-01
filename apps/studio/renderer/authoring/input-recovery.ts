import type { Json, Project } from '@galcraft/contracts';
import type { PublishGuiDraft } from '../pages/Publish/Publish.js';
import { publishIdentityChanges } from '../pages/Publish/publish-identity.js';

type Input = { version?: number; unapplied?: boolean; otherUnapplied?: boolean; versions?: {documentId:string;revision:number}[]; scripts?: unknown[]; writing?: unknown[]; forms?: unknown[];
  designer?: {fieldInputs?:object;styleDrafts?:object}; character?: {drafts?:object}; startup?:{buffers?:object};
  language?:{draft?:unknown;baseline?:string;additional?:unknown};playerName?:{values?:unknown;baseline?:unknown};
  production?:{candidateText?:unknown[];connection?:{edit?:{parameters?:unknown}|null;baseline?:string;advanced?:string|null};gui?:{workflowDocuments?:unknown[];recipe?:unknown;uiProposal?:unknown}};resourceProcessor?:unknown;publish?:PublishGuiDraft;retained?:Json|null };
const input = (value: Json): Input => value as unknown as Input;
const count = (value?: object) => Object.keys(value ?? {}).length;
function otherInputs(value: Input) {
  const connection=value.production?.connection;
  const connectionDirty=!!connection?.edit&&(JSON.stringify(connection.edit)!==connection.baseline||connection.advanced!=null&&connection.advanced!==JSON.stringify(connection.edit.parameters,null,2));
  return !!(value.otherUnapplied || value.scripts?.length || value.writing?.length || value.forms?.length || count(value.designer?.fieldInputs) || count(value.designer?.styleDrafts)
    || count(value.character?.drafts) || count(value.startup?.buffers) || value.language && (JSON.stringify(value.language.draft) !== value.language.baseline || value.language.additional)
    || value.playerName && JSON.stringify(value.playerName.values) !== JSON.stringify(value.playerName.baseline) || value.production?.candidateText?.length
    || value.production?.gui?.workflowDocuments?.length || value.production?.gui?.recipe || value.production?.gui?.uiProposal || connectionDirty || value.resourceProcessor);
}
/** Workspace navigation and local release choices can survive unrelated document revisions. */
export function workspaceInputHasChanges(value: Json, project: Project): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const draft = input(value);
  if (draft.version !== 1) return true;
  if (draft.unapplied === false) return false;
  return otherInputs(draft) || !!draft.publish && publishIdentityChanges(draft.publish, project).length > 0;
}
export function workspaceInputVersionsMatch(value: Json, project: Project, projectDocumentId: string, versions: Map<string, number>): boolean {
  if (!workspaceInputHasChanges(value, project)) return true;
  const draft = input(value);
  const scope = !otherInputs(draft) && draft.publish ? draft.versions?.filter(item => item.documentId === projectDocumentId) : draft.versions;
  return !!scope?.length && scope.every(item => versions.get(item.documentId) === item.revision);
}
/** Remove exhausted recovery wrappers while retaining every actual pending input. */
export function retainedWorkspaceInput(value: Json | null | undefined, project: Project): Json | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const draft = input(value), retained = retainedWorkspaceInput(draft.retained, project);
  return workspaceInputHasChanges(value, project) ? { ...value, retained } : retained;
}
