import type { CommandSpec, FieldSpec, Id, Json, Result, StageObject } from '@galcraft/contracts';
export const id = 'org.example.vector-shape';
export const kind = 'org.example.vector-shape/shape' as const;
export type Shape = { vertices: { x: number; y: number }[]; color: string; texture: { kind: 'asset' | 'variant'; id: Id } | null };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export const fail = (message: string): Result<never> => { const error = { code: 'SHAPE_INVALID', message, severity: 'error' as const, owner: 'M04' as const, related: [], actions: ['edit' as const] }; return { ok: false, error, issues: [error] }; };
const field: FieldSpec = { path: 'color', label: 'Color', description: 'Polygon fill color', type: 'string', required: true, nullable: false, default: '#4477cc', unit: 'none', group: 'basic', summary: true, keywords: [] };
export const fields: FieldSpec[] = [field, { ...field, path: 'vertices', label: 'Vertices', type: 'array', default: [], item: { ...field, path: 'vertex', type: 'object', default: {}, children: [
  { ...field, path: 'x', label: 'X', type: 'number', default: 0 }, { ...field, path: 'y', label: 'Y', type: 'number', default: 0 }] } },
  { ...field, path: 'texture', label: 'Texture reference', type: 'object', nullable: true, default: null, children: [
    { ...field, path: 'kind', label: 'Reference kind', enumValues: ['asset', 'variant'], default: 'asset' },
    { ...field, path: 'id', label: 'Resource', type: 'ref', refKind: 'asset', default: null }] }];
export const schema: Json = { type: 'object', required: ['vertices', 'color', 'texture'], additionalProperties: false, properties: {
  vertices: { type: 'array', minItems: 3, maxItems: 128, items: { type: 'object', required: ['x', 'y'], additionalProperties: false, properties: { x: { type: 'number', minimum: 0, maximum: 1024 }, y: { type: 'number', minimum: 0, maximum: 1024 } } } },
  color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, texture: { anyOf: [{ type: 'null' }, { type: 'object', required: ['kind', 'id'], additionalProperties: false, properties: { kind: { enum: ['asset', 'variant'] }, id: { type: 'string', minLength: 6 } } }] },
} };
export const command: CommandSpec = { key: id + '/show', version: '0.1.0', name: 'Show vector shape', description: 'Present a vector shape on the stage', icon: 'shapes', category: 'visual', keywords: [],
  fields: ['objectId', 'assetId', 'variantId'].map(path => ({ ...field, path, label: path, type: 'ref' as const, refKind: path === 'objectId' ? 'object' as const : path === 'assetId' ? 'asset' as const : 'variant' as const, default: null, ...(path === 'assetId' ? { assetKinds: [kind] } : {}) })),
  continuation: 'continue', skippable: true, executor: id + '/show', targetCapabilities: [], constraints: [] };
export function stageObject(args: { objectId: Id; assetId: Id; variantId: Id }): StageObject {
  const values = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, blur: 0, brightness: 1, contrast: 1, saturation: 1, gamma: 1, rgb: [255, 255, 255] as [number, number, number], bloom: { intensity: 0, brightness: 1, blur: 0, threshold: 1 }, bevel: { opacity: 0, thickness: 0, rotationDeg: 0, softness: 0, rgb: [255, 255, 255] as [number, number, number] }, filters: { oldFilm: false, dot: false, reflection: false, glitch: false, rgbSplit: false, godray: false }, blend: 'normal' as const, z: 0 };
  const cut = { preset: 'cut' as const, resourceId: null, durationMs: 0, easing: { family: 'linear' as const, direction: 'inOut' as const }, direction: 'left' as const };
  return { id: args.objectId, characterId: null, assetId: args.assetId, variantId: args.variantId, layer: 'effect', entranceOrder: 0, backgroundFrame: null, station: 'center', current: values, defaults: { ...values, station: 'center' }, framing: { mode: 'full', scale: 1, offsetX: 0, offsetY: 0, crop: null }, transition: { enter: cut, exit: cut }, processes: [], providerState: { provider: id + '/parser', version: '0.1.0', state: {} }, imageFace: null };
}
