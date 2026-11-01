import { RefSchema } from '@galcraft/contracts';
import { validatePluginData } from '@galcraft/plugins/contracts';
import type { AssetTypeDefinition, PluginDefinition } from '@galcraft/plugins/contracts';
import { command, fail, fields, id, kind, ok, schema, type Shape } from './model.js';
export const shapeType: AssetTypeDefinition = {
  contractVersion: 1, key: kind, typeVersion: 1, title: 'Vector shape', description: 'A polygon with a color and an optional formal resource reference', icon: 'shapes', group: 'visual',
  schema, fields, extensions: ['.shape.json'], targets: ['web', 'windows'], resourceProviderKey: id + '/parser', stageProviderKey: id + '/canvas', capabilities: ['visual', 'capture', 'pause'],
  editorKey: id + '/properties', previewKey: id + '/preview', thumbnailKey: id + '/thumbnail',
  filterFields: ['color'],
  validate(value) { const result = validatePluginData(schema, value); if (!result.ok) return result;
    const shape = value as Shape; if (shape.texture && !RefSchema.safeParse(shape.texture).success) return fail('Invalid texture reference'); return ok(value); },
  collectReferences: value => (value as Shape).texture ? [(value as Shape).texture!] : [],
  rewriteReferences(value, mapping) { const shape = structuredClone(value) as Shape;
    if (shape.texture) shape.texture.id = mapping[shape.texture.id] ?? shape.texture.id; return ok(shape); },
  rewriteFile(path, bytes, mapping) { if (!path.endsWith('.shape.json')) return ok(bytes);
    try { const result = this.rewriteReferences(JSON.parse(new TextDecoder().decode(bytes)), mapping); return result.ok ? ok(new TextEncoder().encode(JSON.stringify(result.value, null, 2) + '\n')) : result; }
    catch (error) { return fail(String(error)); } },
};
export const definition: PluginDefinition = { assetTypes: [shapeType], commands: [command] };
