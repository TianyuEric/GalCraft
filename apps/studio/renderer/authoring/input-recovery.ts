import type { Json, Project } from '@galcraft/contracts';
import type { PublishGuiDraft } from '../pages/Publish/Publish.js';
import { publishIdentityChanges } from '../pages/Publish/publish-identity.js';

type Input = { version?: number; unapplied?: boolean; otherUnapplied?: boolean; versions?: {documentId:string;revision:number}[]; scripts?: unknown[]; writing?: unknown[]; forms?: unknown[];
  designer?: {fieldInputs?:object;styleDrafts?:object;behaviorDrafts?:object;animation?:{draft?:unknown;baseline?:string}}; character?: {drafts?:object}; startup?:{buffers?:object;display?:unknown;displayPending?:boolean};
  language?:{draft?:unknown;baseline?:string;additional?:unknown};playerName?:{values?:unknown;baseline?:unknown};
  production?:{candidateText?:unknown[];connection?:{edit?:{parameters?:unknown}|null;baseline?:string;advanced?:string|null};gui?:{workflowDocuments?:unknown[];recipe?:unknown;uiProposal?:unknown};workflow?:{workflowDocuments?:unknown[]}};projectCreate?:{name?:string;template?:string;width?:number;height?:number};resourceProcessor?:unknown;publish?:PublishGuiDraft;retained?:Json|null };
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

const workspaceFields = new Set(['version','projectId','unapplied','otherUnapplied','recoveryReviewed','versions','scripts','writing','designer','publish','resourceProcessor','character','startup','language','playerName','production','projectCreate','documents','active','page','sceneId','view','forms','retained']);
const record = (value: unknown): value is Record<string, Json> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Call only after the renderer has retained this record's character inputs by identity. */
export function withoutRecoveredCharacterInput(value: Json, project: Project): Json | null {
  if (!record(value) || value.version !== 1 || !record(value.character) || !record(value.character.drafts)
    || !Array.isArray(value.versions) || !value.versions.every(item => record(item) && typeof item.documentId === 'string' && typeof item.revision === 'number' && Number.isInteger(item.revision) && item.revision >= 0)
    || Object.keys(value).some(key => !workspaceFields.has(key))) return value;
  for (const key of ['scripts','writing','forms','documents']) if (value[key] != null && !Array.isArray(value[key])) return value;
  for (const key of ['designer','publish','resourceProcessor','startup','language','playerName','production','projectCreate'])
    if (value[key] != null && !record(value[key])) return value;
  const production = record(value.production) ? value.production : null, designerState = record(value.designer) ? value.designer : null;
  const shapes: [unknown, readonly string[]][] = [
    [value.designer, ['previewLocale','page','selected','state','sample','zoom','styleDrafts','styleDraftOptions','pageContexts','auxiliaryDocument','animation','fieldInputs','behaviorDrafts']],
    [value.startup, ['display','displayPending','buffers','tab']], [value.language, ['draft','baseline','additional']],
    [value.playerName, ['values','baseline','numberDraft']], [value.production, ['gui','connection','workflow','candidateText']],
    [value.publish, ['identityBase','target','mobile','output','fontMode','fallbackAssetId','keepAssets','steamAppId','steamRequired','live2dPurpose','live2dLicenseConfirmed','entryMappings','version','brandName','executableName','publisher','brandIcon','windowsSigning','certificate']],
    [value.projectCreate, ['name','template','width','height','engineVersion']],
    [production?.gui, ['tab','recipe','recipeBaseline','uiProposal','uiSource','uiBaseline','workflowDocuments','activeWorkflow','search']],
    [production?.connection, ['edit','provider','advanced','baseline','selection']],
    [production?.workflow, ['workflowDocuments','activeWorkflow','search']],
    [designerState?.animation, ['target','selected','draft','baseline','shared']],
  ];
  if (shapes.some(([state, keys]) => state != null && (!record(state) || Object.keys(state).some(key => !keys.includes(key))))) return value;
  const { character: _character, unapplied: _unapplied, otherUnapplied: _otherUnapplied, ...remaining } = value;
  const processor = remaining.resourceProcessor;
  if (record(processor) && Object.keys(processor).length === 4
    && Object.keys(processor).every(key => ['processorKey','settings','open','inputSelection'].includes(key))
    && processor.processorKey === '' && processor.open === false && record(processor.settings) && count(processor.settings) === 0
    && Array.isArray(processor.inputSelection) && processor.inputSelection.length === 0) remaining.resourceProcessor = null;
  const draft = input(remaining), designer = draft.designer, startup = draft.startup, creating = draft.projectCreate;
  const pending = otherInputs(draft) || !!count(designer?.behaviorDrafts)
    || !!designer?.animation && JSON.stringify(designer.animation.draft) !== designer.animation.baseline
    || !!startup && startup.displayPending !== false && startup.display !== undefined && JSON.stringify(startup.display) !== JSON.stringify(project.display)
    || !!draft.production?.workflow?.workflowDocuments?.length
    || !!creating && (!!creating.name || creating.template !== undefined && creating.template !== 'standard'
      || creating.width !== undefined && creating.width !== 1920 || creating.height !== undefined && creating.height !== 1080);
  const next: Json = { ...remaining, otherUnapplied: pending,
    unapplied: pending || !!draft.publish && publishIdentityChanges(draft.publish, project).length > 0 };
  // Nested retained records have not been recovered by the caller.
  return workspaceInputHasChanges(next, project) ? next : draft.retained ?? null;
}
