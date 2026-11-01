import { describe, expect, it, vi } from 'vitest';
import type { Lock, Result, StudioBridge } from '@galcraft/contracts';
import { createDefinition, pluginMetadata as affection } from '@galcraft/official-affection';
import { prepareProjectPlugins } from './plugins.js';
import { readFileSync } from 'node:fs';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const lock: Lock = { engine: { kind: 'engine', id: 'core', version: '0.1.0', targets: ['web', 'windows'], required: true },
  template: { kind: 'template', id: 'default', version: '0.1.0', targets: ['web', 'windows'], required: true },
  plugins: [{ kind: 'plugin', id: affection.id, version: affection.version, targets: ['web', 'windows'], required: true }], selectedProviders: {} };
const domain = { projectId: 'ProjAA', kind: 'sample' as const, instance: 'official-definition' };
function fixture(directory = 'official-affection') {
  const release = vi.fn(async () => ok(undefined));
  const manifest = JSON.parse(readFileSync(new URL(`../../../../plugins/${directory}/package/manifest.json`, import.meta.url), 'utf8'));
  const uri = (path: string | null) => path ? `data:text/javascript,${encodeURIComponent(readFileSync(new URL(`../../../../plugins/${directory}/package/${path}`, import.meta.url), 'utf8'))}` : null;
  const installed = { manifest, runtimeUrl: uri(manifest.entry.runtime), definitionUrl: uri(manifest.entry.definition), editorUrl: null };
  const bridge = { plugins: { resolve: async () => ok({ handleId: 'OfficialAA', packages: [installed] }), release } } as unknown as Pick<StudioBridge, 'plugins'>;
  return { bridge, release, manifest, installed };
}
describe('official authoring plugin definition', () => {
  it('prepares the public definition for compilation without activating runtime contributions', async () => {
    const { bridge, release } = fixture();
    const prepared = await prepareProjectPlugins(bridge, lock, {}, domain, [], [], 'definition');
    expect(JSON.parse(JSON.stringify(prepared.definitions))).toEqual(JSON.parse(JSON.stringify([{ pluginId: affection.id, definition: createDefinition() }])));
    expect(prepared.definitions[0]!.definition.documents![0]!.configMapping).toEqual({ purpose: 'characters', mode: 'multiple', required: false });
    expect(prepared.commandSpecs).toEqual(createDefinition().commands);
    expect(prepared.conditionSpecs).toEqual(createDefinition().conditions);
    expect(prepared.contributions.systems).toHaveLength(0);
    expect(prepared.contributions.pages).toHaveLength(0);
    await prepared.dispose(); expect(release).toHaveBeenCalledWith('OfficialAA');
  });
  it('retains the same definition and consumes both mapped documents during runtime preparation', async () => {
    const { bridge, release } = fixture();
    const characters = ['CharAA', 'CharBB'].map((characterId, index) => ({ characterId, min: 0, max: 100, initial: 10 + index, visible: true, label: characterId }));
    const config = { schemaVersion: 1, documents: characters.map((character, index) => ({ contribution: `${affection.id}/config`, documentId: index ? 'ConfigB' : 'ConfigA', revision: 1, purpose: 'characters', data: { characters: [character] } })) };
    const prepared = await prepareProjectPlugins(bridge, lock, { [affection.id]: config }, domain);
    expect(JSON.parse(JSON.stringify(prepared.definitions))).toEqual(JSON.parse(JSON.stringify([{ pluginId: affection.id, definition: createDefinition() }])));
    expect(prepared.contributions.systems[0]!.initialProgress({})).toEqual({ values: { CharAA: 10, CharBB: 11 } });
    expect(prepared.contributions.commands).toHaveLength(3);
    expect(prepared.contributions.components[0]!.key).toBe(`${affection.id}/hud`);
    await prepared.dispose(); expect(release).toHaveBeenCalledWith('OfficialAA');
  });
  it('rejects an unavailable locked official version and releases the package handle', async () => {
    const { bridge, release } = fixture();
    await expect(prepareProjectPlugins(bridge, { ...lock, plugins: [{ ...lock.plugins[0]!, version: '9.0.0' }] }, {}, domain, [], [], 'definition')).rejects.toThrow('org.galcraft.affection@9.0.0');
    expect(release).toHaveBeenCalledWith('OfficialAA');
  });
  it.each(['music-composition', 'official-voice-comfy'])('prepares a page preview with the author-only %s package enabled', async directory => {
    const { bridge, release, manifest } = fixture(directory);
    expect(manifest.entry.runtime).toBeNull();
    expect(manifest.contributions.some((item: { kind: string }) => item.kind === 'productionOperation')).toBe(true);
    const enabled = { ...lock, plugins: [{ ...lock.plugins[0]!, id: manifest.id, version: manifest.version }] };
    const prepared = await prepareProjectPlugins(bridge, enabled, {}, domain);
    expect(prepared.manifests.map(item => item.id)).toEqual([manifest.id]);
    expect(prepared.definitions[0]?.pluginId).toBe(manifest.id);
    expect(prepared.contributions.productionOperations).toEqual([]);
    expect(prepared.contributions.generationProviders).toEqual([]);
    expect(prepared.contributions.systems).toEqual([]);
    await prepared.dispose(); await prepared.dispose();
    expect(release).toHaveBeenCalledExactlyOnceWith('OfficialAA');
  });
  it('still rejects a runtime plugin whose installed runtime URL is unavailable', async () => {
    const { bridge, release, installed } = fixture(); installed.runtimeUrl = null;
    await expect(prepareProjectPlugins(bridge, lock, {}, domain)).rejects.toThrow('缺少运行入口');
    expect(release).toHaveBeenCalledExactlyOnceWith('OfficialAA');
  });
});
