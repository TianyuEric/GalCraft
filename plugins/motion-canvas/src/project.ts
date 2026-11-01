import { validateJsonData } from '@galcraft/contracts';
import type { Issue, Json, Result } from '@galcraft/contracts';

export const pluginId = 'org.galcraft.motion-canvas';
export const projectDocumentKey = `${pluginId}/project`;
export const operationId = `${pluginId}/render` as const;
export const renderProviderKey = `${pluginId}/renderProvider`;
export const toolchainKey = `${pluginId}/toolchain`;
export type MotionProject = {
  schemaVersion: 1; id: string; revision: number; title: string; entry: string;
  files: {path: string; content: string}[];
  bindings: {alias: string; assetId: string; variantId: string; port: 'images' | 'fonts' | 'audio'; purpose: 'image' | 'font' | 'audio'}[];
  render: {width: number; height: number; fps: number; frames: number; audio: {alias: string; startSec: number; trimSec: number; gainDb: number} | null};
  toolchain: {motionCanvas: '3.17.2'; vite: '5.4.21'; renderer: '0.1.0'};
};
const object = (properties: Record<string, unknown>) => ({type: 'object', properties, required: Object.keys(properties), additionalProperties: false});
const text = {type: 'string', minLength: 1}, integer = (minimum: number, maximum: number) => ({type: 'integer', minimum, maximum});
export const motionProjectSchema = object({schemaVersion: {const: 1}, id: text, revision: integer(1, Number.MAX_SAFE_INTEGER), title: text, entry: text,
  files: {type: 'array', minItems: 1, items: object({path: text, content: {type: 'string'}})},
  bindings: {type: 'array', items: object({alias: {...text, pattern: '^[A-Za-z][A-Za-z0-9_-]*$'}, assetId: text, variantId: text, port: {enum: ['images','fonts','audio']}, purpose: {enum: ['image','font','audio']}})},
  render: object({width: integer(2, 7680), height: integer(2, 4320), fps: integer(1, 120), frames: integer(1, 864000),
    audio: {anyOf: [{type: 'null'}, object({alias: text, startSec: {type: 'number', minimum: 0}, trimSec: {type: 'number', minimum: 0}, gainDb: {type: 'number', minimum: -96, maximum: 24}})]}}),
  toolchain: object({motionCanvas: {const: '3.17.2'}, vite: {const: '5.4.21'}, renderer: {const: '0.1.0'}}),
}) as Json;
export const motionIssue = (code: string, message: string): Issue => ({code, message, severity: 'error', owner: 'M10', related: [], actions: ['edit']});
export function parseMotionProject(value: unknown): Result<MotionProject> {
  const shape = validateJsonData(motionProjectSchema, value as Json);
  if (!shape.ok) return shape as Result<MotionProject>;
  const project = structuredClone(value) as MotionProject, issues: Issue[] = [];
  const paths = new Set<string>(), aliases = new Set<string>();
  for (const file of project.files) {
    const parts = file.path.split('/');
    if (file.path.includes('\\') || file.path.includes(':') || parts.some(part => !part || part === '.' || part === '..') || ['node_modules','public','browser'].includes(parts[0]!) || !/\.(?:ts|tsx|js|jsx|json|css)$/.test(file.path)) issues.push(motionIssue('MOTION_FILE_PATH', `Use project-relative source paths: ${file.path}`));
    if (paths.has(file.path.toLowerCase())) issues.push(motionIssue('MOTION_FILE_DUPLICATE', `Duplicate project file: ${file.path}`));
    paths.add(file.path.toLowerCase());
  }
  if (!project.files.some(file => file.path === project.entry) || !/\.tsx?$/.test(project.entry)) issues.push(motionIssue('MOTION_ENTRY', 'The entry must reference a TS/TSX file in the project.'));
  for (const binding of project.bindings) {
    if (aliases.has(binding.alias)) issues.push(motionIssue('MOTION_ALIAS_DUPLICATE', `Duplicate asset alias: ${binding.alias}`)); aliases.add(binding.alias);
    if ({image: 'images', font: 'fonts', audio: 'audio'}[binding.purpose] !== binding.port) issues.push(motionIssue('MOTION_BINDING_PORT', `Asset ${binding.alias} has mismatched purpose and input port.`));
  }
  const audio = project.render.audio;
  if (audio && !project.bindings.some(binding => binding.alias === audio.alias && binding.purpose === 'audio')) issues.push(motionIssue('MOTION_AUDIO', 'The soundtrack requires an explicit audio alias binding.'));
  if (audio && audio.startSec >= project.render.frames / project.render.fps) issues.push(motionIssue('MOTION_AUDIO_RANGE', 'The soundtrack start must be within the video duration.'));
  if (project.render.width % 2 || project.render.height % 2) issues.push(motionIssue('MOTION_DIMENSIONS', 'H.264 yuv420p requires even dimensions.'));
  return issues.length ? {ok: false, error: issues[0]!, issues} : {ok: true, value: project, warnings: []};
}
export function updateMotionProject(project: MotionProject, expectedRevision: number, changes: {path: string; content: string | null}[]): Result<MotionProject> {
  if (project.revision !== expectedRevision) {const error = motionIssue('MOTION_REVISION', 'The project has changed. Read its current revision before updating.'); return {ok: false, error, issues: [error]};}
  const files = new Map(project.files.map(file => [file.path, file.content]));
  for (const file of changes) {if (file.content === null) files.delete(file.path); else files.set(file.path, file.content);}
  return parseMotionProject({...project, revision: project.revision + 1, files: [...files].map(([path, content]) => ({path, content}))});
}
export function createMotionProject(): MotionProject {
  return {schemaVersion: 1, id: 'motion-main', revision: 1, title: '新的片头', entry: 'project.ts', files: [
    {path: 'project.ts', content: "import {makeProject} from '@motion-canvas/core';\nimport scene from './scene?scene';\nexport default makeProject({scenes:[scene]});\n"},
    {path: 'scene.tsx', content: "import {Txt,makeScene2D} from '@motion-canvas/2d';\nimport {waitFor} from '@motion-canvas/core';\nexport default makeScene2D(function* (view) {view.add(<Txt text=\"新的篇章\" fontSize={56} fill=\"#fff2d9\"/>);yield* waitFor(15);});\n"},
  ], bindings: [], render: {width: 960, height: 540, fps: 24, frames: 360, audio: null}, toolchain: {motionCanvas: '3.17.2', vite: '5.4.21', renderer: '0.1.0'}};
}
