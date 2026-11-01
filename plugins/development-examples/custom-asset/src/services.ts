import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { shapeType } from './definition.js';
import { fail, id, kind, ok } from './model.js';
export function createPlugin(): GalCraftPlugin { return { activate: async () => ({ ...emptyContributions(), resources: [{ key: id + '/parser', kind, extensions: ['.shape.json'],
  inspect: async (rootFile, _files, source) => {
    if (!source) return fail('Resource source is required');
    try { const value = JSON.parse(await source.readText(rootFile)); const checked = shapeType.validate!(value); if (!checked.ok) return checked;
      return ok({ files: [rootFile], metadata: { width: 1024, height: 1024 }, typeData: { typeVersion: 1, provider: { id, version: '0.1.0' }, value: checked.value },
        capabilities: { resolver: id + '/parser', resolverVersion: '0.1.0', format: 'shape-json', formatVersion: '1', capabilities: ['visual', 'capture', 'pause'], parameters: [], motions: [], expressions: [], missingFiles: [] } });
    } catch (error) { return fail(String(error)); }
  } }] }), deactivate: async () => {} }; }
