import { z } from 'zod';
import { AuthoringOutlineSchema, DialogueContentSchema, DialogueEventSchema, EffectPatchSchema, CharacterDifferenceSchema, CharacterSchema, IdSchema, JsonSchema, LockSchema, ProjectSchema, RevisionSchema, SceneSchema, VariableSchema, createId, dialogueAnchorOffsets, dialoguePlainText, dialogueSegments, hasSceneParameterDefault, normalizeCharacterAuthoringData, normalizeProjectAuthoringData, round5AssetBindings, sliceDialogueContent, stageCommandAssetBindings } from '@galcraft/contracts';
import type { Asset, CommandSpec, DialogueContent, DialogueEvent, GalleryEntry, Character, DocumentView, EditInput, Id, Issue, Json, Project, Ref, Result, Scene, Variable } from '@galcraft/contracts';
import { applyTextEdits, validateAuthoringCommands, presentationArgs, dialogueInterpolations, parseExpression, variableReads, commandOwnedIds, parse, patchFields, resolveStaticStageImage, rewriteScriptReferences, toDocumentPatch } from '@galcraft/dsl';
import type { FieldPatchInput, ParseResult, TextEdit } from '@galcraft/dsl';
import { characterDifferenceDependencies, characterEdit, neutralCharacter } from './characters.js';
import { createWorkbenchChapter, moveWorkbenchObjects, renameWorkbenchObject } from './structure.js';
import { invalidSceneEdit } from './scene-sources.js';
export * from './characters.js';
export * from './structure.js';

const name = z.string().trim().min(1), index = z.number().int().nonnegative().optional();
const characterFields = CharacterSchema.omit({ id: true }).partial().extend({
  appearance:CharacterSchema.shape.appearance.partial().optional(),defaultEffects:EffectPatchSchema.optional(),
  personalRoute:CharacterSchema.shape.personalRoute.unwrap().partial().optional(),
});
const projectFields = ProjectSchema.pick({ name: true, description: true, releaseVersion: true, dynamicAssets: true }).partial().extend({
  release: ProjectSchema.shape.release.unwrap().partial().optional(), canvas: ProjectSchema.shape.canvas.partial().optional(),
  display: ProjectSchema.shape.display.partial().optional(), languages: z.strictObject(ProjectSchema.shape.languages.shape).partial().extend({menus:ProjectSchema.shape.languages.shape.menus.unwrap().optional()}).optional(),
  player: ProjectSchema.shape.player.partial().extend({emergencyKey:ProjectSchema.shape.player.shape.emergencyKey.unwrap().optional()}).optional(), platform: ProjectSchema.shape.platform.partial().optional(),
});
const variableFields = z.strictObject(VariableSchema.shape).omit({ id: true }).partial();
const sceneFields = SceneSchema.pick({ name: true, presentation: true, decorLayers: true, parameters: true, locals: true, returns: true }).partial();
const definitions = [
  ['outline.set', 'Set the formal story outline and chapter summaries', z.strictObject({op:z.literal('outline.set'),outline:AuthoringOutlineSchema})],
  ['project.update', 'Update project settings', z.strictObject({ op: z.literal('project.update'), changes: projectFields })],
  ['project.entry', 'Set the story entry', z.strictObject({ op: z.literal('project.entry'), sceneId: IdSchema, labelId: IdSchema.nullable().default(null) })],
  ['chapter.create', 'Create an empty chapter', z.strictObject({ op: z.literal('chapter.create'), name, index })],
  ['chapter.rename', 'Rename a chapter', z.strictObject({ op: z.literal('chapter.rename'), id: IdSchema, name })],
  ['chapter.move', 'Reorder chapters', z.strictObject({ op: z.literal('chapter.move'), ids: z.array(IdSchema).min(1), index: z.number().int().nonnegative() })],
  ['chapter.remove', 'Remove a chapter after relocating its scenes', z.strictObject({ op: z.literal('chapter.remove'), id: IdSchema, destinationChapterId: IdSchema.optional() })],
  ['chapter.duplicate', 'Copy a chapter and rebuild its internal identities', z.strictObject({ op: z.literal('chapter.duplicate'), id: IdSchema, name })],
  ['scene.create', 'Create an empty scene', z.strictObject({ op: z.literal('scene.create'), chapterId: IdSchema, name, index })],
  ['scene.update', 'Edit a scene and its declarations', z.strictObject({ op: z.literal('scene.update'), id: IdSchema, changes: sceneFields })],
  ['scene.declarations', 'Set local variables, parameters and return type', z.strictObject({ op: z.literal('scene.declarations'), id: IdSchema, locals: z.array(z.strictObject({ id: IdSchema.optional(), name, type: z.enum(['number', 'boolean', 'string']), initial: z.union([z.number().finite(), z.boolean(), z.string()]), parameter: z.strictObject({ required: z.boolean(), defaultValue: z.union([z.number().finite(), z.boolean(), z.string()]).nullable().optional() }).optional() })), returns: z.enum(['void', 'number', 'boolean', 'string']) })],
  ['scene.move', 'Move scenes while keeping their identities', z.strictObject({ op: z.literal('scene.move'), ids: z.array(IdSchema).min(1), chapterId: IdSchema, index })],
  ['scene.duplicate', 'Copy a scene and rebuild internal identities', z.strictObject({ op: z.literal('scene.duplicate'), id: IdSchema, chapterId: IdSchema.optional(), name })],
  ['scene.remove', 'Remove a scene with an explicit reference replacement', z.strictObject({ op: z.literal('scene.remove'), id: IdSchema, replacementId: IdSchema.optional() })],
  ['character.create', 'Create a character with author defaults', z.strictObject({ op: z.literal('character.create'), name, changes: characterFields.optional() })],
  ['character.update', 'Change selected character fields', z.strictObject({ op: z.literal('character.update'), id: IdSchema, changes: characterFields })],
  ['character.remove', 'Remove a character with an explicit replacement', z.strictObject({ op: z.literal('character.remove'), id: IdSchema, replacementId: IdSchema.optional() })],
  ['character.group.create', 'Create an independently identified character asset group', z.strictObject({op:z.literal('character.group.create'),characterId:IdSchema,name,assetIds:z.array(IdSchema).default([])})],
  ['character.group.update', 'Edit selected character asset group fields', z.strictObject({op:z.literal('character.group.update'),characterId:IdSchema,id:IdSchema,changes:z.strictObject({name:name.optional(),assetIds:z.array(IdSchema).optional()})})],
  ['character.group.remove', 'Remove an organizing group while retaining its assets', z.strictObject({op:z.literal('character.group.remove'),characterId:IdSchema,id:IdSchema})],
  ['character.difference.create', 'Create a shared figure and portrait difference', z.strictObject({op:z.literal('character.difference.create'),characterId:IdSchema,name,figure:CharacterDifferenceSchema.shape.figure,avatar:CharacterDifferenceSchema.shape.avatar.default(null),initial:z.boolean().default(false)})],
  ['character.difference.update', 'Edit selected shared difference fields', z.strictObject({op:z.literal('character.difference.update'),characterId:IdSchema,id:IdSchema,changes:CharacterDifferenceSchema.omit({id:true}).partial()})],
  ['character.difference.remove', 'Remove a difference with explicit consumer replacement', z.strictObject({op:z.literal('character.difference.remove'),characterId:IdSchema,id:IdSchema,replacementId:IdSchema.optional()})],
  ['variable.create', 'Create a typed progress or long-term variable', z.strictObject({ op: z.literal('variable.create'), name, type: z.enum(['number', 'boolean', 'string']), scope: z.enum(['progress', 'longTerm']), initial: z.union([z.number().finite(), z.boolean(), z.string()]) })],
  ['variable.update', 'Edit a variable; referenced types and scopes stay stable', z.strictObject({ op: z.literal('variable.update'), id: IdSchema, changes: variableFields })],
  ['variable.remove', 'Remove an unreferenced variable', z.strictObject({ op: z.literal('variable.remove'), id: IdSchema })],
  ['variable.replace', 'Replace variable references with an existing variable', z.strictObject({ op: z.literal('variable.replace'), id: IdSchema, replacementId: IdSchema, parameterArguments: z.literal('remove').optional() })],
  ['dialogue.update', 'Edit dialogue body or its anchored events', z.strictObject({ op: z.literal('dialogue.update'), sceneId: IdSchema, statementId: IdSchema, text: DialogueContentSchema.optional(), events: z.array(DialogueEventSchema).optional() })],
  ['dialogue.split', 'Split a dialogue at a decoded text boundary', z.strictObject({ op: z.literal('dialogue.split'), sceneId: IdSchema, statementId: IdSchema, offset: RevisionSchema })],
  ['dialogue.merge', 'Merge an adjacent dialogue into the preceding dialogue', z.strictObject({ op: z.literal('dialogue.merge'), sceneId: IdSchema, statementId: IdSchema, nextStatementId: IdSchema })],
  ['commands.insert', 'Insert script commands with generated statement identities', z.strictObject({ op: z.literal('commands.insert'), sceneId: IdSchema, beforeId: IdSchema.nullable().default(null), commands: z.array(z.strictObject({ command: z.string().min(1), args: z.record(z.string(), JsonSchema) })).min(1) })],
  ['commands.fields', 'Change selected command fields', z.strictObject({ op: z.literal('commands.fields'), sceneId: IdSchema, ids: z.array(IdSchema).min(1), changes: z.array(z.strictObject({ field: z.string().min(1), op: z.enum(['set', 'inherit']), value: JsonSchema })).min(1) })],
  ['commands.duplicate', 'Copy commands and rebuild internal identities', z.strictObject({ op: z.literal('commands.duplicate'), sceneId: IdSchema, ids: z.array(IdSchema).min(1), beforeId: IdSchema.nullable().default(null) })],
  ['commands.remove', 'Remove selected commands after resolving references', z.strictObject({ op: z.literal('commands.remove'), sceneId: IdSchema, ids: z.array(IdSchema).min(1) })],
  ['commands.move', 'Reorder or move commands across scenes', z.strictObject({ op: z.literal('commands.move'), sceneId: IdSchema, ids: z.array(IdSchema).min(1), targetSceneId: IdSchema, beforeId: IdSchema.nullable().default(null) })],
] as const;
export const AuthorOperationDefinitions = definitions.map(([key, title, schema]) => ({ key, title, description: title, schema }));
export const AuthorOperationSchema = z.discriminatedUnion('op', [definitions[0][2], ...definitions.slice(1).map(value => value[2])]);
export type AuthorOperation = z.infer<typeof AuthorOperationSchema>;
type DataFile = { document: DocumentView; path: string; data: Record<string, unknown> };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const fail = (code: string, message: string): Result<never> => { const error: Issue = { code, message, severity: 'error', owner: 'M02', related: [], actions: ['edit', 'compare'] }; return { ok: false, error, issues: [error] }; };
class InvalidSceneSource extends Error {
  constructor(readonly diagnostic: Issue) { super(diagnostic.message); }
}
class InvalidAuthoringCommand extends Error {
  constructor(readonly issues: Issue[]) { super(issues[0]?.message); }
}
function requireValidSceneSource(source: ParseResult): ParseResult {
  const error = source.issues.find(issue => issue.severity === 'error');
  if (error) throw new InvalidSceneSource(error);
  return source;
}
function files(documents: DocumentView[]): DataFile[] {
  return documents.flatMap(document => Object.entries(document.files).flatMap(([path, raw]) => {
    if (!path.endsWith('.json')) return [];
    try { const data = JSON.parse(raw).data; return record(data) ? [{ document, path, data }] : []; } catch { return []; }
  }));
}
function required<T>(value: T | undefined, description: string): T { if (value === undefined) throw new Error(`${description} is unavailable; reread the current project`); return value; }
function refKey(key: string, parent: Record<string, unknown>): boolean {
  return /(?:Id|Ids)$/.test(key) || ['assets', 'referenceAssets', 'avatar', 'cover', 'dynamicAssets'].includes(key) || key === 'id' && ['variable', 'character', 'scene', 'label', 'asset', 'statement', 'object'].includes(String(parent.kind));
}
function references(value: unknown, id: string, path = '', key = '', parent: Record<string, unknown> = {}): string[] {
  if (typeof value === 'string') {
    if (value === id && refKey(key,parent)) return [path];
    if (key==='text') for (const match of dialogueInterpolations(value)) {
      if(match.source===null||!match.closed)continue;
      const expression=parseExpression(match.source);if(expression.ok&&variableReads(expression.expr).some(reference=>reference.id===id))return [path];
    }
    return [];
  }
  if (Array.isArray(value)) return value.flatMap((entry, i) => references(entry, id, `${path}/${i}`, key, parent));
  if (!record(value)) return [];
  if(value.schemaVersion===1&&record(value.source)&&record(value.identities)&&record(value.sourceFiles))return Object.entries(value).filter(([field])=>!['source','sourceFiles','identities'].includes(field)).flatMap(([field,entry])=>references(entry,id,`${path}/${field}`,field,value));
  return Object.entries(value).flatMap(([field, entry]) => [...(field === id ? [`${path}/${field}`] : []), ...references(entry, id, `${path}/${field}`, field, value)]);
}
function remap(value: unknown, mapping: Record<string, string>, key = '', parent: Record<string, unknown> = {}, identities = false, scopes:Record<Id,'progress'|'local'|'longTerm'>={}): unknown {
  if (typeof value === 'string') return mapping[value] && (identities || refKey(key, parent)) ? mapping[value] : value;
  if (Array.isArray(value)) return value.map(entry => remap(entry, mapping, key, parent, identities,scopes));
  if (!record(value)) return value;
  if(value.schemaVersion===1&&record(value.source)&&record(value.identities)&&record(value.sourceFiles))return {...value,identities:Object.fromEntries(Object.entries(value.identities).map(([sourceId,instanceId])=>[sourceId,typeof instanceId==='string'?mapping[instanceId]??instanceId:instanceId])),...Object.fromEntries(Object.entries(value).filter(([field])=>!['source','sourceFiles','identities'].includes(field)).map(([field,entry])=>[field,remap(entry,mapping,field,value,identities,scopes)]))};
  const result=Object.fromEntries(Object.entries(value).map(([field, entry]) => [mapping[field] ?? field, remap(entry, mapping, field, value, identities || field === 'id',scopes)]));
  const variableId=value.kind==='variable'?value.id:value.variableId;if(typeof variableId==='string'&&scopes[variableId]&&'scope'in value){result.scope=scopes[variableId];if('declaringSceneId'in value&&scopes[variableId]!=='local')result.declaringSceneId=null;}return result;
}
export type AuthoringReference = { documentId: Id; revision: number; path: string; field: string; statementId?: Id };
export function authoringReferences(documents: DocumentView[], target: Ref): AuthoringReference[] {
  return documents.flatMap(document => Object.entries(document.files).flatMap(([path, raw]) => {
    if (path.endsWith('.gal')) return parse({ documentId: document.documentId, revision: document.revision, text: raw }).cst.flatMap(node => references(node.object?.value, target.id).map(field => ({ documentId: document.documentId, revision: document.revision, path, field, ...(node.id ? { statementId: node.id } : {}) })));
    if (!path.endsWith('.json')) return [];
    try { return references(JSON.parse(raw).data, target.id).map(field => ({ documentId: document.documentId, revision: document.revision, path, field })); } catch { return []; }
  }));
}
function declaredIds(parsed: ParseResult, selected: Id[], allocate: () => Id): Record<Id, Id> {
  const mapping: Record<Id, Id> = {};
  for (const node of parsed.cst.filter(node => node.id && selected.includes(node.id))) {
    mapping[node.id!] = allocate();
    const args = node.object?.value as Record<string, unknown> | undefined;
    if (!args) continue;
    for (const id of commandOwnedIds(node.command,args)) mapping[id] ??= allocate();
  }
  return mapping;
}

/** Rebase a form's changed fields against current content, preserving its original basis. */
export function rebaseAuthoringOperation(baseline: DocumentView[], current: DocumentView[], operation: AuthorOperation, resolution?: 'draft'|'current'): { operation: AuthorOperation; conflicts: string[] } {
  if(operation.op!=='project.update'&&operation.op!=='scene.update'&&operation.op!=='character.update'&&operation.op!=='variable.update')return {operation,conflicts:[]};
  const path=operation.op==='project.update'?'project.json':operation.op==='scene.update'?`scenes/${operation.id}/scene.json`:operation.op==='character.update'?`characters/${operation.id}.json`:`variables/${operation.id}.json`;
  const before=files(baseline).find(file=>file.path===path)?.data,latest=files(current).find(file=>file.path===path)?.data, conflicts:string[]=[];
  if(!before||!latest)return {operation,conflicts:[path]};
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  const merge=(old:unknown,entered:unknown,now:unknown,path:string):unknown=>{
    if(same(old,entered))return undefined;
    if(record(entered)&&record(old)&&record(now))return Object.fromEntries(Object.entries(entered).flatMap(([key,value])=>{const result=merge(old[key],value,now[key],path?`${path}.${key}`:key);return result===undefined?[]:[[key,result]];}));
    if(!same(old,now)&&!same(entered,now)){conflicts.push(path);if(resolution==='current')return undefined;}
    return entered;
  };
  return {operation:{...operation,changes:merge(before,operation.changes,latest,'')} as AuthorOperation,conflicts};
}

/** All operations produce an ordinary M02 transaction. No state is applied here. */
export function prepareAuthoringEdit(documents: DocumentView[], raw: AuthorOperation, pluginCommands: CommandSpec[] = []): Result<EditInput> {
  const checked = AuthorOperationSchema.safeParse(raw);
  if (!checked.success) return fail('AUTHOR_INPUT', checked.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  const operation = checked.data, dataFiles = files(documents), projectFile = dataFiles.find(file => file.path === 'project.json');
  if (!projectFile) return fail('PROJECT_MISSING', 'Project document is unavailable');
  try {
    const project = ProjectSchema.parse(normalizeProjectAuthoringData(projectFile.data));
    const structure = { projectDocumentId: projectFile.document.documentId, projectRevision: projectFile.document.revision, project,
      scenes: dataFiles.filter(file => /\/scene.json$/.test(file.path)).map(file => { const scene = SceneSchema.parse(file.data); return { sceneId: scene.id, documentId: file.document.documentId, revision: file.document.revision, name: scene.name, chapterId: scene.chapterId }; }) };
    if (operation.op === 'chapter.create' && operation.index === undefined || operation.op === 'chapter.rename' || operation.op === 'scene.move') {
      const planned = operation.op === 'chapter.create' ? createWorkbenchChapter(structure, operation.name) : operation.op === 'chapter.rename' ? renameWorkbenchObject(structure, operation.id, operation.name) : moveWorkbenchObjects(structure, operation.ids, operation.chapterId, operation.index);
      if (typeof planned === 'string') return fail('AUTHOR_EDIT', planned); if (!planned) return fail('NO_CHANGE', 'The requested structure is already current'); return { ok: true, value: planned, warnings: [] };
    }
    const edit: EditInput = { label: required(AuthorOperationDefinitions.find(item => item.key === operation.op), 'Operation').title, origin: 'field', expected: [], patches: [], preparedAssets: [], requiredRefs: [] };
    const allocate = () => createId([documents, edit]);
    const touch = (document: DocumentView) => { if (!edit.expected.some(item => item.ref.id === document.documentId)) edit.expected.push({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }); };
    const change = (file: DataFile, next: unknown) => { touch(file.document); edit.patches.push({ kind: 'json', documentId: file.document.documentId, changes: [{ path: '/data', before: file.data as Json, after: JSON.parse(JSON.stringify(next)), op: 'set' }] }); };
    const changeProject = () => change(projectFile, ProjectSchema.parse(project));
    const create = (path: string, data: unknown, script?: string) => { const documentId = allocate(); edit.patches.push({ kind: 'document', documentId, op: 'create', before: null, after: { format: script === undefined ? 'json' : 'dsl', files: { [path]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n', ...(script === undefined ? {} : { [path.replace(/scene\.json$/, 'script.gal')]: script }) } } }); };
    const remove = (file: DataFile) => { touch(file.document); edit.patches.push({ kind: 'document', documentId: file.document.documentId, op: 'delete', before: { format: file.document.format, files: file.document.files }, after: null }); };
    const sceneFile = (id: Id) => required(dataFiles.find(file => file.path === `scenes/${id}/scene.json`), `Scene ${id}`);
    const assetIndex = dataFiles.find(file => file.path === 'assets/index.json');
    const lockFile = dataFiles.find(file => file.path === 'dependencies.lock.json');
    const assets = (assetIndex?.data.assets ?? []) as Asset[];
    const requireRef = (ref: Ref) => { if (!edit.requiredRefs.some(item => item.kind === ref.kind && item.id === ref.id)) edit.requiredRefs.push(ref); };
    const readScene = (id: Id) => SceneSchema.parse(sceneFile(id).data);
    const chapter = (id: Id) => required(project.chapters.find(chapter => chapter.id === id), `Chapter ${id}`);
    const script = (file: DataFile) => required(Object.entries(file.document.files).find(([path]) => path.endsWith('/script.gal'))?.[1], 'Scene script');
    const parsed = (file: DataFile) => requireValidSceneSource(parse({ documentId: file.document.documentId, revision: file.document.revision, text: script(file) }));
    const validateCommands = (file: DataFile, before: ParseResult, after: string, ids: Id[], inserting = false, movedFrom?: { documentId: Id; text: string }) => {
      const context = { engineVersion: project.engineVersion, project, lock: LockSchema.safeParse(lockFile?.data).data, pluginCommands,
        scenes: dataFiles.filter(file => /\/scene.json$/.test(file.path)).map(file => SceneSchema.parse(file.data)),
        characters: dataFiles.filter(file => /^characters\//.test(file.path)).map(file => CharacterSchema.parse(normalizeCharacterAuthoringData(file.data))),
        variables: dataFiles.filter(file => /^variables\//.test(file.path)).map(file => VariableSchema.parse(file.data)),
        assets,
        gallery: dataFiles.filter(file => /^gallery\//.test(file.path)).flatMap(file => Array.isArray(file.data.entries) ? file.data.entries : [file.data]) as GalleryEntry[],
        documents: dataFiles.filter(file => /\/scene.json$/.test(file.path)).map(file => ({ documentId: file.document.documentId, revision: file.document.revision, kind: 'scene', sceneId: String(file.data.id),
          text: movedFrom?.documentId === file.document.documentId ? movedFrom.text : script(file) })) };
      const signature = (issue: Issue) => `${issue.code}:${issue.source?.statementId ?? ''}:${issue.source?.eventId ?? ''}:${issue.source?.field ?? ''}:${issue.message}`;
      const existing = new Set(inserting ? [] : validateAuthoringCommands(before, ids, readScene(String(file.data.id)), context).map(signature));
      const next = parse({ documentId: before.documentId, revision: before.revision, text: after });
      const issues = validateAuthoringCommands(next, ids, readScene(String(file.data.id)), context)
        .filter(issue => (issue.severity === 'error' || issue.code === 'FIELD_UNKNOWN') && issue.code !== 'TEXT_EMPTY' && !existing.has(signature(issue)));
      if (issues.length) throw new InvalidAuthoringCommand(issues);
      const changed = next.statements.filter(node => node.id && ids.includes(node.id));
      for (const node of changed) {
        const bindings = stageCommandAssetBindings(node.command, node.args);
        if (!bindings.length) continue;
        if (assetIndex) touch(assetIndex.document);
        for (const binding of bindings) {
          requireRef({ kind: 'asset', id: binding.assetId });
          if (binding.variantId) requireRef({ kind: 'variant', id: binding.variantId });
        }
        if (node.command === 'changeScene' && typeof node.args.sceneId === 'string') {
          touch(projectFile.document);
          touch(sceneFile(node.args.sceneId).document);
          requireRef({ kind: 'scene', id: node.args.sceneId });
          if (typeof node.args.labelId === 'string') requireRef({ kind: 'label', id: node.args.labelId });
        }
      }
      const events = changed.filter(node => node.command === 'say').flatMap(node => z.array(DialogueEventSchema).safeParse(node.args.events).data ?? []);
      if (!events.length) return;
      const owners = context.documents.filter(doc => doc.documentId !== next.documentId).map(doc => parse(doc));
      for (const event of events) {
        for (const owner of owners) {
          const found = owner.statements.some(node => node.command === 'say' && commandOwnedIds(node.command, node.args).includes(event.id));
          if (found) throw new Error(`IDENTITY_IN_USE: ${event.id}`);
        }
        if (event.kind === 'wait') continue;
        if (assetIndex) touch(assetIndex.document);
        if (event.kind === 'live2dExpression') {
          if (lockFile) touch(lockFile.document);
          for (const doc of owners) if (doc.statements.some(node => ['changeFigure', 'changeIllustration'].includes(node.command) && node.args.objectId === event.objectId))
            touch(required(documents.find(item => item.documentId === doc.documentId), 'Live2D instance document'));
          requireRef({ kind: 'object', id: event.objectId });
        } else if (event.kind === 'expression') {
          const character = dataFiles.find(item => item.path === `characters/${event.characterId}.json`);
          if (character) touch(character.document);
          for (const doc of owners) if (doc.statements.some(node => node.command === 'changeFigure' && node.args.objectId === event.objectId))
            touch(required(documents.find(item => item.documentId === doc.documentId), 'Figure document'));
          requireRef({ kind: 'character', id: event.characterId });
          requireRef({ kind: 'object', id: event.objectId });
          requireRef({ kind: 'object', id: event.differenceId });
          const definition = context.characters.find(item => item.id === event.characterId)?.differences?.find(item => item.id === event.differenceId);
          if (definition) {
            requireRef({ kind: 'asset', id: definition.figure.assetId });
            if (definition.figure.variantId) requireRef({ kind: 'variant', id: definition.figure.variantId });
          }
        }
      }
    };
    const replaceReferences = (id: Id, replacementId: Id | undefined, removedFile: DataFile, ignored: (reference: AuthoringReference) => boolean = () => false) => {
      const refs = authoringReferences(documents, { kind: 'document', id }).filter(ref => ref.documentId !== removedFile.document.documentId && !ignored(ref));
      if (!replacementId && refs.length) throw new Error(`REFERENCE_IN_USE: resolve ${refs.map(ref => `${ref.path}${ref.field}`).join(', ')}`);
      if (!replacementId) return;
      if (replacementId === id) throw new Error('Replacement must have a different identity');
      const scopes:Record<Id,'progress'|'local'|'longTerm'>={};if(removedFile.path.startsWith('variables/'))scopes[id]=VariableSchema.parse(required(dataFiles.find(file=>file.path===`variables/${replacementId}.json`),'Replacement variable').data).scope;
      for (const file of dataFiles.filter(file => file.document.documentId !== removedFile.document.documentId)) {
        const next = remap(file.data, { [id]: replacementId },'',{},false,scopes); if (JSON.stringify(next) !== JSON.stringify(file.data)) {
          if (file.path === 'project.json') Object.assign(project, next); else change(file, next);
        }
      }
      for (const document of documents.filter(document => document.documentId !== removedFile.document.documentId)) for (const [path, text] of Object.entries(document.files)) if (path.endsWith('.gal')) {
        const source = parse({ documentId: document.documentId, revision: document.revision, text });
        if (!source.cst.some(node=>references(node.object?.value,id).length)) continue;
        requireValidSceneSource(source);
        const next = rewriteScriptReferences({documentId:document.documentId,revision:document.revision,text},{[id]:replacementId},project.engineVersion,pluginCommands,scopes);
        if (next !== text) { touch(document); edit.patches.push(toDocumentPatch(document.documentId,[{start:0,end:text.length,oldText:text,text:next}])); }
      }
    };
    const copyScenes = (ids: Id[], targetChapterId: Id, sceneNames?: Record<Id, string>) => {
      const mapping: Record<Id, Id> = {}, sources = ids.map(id => ({ file: sceneFile(id), scene: readScene(id) }));
      for (const source of sources) {
        touch(source.file.document);
        mapping[source.scene.id] = allocate();
        for (const variable of source.scene.locals) mapping[variable.id] = allocate();
        const sourceParse = parsed(source.file); Object.assign(mapping, declaredIds(sourceParse, sourceParse.cst.flatMap(node => node.id ? [node.id] : []), allocate));
      }
      for (const { file, scene } of sources) {
        const source = parsed(file), copied = rewriteScriptReferences({documentId:source.documentId,revision:source.revision,text:source.text},mapping,project.engineVersion,pluginCommands);
        const next = remap(scene, mapping, '', {}, true) as Scene; next.chapterId = targetChapterId; next.name = sceneNames?.[scene.id] ?? scene.name;
        if (scene.decorLayers) next.decorLayers = scene.decorLayers.map(layer => ({ ...layer, id: allocate() }));
        create(`scenes/${next.id}/scene.json`, SceneSchema.parse(next), copied);
      }
      return ids.map(id => mapping[id]!);
    };
    switch (operation.op) {
      case 'outline.set': { const file=dataFiles.find(file=>file.path==='authoring/outline.json');if(file)change(file,operation.outline);else create('authoring/outline.json',operation.outline);break; }
      case 'project.update': {
        for (const [key, value] of Object.entries(operation.changes)) {
          const target = project as unknown as Record<string, unknown>;
          const previous=key==='release'?(target[key]??{executableName:'Game.exe',publisher:'',windowsSigning:'unsigned'}):target[key];
          target[key] = record(value) && record(previous) ? { ...previous, ...value } : value;
        }
        changeProject(); break;
      }
      case 'project.entry': {
        const file = sceneFile(operation.sceneId);
        if (operation.labelId && !parsed(file).cst.some(node => node.command === 'label' && (node.object?.value as { labelId?: string })?.labelId === operation.labelId)) throw new Error('Entry label is unavailable in the selected scene');
        project.entry = { sceneId: operation.sceneId, labelId: operation.labelId }; changeProject(); break;
      }
      case 'chapter.create': {
        if (project.chapters.some(item => item.name === operation.name)) throw new Error('Chapter name already exists');
        project.chapters.splice(operation.index ?? project.chapters.length, 0, { id: allocate(), name: operation.name, sceneIds: [] }); changeProject(); break;
      }
      case 'chapter.move': {
        const selected = operation.ids.map(chapter); project.chapters = project.chapters.filter(item => !operation.ids.includes(item.id)); project.chapters.splice(operation.index, 0, ...selected); changeProject(); break;
      }
      case 'chapter.remove': {
        const source = chapter(operation.id);
        if (source.sceneIds.length) {
          if (!operation.destinationChapterId || operation.destinationChapterId === source.id) throw new Error('A nonempty chapter needs a different destination chapter');
          const target = chapter(operation.destinationChapterId); target.sceneIds.push(...source.sceneIds);
          for (const id of source.sceneIds) { const file = sceneFile(id); change(file, { ...file.data, chapterId: target.id }); }
        }
        project.chapters = project.chapters.filter(item => item.id !== source.id); changeProject(); break;
      }
      case 'chapter.duplicate': {
        const source = chapter(operation.id); if (project.chapters.some(item => item.name === operation.name)) throw new Error('Chapter name already exists');
        const id = allocate(), copied = { ...structuredClone(source), id, name: operation.name, sceneIds: copyScenes(source.sceneIds, id) };
        project.chapters.splice(project.chapters.indexOf(source) + 1, 0, copied); changeProject(); break;
      }
      case 'scene.create': {
        const target = chapter(operation.chapterId), id = allocate();
        if (target.sceneIds.some(id => readScene(id).name === operation.name)) throw new Error('Scene name already exists in this chapter');
        target.sceneIds.splice(operation.index ?? target.sceneIds.length, 0, id);
        create(`scenes/${id}/scene.json`, { id, name: operation.name, chapterId: target.id, parameters: [], locals: [], returns: 'void', script: 'script.gal' }, ''); changeProject(); break;
      }
      case 'scene.update': case 'scene.declarations': {
        const file = sceneFile(operation.id);
        const locals = operation.op === 'scene.declarations' ? operation.locals.map(local => ({ id: local.id ?? allocate(), name: local.name, type: local.type, scope: 'local' as const, initial: local.initial })) : undefined;
        const changes = operation.op === 'scene.declarations' ? { locals, parameters: operation.locals.flatMap((local, i) => local.parameter ? [{ variableId: locals![i]!.id, required: local.parameter.required, defaultValue: local.parameter.defaultValue ?? null }] : []), returns: operation.returns } : operation.changes;
        const next = SceneSchema.parse({ ...file.data, ...changes });
        if (operation.op === 'scene.update' && operation.changes.presentation) {
          const bindings = round5AssetBindings({ scene: next }).filter(binding => binding.field.startsWith('/data/presentation/'));
          for (const binding of bindings) {
            requireRef({ kind: 'asset', id: binding.assetId });
            if (binding.variantId) requireRef({ kind: 'variant', id: binding.variantId });
          }
          if (bindings.length && assetIndex) touch(assetIndex.document);
        }
        if (operation.op === 'scene.update' && operation.changes.decorLayers) {
          for (const [index, layer] of operation.changes.decorLayers.entries()) {
            const { variant, field } = resolveStaticStageImage(assets, layer.assetId, layer.variantId);
            if (!variant) {
              const source = { documentId: file.document.documentId, revision: file.document.revision,
                field: `/data/decorLayers/${index}/${field}` };
              throw new InvalidAuthoringCommand([{ code: 'DECOR_IMAGE', message: 'Choose an available static image and version for this decor layer',
                severity: 'error', owner: 'M02', source, related: [], actions: ['edit', 'locate'] }]);
            }
            requireRef({ kind: 'asset', id: layer.assetId });
            if (layer.variantId) requireRef({ kind: 'variant', id: layer.variantId });
          }
          if (operation.changes.decorLayers.length && assetIndex) touch(assetIndex.document);
        }
        for (const parameter of next.parameters) {
          const local = next.locals.find(local => local.id === parameter.variableId);
          if (!local || local.scope !== 'local') throw new Error('Each parameter must reference a local variable declared in this scene');
          if (parameter.defaultValue !== null && !hasSceneParameterDefault(parameter, local)) throw new Error('Parameter default must match its declared type and be finite');
        }
        if (new Set(next.locals.map(item => item.id)).size !== next.locals.length || next.locals.some(item => item.scope !== 'local')) throw new Error('Scene locals need unique identities and local scope');
        if (new Set(next.parameters.map(item => item.variableId)).size !== next.parameters.length) throw new Error('Parameter declarations must be unique');
        change(file, next); break;
      }
      case 'scene.duplicate': {
        const scene = readScene(operation.id), target = chapter(operation.chapterId ?? scene.chapterId);
        if (target.sceneIds.some(id => readScene(id).name === operation.name)) throw new Error('Scene name already exists in this chapter');
        target.sceneIds.push(...copyScenes([scene.id], target.id, { [scene.id]: operation.name })); changeProject(); break;
      }
      case 'scene.remove': {
        const file = sceneFile(operation.id); if (operation.replacementId) readScene(operation.replacementId);
        const ownedLabels = [...readScene(operation.id).locals.map(local=>local.id),...parsed(file).cst.filter(node=>node.valid).flatMap(node=>[node.id!,...commandOwnedIds(node.command,node.object!.value as Record<string,unknown>)])];
        for (const id of ownedLabels) if (authoringReferences(documents,{kind:'label',id}).some(ref=>ref.documentId!==file.document.documentId)) throw new Error(`REFERENCE_IN_USE: resolve owned identity ${id} before removing its scene`);
        replaceReferences(operation.id, operation.replacementId, file, ref => ref.path === 'project.json' && /^\/chapters\/\d+\/sceneIds\//.test(ref.field));
        // Directory membership is removal, not a jump replacement.
        project.chapters = ProjectSchema.parse(normalizeProjectAuthoringData(projectFile.data)).chapters.map(item=>({...item,sceneIds:item.sceneIds.filter(id=>id!==operation.id)}));
        remove(file); changeProject(); break;
      }
      case 'character.create': case 'character.update': {
        const characters = dataFiles.filter(file => /^characters\//.test(file.path)).map(file => CharacterSchema.parse(normalizeCharacterAuthoringData(file.data)));
        const previous = operation.op === 'character.update' ? required(characters.find(item => item.id === operation.id), 'Character') : neutralCharacter(allocate(), operation.name, project, operation.changes?.narrativeRole);
        const merge=(base:unknown,patch:unknown):unknown=>record(base)&&record(patch)?{...base,...Object.fromEntries(Object.entries(patch).map(([key,value])=>[key,merge(base[key],value)]))}:patch;
        const changes={...operation.changes};
        if(changes.appearance)changes.appearance=merge(previous.appearance,changes.appearance) as Character['appearance'];
        if(changes.defaultEffects)changes.defaultEffects=merge(previous.defaultEffects,changes.defaultEffects) as Character['defaultEffects'];
        if(changes.personalRoute)changes.personalRoute=merge(previous.personalRoute??{sceneIds:[],endingIds:[]},changes.personalRoute) as NonNullable<Character['personalRoute']>;
        const next = CharacterSchema.parse({ ...previous, ...changes, ...(operation.op === 'character.create' ? { name: operation.name } : {}) });
        const result = characterEdit({ project, characters }, documents, [next]); edit.patches.push(...result.patches); edit.expected.push(...result.expected); edit.requiredRefs.push(...result.requiredRefs); break;
      }
      case 'character.remove': {
        const file = required(dataFiles.find(file => file.path === `characters/${operation.id}.json`), 'Character');
        if (operation.replacementId) required(dataFiles.find(file => file.path === `characters/${operation.replacementId}.json`), 'Replacement character');
        replaceReferences(operation.id, operation.replacementId, file); remove(file); if (JSON.stringify(project) !== JSON.stringify(projectFile.data)) changeProject(); break;
      }
      case 'character.group.create': case 'character.group.update': case 'character.group.remove':
      case 'character.difference.create': case 'character.difference.update': case 'character.difference.remove': {
        const file=required(dataFiles.find(file=>file.path===`characters/${operation.characterId}.json`),'Character'), character=CharacterSchema.parse(normalizeCharacterAuthoringData(file.data));
        const previous = operation.op === 'character.difference.create' || operation.op === 'character.difference.update' ? structuredClone(character) : undefined;
        if(operation.op==='character.group.create')character.groups.push({id:allocate(),name:operation.name,assetIds:operation.assetIds});
        else if(operation.op==='character.group.update'){const group=required(character.groups.find(item=>item.id===operation.id),'Character asset group');Object.assign(group,operation.changes);}
        else if(operation.op==='character.group.remove'){required(character.groups.find(item=>item.id===operation.id),'Character asset group');character.groups=character.groups.filter(item=>item.id!==operation.id);}
        else if(operation.op==='character.difference.create'){const id=allocate();(character.differences??=[]).push({id,name:operation.name,figure:operation.figure,avatar:operation.avatar});if(operation.initial||!character.initialDifferenceId)character.initialDifferenceId=id;}
        else if(operation.op==='character.difference.update'){const difference=required(character.differences?.find(item=>item.id===operation.id),'Character difference');Object.assign(difference,operation.changes);}
        else {
          required(character.differences?.find(item=>item.id===operation.id),'Character difference');
          if(operation.replacementId)required(character.differences?.find(item=>item.id===operation.replacementId),'Replacement difference');
          replaceReferences(operation.id,operation.replacementId,file);
          character.differences=character.differences!.filter(item=>item.id!==operation.id);
          if(character.initialDifferenceId===operation.id)character.initialDifferenceId=operation.replacementId??null;
        }
        if (previous) {
          const dependencies = characterDifferenceDependencies(documents, character, previous);
          edit.expected.push(...dependencies.expected);
          edit.requiredRefs.push(...dependencies.requiredRefs);
        }
        change(file,CharacterSchema.parse(character));if(JSON.stringify(project)!==JSON.stringify(projectFile.data))changeProject();break;
      }
      case 'variable.create': {
        const data = VariableSchema.parse({ id: allocate(), name: operation.name, type: operation.type, scope: operation.scope, initial: operation.initial }); create(`variables/${data.id}.json`, data); break;
      }
      case 'variable.update': {
        const file = required(dataFiles.find(file => file.path === `variables/${operation.id}.json`), 'Variable'), previous = VariableSchema.parse(file.data), next = VariableSchema.parse({ ...previous, ...operation.changes });
        if (next.scope === 'local') throw new Error('Declare local variables in scene.update');
        if ((previous.type !== next.type || previous.scope !== next.scope) && authoringReferences(documents, { kind: 'variable', id: operation.id }).length) throw new Error('Create a new variable and explicitly replace references before changing a referenced type or scope');
        change(file, next); break;
      }
      case 'variable.remove': case 'variable.replace': {
        const declarations=dataFiles.flatMap(file=>file.path.startsWith('variables/')?[{file,variable:VariableSchema.parse(file.data),sceneId:null as Id|null}]:/\/scene.json$/.test(file.path)?SceneSchema.parse(file.data).locals.map(variable=>({file,variable,sceneId:String(file.data.id)})):[]);
        const previous=required(declarations.find(item=>item.variable.id===operation.id),'Variable');
        if (previous.sceneId) parsed(previous.file);
        const target=operation.op==='variable.replace'?required(declarations.find(item=>item.variable.id===operation.replacementId),'Replacement variable'):undefined;
        if(target?.variable.id===operation.id)throw new Error('Replacement must have a different identity');
        const parameter=previous.sceneId?SceneSchema.parse(previous.file.data).parameters.some(item=>item.variableId===operation.id):false;
        if(parameter&&(operation.op!=='variable.replace'||operation.parameterArguments!=='remove'))throw new Error('PARAMETER_ARGUMENTS: replacing a parameter requires parameterArguments=remove to explicitly remove its caller arguments');
        const refs=authoringReferences(documents,{kind:'variable',id:operation.id}).filter(ref=>!(ref.documentId===previous.file.document.documentId&&/^\/parameters\//.test(ref.field)));
        if(!target&&refs.length)throw new Error(`REFERENCE_IN_USE: ${refs.map(ref=>ref.path+ref.field).join(', ')}`);
        if(target?.sceneId&&refs.some(ref=>ref.documentId!==target.file.document.documentId))throw new Error('LOCAL_SCOPE: every consumer of a local replacement must belong to its declaring scene');
        const mapping=target?{[operation.id]:target.variable.id}:{},scopes=target?{[operation.id]:target.variable.scope}:{};
        for(const file of dataFiles){
          if(!previous.sceneId&&file===previous.file){remove(file);continue;}
          let base=structuredClone(file.data);
          if(file===previous.file&&previous.sceneId){const scene=base as unknown as Scene;scene.locals=scene.locals.filter(item=>item.id!==operation.id);scene.parameters=scene.parameters.filter(item=>item.variableId!==operation.id);}
          const next=target?remap(base,mapping,'',{},false,scopes):base;
          if(JSON.stringify(next)!==JSON.stringify(file.data)){if(file===projectFile)Object.assign(project,next);else change(file,next);}
        }
        if(target)for(const document of documents)for(const [path,text]of Object.entries(document.files))if(path.endsWith('.gal')){
          let next=text;
          if(parameter){const source=parse({documentId:document.documentId,revision:document.revision,text});const changes=source.cst.filter(node=>node.valid&&node.command==='callScene'&&(node.object?.value as Record<string,unknown>)?.sceneId===previous.sceneId).flatMap(node=>{
            const args=node.object!.value as {parameters?:Record<string,Json>};if(!args.parameters||!Object.hasOwn(args.parameters,operation.id))return[];
            const parameters={...args.parameters};delete parameters[operation.id];const result=patchFields(source,{documentId:source.documentId,revision:source.revision,statementIds:[node.id!],changes:[{field:'parameters',op:'set',value:parameters}]});if(!result.ok)throw new Error(result.error.message);return result.value;
          });next=applyTextEdits(text,changes);}
          next=rewriteScriptReferences({documentId:document.documentId,revision:document.revision,text:next},mapping,project.engineVersion,pluginCommands,scopes);
          if(next!==text){requireValidSceneSource(parse({documentId:document.documentId,revision:document.revision,text}));touch(document);edit.patches.push(toDocumentPatch(document.documentId,[{start:0,end:text.length,oldText:text,text:next}]));}
        }
        if(JSON.stringify(project)!==JSON.stringify(projectFile.data))changeProject();break;
      }
      case 'dialogue.update': case 'dialogue.split': case 'dialogue.merge': {
        const file = sceneFile(operation.sceneId), source = parsed(file);
        const node = source.cst.find(item => item.id === operation.statementId && item.command === 'say');
        if (!node?.valid) throw new InvalidAuthoringCommand([{ code: 'STATEMENT_MISSING', message: 'The dialogue statement is unavailable',
          severity: 'error', owner: 'M02', source: { documentId: source.documentId, revision: source.revision, statementId: operation.statementId }, related: [], actions: ['locate', 'compare'] }]);
        const command = (target: typeof node) => {
          const args = target?.object?.value;
          if (!target?.valid || !record(args)) throw new Error('The dialogue statement is unavailable');
          return { args, body: DialogueContentSchema.parse(args.text), events: z.array(DialogueEventSchema).parse(args.events ?? []) };
        };
        const current = command(node);
        const changes: FieldPatchInput['changes'] = [];
        const set = (field: string, value: Json) => changes.push({ field, op: 'set', value });
        const setEvents = (events: DialogueEvent[]) => {
          if (events.length || current.args.events !== undefined) set('events', events);
        };
        const edits: TextEdit[] = [], ids = [operation.statementId];
        if (operation.op === 'dialogue.update') {
          if (operation.text !== undefined) set('text', operation.text);
          if (operation.events !== undefined) setEvents(operation.events);
        } else if (operation.op === 'dialogue.split') {
          const { offset } = operation, length = dialoguePlainText(current.body).length;
          if (offset === 0 || offset === length || !dialogueAnchorOffsets(current.body).has(offset))
            throw new Error('Split at a dialogue boundary inside the body');
          // Boundary events belong to the second statement.
          set('text', sliceDialogueContent(current.body, 0, offset));
          setEvents(current.events.filter(event => event.offset < offset));
          const { events: _events, voice: _voice, voiceByLocale: _voices, ...next } = current.args;
          const events = current.events.filter(event => event.offset >= offset).map(event => ({ ...event, offset: event.offset - offset }));
          const id = allocate(); ids.push(id);
          const statement = { ...next, text: sliceDialogueContent(current.body, offset, length), ...(events.length ? { events } : {}) };
          edits.push({ start: node.end, end: node.end, oldText: '', text: `\nsay ${JSON.stringify(statement)} @${id};` });
        } else {
          const next = source.cst[source.cst.indexOf(node) + 1];
          if (next?.id !== operation.nextStatementId || next.command !== 'say') throw new Error('Choose the immediately following dialogue');
          const consumers = authoringReferences(documents, { kind: 'statement', id: next.id });
          if (consumers.length) throw new Error(`REFERENCE_IN_USE: ${next.id} is referenced by ${consumers.map(ref => ref.path + ref.field).join(', ')}`);
          const second = command(next);
          const metadata = ({ text: _text, events: _events, voice: _voice, voiceByLocale: _voices, ...args }: Record<string, unknown>) => args;
          const firstFields = metadata(current.args), secondFields = metadata(second.args);
          if (second.args.voice || record(second.args.voiceByLocale) && Object.values(second.args.voiceByLocale).some(Boolean) ||
            [...new Set([...Object.keys(firstFields), ...Object.keys(secondFields)])].some(field => JSON.stringify(firstFields[field]) !== JSON.stringify(secondFields[field])))
            throw new Error('Merge adjacent dialogues with matching presentation and no second voice');
          const length = dialoguePlainText(current.body).length;
          const body: DialogueContent = { segments: [...dialogueSegments(current.body), ...dialogueSegments(second.body)] };
          set('text', body);
          setEvents([...current.events, ...second.events.map(event => ({ ...event, offset: event.offset + length }))]);
          edits.push({ start: next.start, end: next.end, oldText: next.raw, text: '' });
        }
        const patched = patchFields(source, { documentId: source.documentId, revision: source.revision, statementIds: [operation.statementId], changes });
        if (!patched.ok) return patched;
        edits.push(...patched.value);
        if (!edits.length) return fail('NO_CHANGE', 'The requested dialogue is already current');
        validateCommands(file, source, applyTextEdits(source.text, edits), ids, operation.op !== 'dialogue.update' || operation.events !== undefined);
        touch(file.document);
        edit.patches.push(toDocumentPatch(source.documentId, edits));
        break;
      }
      default: {
        const file = sceneFile(operation.sceneId), source = parsed(file); touch(file.document);
        const beforeId = 'beforeId' in operation ? operation.beforeId : null;
        if (operation.op === 'commands.fields') { const patched = patchFields(source, { documentId: file.document.documentId, revision: file.document.revision, statementIds: operation.ids, changes: operation.changes }); if (!patched.ok) return patched; validateCommands(file,source,applyTextEdits(source.text,patched.value),operation.ids); edit.patches.push(toDocumentPatch(file.document.documentId, patched.value)); break; }
        if (operation.op === 'commands.insert') {
          const at = beforeId ? required(source.cst.find(node => node.id === beforeId), 'Insertion command').start : source.text.length;
          const ids: Id[] = [],owned=new Set(documents.flatMap(document=>Object.entries(document.files).filter(([path])=>path.endsWith('.gal')).flatMap(([,text])=>parse({documentId:document.documentId,revision:document.revision,text}).cst.filter(node=>node.valid).flatMap(node=>[node.id!,...commandOwnedIds(node.command,node.object?.value as Record<string,unknown>)]))));
          const text = operation.commands.map(command => {
            const args = presentationArgs(command.command,structuredClone(command.args)), assign = (key: string) => { if (!args[key]) args[key] = allocate(); };
            if (command.command === 'label') assign('labelId');
            if (['changeBg','changeFigure','changeIllustration'].includes(command.command) && (!args.op || args.op === 'show')) assign('objectId');
            if (['setAnimation','setComplexAnimation'].includes(command.command)) assign('animationId');
            if (command.command === 'pixi') assign('effectId');
            if (command.command === 'playEffect' && (!args.op || args.op === 'play')) assign('soundId');
            if (command.command === 'choose' && Array.isArray(args.options)) args.options = args.options.map(option => record(option) ? { ...option, id: option.id || allocate() } : option) as Json[];
            if (command.command === 'say' && Array.isArray(args.events)) args.events = args.events.map(event => record(event) ? { ...event, id: event.id || allocate() } : event) as Json[];
            for(const ownedId of commandOwnedIds(command.command,args)){if(owned.has(ownedId))throw new Error(`IDENTITY_IN_USE: ${ownedId}`);owned.add(ownedId);}
            const id = allocate(); ids.push(id); return `${command.command} ${JSON.stringify(args)} @${id};`;
          }).join('\n') + '\n';
          validateCommands(file,source,source.text.slice(0,at)+text+source.text.slice(at),ids,true);
          edit.patches.push({ kind: 'text', documentId: source.documentId, edits: [{ start: at, end: at, before: '', after: `${at && source.text[at - 1] !== '\n' ? '\n' : ''}${text}` }] }); break;
        }
        const nodes = source.cst.filter(node=>node.id&&operation.ids.includes(node.id));
        if (!operation.ids.length || nodes.length!==new Set(operation.ids).size || nodes.some(node=>!node.valid)) throw new Error('Selected commands must have valid syntax');
        const end = (node: ParseResult['cst'][number]) => source.cst[source.cst.indexOf(node)+1]?.start ?? node.end;
        const mapping = declaredIds(source, operation.ids, allocate);
        if (operation.op === 'commands.remove') {
          for (const id of Object.keys(mapping)) {
            const refs = authoringReferences(documents, { kind: 'statement', id }).filter(ref => ref.documentId !== source.documentId || !ref.statementId || !operation.ids.includes(ref.statementId));
            if (refs.length) throw new Error(`REFERENCE_IN_USE: ${id} is referenced by ${refs.map(ref => ref.path + ref.field).join(', ')}`);
          }
          edit.patches.push(toDocumentPatch(source.documentId, nodes.map(node => ({ start: node.start, end: end(node), text: '', oldText: source.text.slice(node.start,end(node)) })))); break;
        }
        const targetFile = operation.op === 'commands.move' ? sceneFile(operation.targetSceneId) : file, target = parsed(targetFile);
        if (target.documentId === source.documentId && beforeId && operation.ids.includes(beforeId)) throw new Error('The insertion command belongs to the moved selection');
        const at = beforeId ? required(target.cst.find(node => node.id === beforeId), 'Insertion command').start : target.text.length;
        const rawSelection = nodes.map(node => source.text.slice(node.start,end(node)).trimEnd()).join('\n');
        const copied = operation.op === 'commands.duplicate' ? rewriteScriptReferences({documentId:source.documentId,revision:source.revision,text:rawSelection},mapping,project.engineVersion,pluginCommands) : rawSelection;
        const insertion = { start: at, end: at, text: `${at && target.text[at - 1] !== '\n' ? '\n' : ''}${copied}\n`, oldText: '' };
        const removals = operation.op === 'commands.move' ? nodes.map(node => ({ start: node.start, end: end(node), text: '', oldText: source.text.slice(node.start,end(node)) })) : [];
        if (operation.op === 'commands.duplicate' || target.documentId !== source.documentId && nodes.some(node => node.command === 'say')) {
          const ids = operation.op === 'commands.duplicate' ? nodes.map(node => mapping[node.id!]!) : nodes.filter(node => node.command === 'say').map(node => node.id!);
          const movedFrom = target.documentId !== source.documentId ? { documentId: source.documentId, text: applyTextEdits(source.text, removals) } : undefined;
          validateCommands(targetFile, target, applyTextEdits(target.text, [...(target.documentId === source.documentId ? removals : []), insertion]), ids, true, movedFrom);
        }
        if (target.documentId === source.documentId) edit.patches.push(toDocumentPatch(source.documentId, [...removals, insertion]));
        else { touch(targetFile.document); edit.patches.push(toDocumentPatch(source.documentId, removals), toDocumentPatch(target.documentId, [insertion])); }
      }
    }
    return { ok: true, value: edit, warnings: [] };
  } catch (error) {
    if (error instanceof InvalidSceneSource) return invalidSceneEdit(error.diagnostic);
    if (error instanceof InvalidAuthoringCommand) return { ok: false, error: error.issues[0]!, issues: error.issues };
    return fail('AUTHOR_EDIT', error instanceof Error ? error.message : String(error));
  }
}
