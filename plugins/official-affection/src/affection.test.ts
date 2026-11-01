import { describe, expect, it } from 'vitest';
import { FixtureLock } from '@galcraft/contracts/fixtures';
import { PluginStateAdapter } from '@galcraft/plugins/contracts';
import type { PluginManifest } from '@galcraft/plugins/contracts';
import { createAffectionContributions, createPlugin, readAffectionConfig } from './index.js';
import { createDefinition } from './definition.js';
const characterId = '10000000-0000-4000-8000-000000000001';
const config = { characters: [{ characterId, min: 0, max: 100, initial: 20, visible: true, label: '春' }] };
const token = { sessionId: crypto.randomUUID(), statementId: crypto.randomUUID(), occurrence: 1 };
describe('official affection progress', () => {
  it('reads two document instances and retains the legacy flattened config path', async () => {
    const second = 'Char02';
    const raw = {schemaVersion:1,documents:[{contribution:'org.galcraft.affection/config',documentId:'Doc001',revision:1,purpose:'characters',data:config},
      {contribution:'org.galcraft.affection/config',documentId:'Doc002',revision:3,purpose:'characters',data:{characters:[{...config.characters[0]!,characterId:second,label:'夏',initial:40}]}}]};
    expect(readAffectionConfig(raw).characters.map(item=>item.characterId)).toEqual([characterId,second]);
    expect(readAffectionConfig(config)).toEqual(config);
    expect(createDefinition().documents?.[0]?.configMapping?.mode).toBe('multiple');
    const contributions = await createPlugin().activate({config:raw} as any);
    expect(contributions.systems[0]?.initialProgress(raw)).toEqual({values:{[characterId]:20,[second]:40}});
    expect(contributions.components[0]?.render).toBeTypeOf('function');
    const command = contributions.commands.find(item=>item.spec.key==='org.galcraft.affection/interact')!;
    const waiting = await command.execute({args:{},state:{values:{[characterId]:20,[second]:40}},token});
    expect(waiting).toMatchObject({ok:true,value:{wait:{page:'org.galcraft.affection/relations'}}});
    expect(contributions.pages[0]?.wait?.restorable).toBe(true);
  });
  it('adds 20 to 35, clamps, compares, and restores a separate saved 20 without overwriting long term', async () => {
    const contributions = createAffectionContributions(config), system = contributions.systems[0]!;
    const saved = { version: '0.1.0', stateVersion: 1, progress: system.initialProgress(config) };
    const add = await contributions.commands[0]!.execute({ args: { characterId, amount: 15 }, state: saved.progress, token });
    expect(add.ok && add.value.progress).toEqual({ values: { [characterId]: 35 } });
    expect(saved.progress).toEqual({ values: { [characterId]: 20 } });
    const clamped = await contributions.commands[1]!.execute({ args: { characterId, value: 200 }, state: saved.progress, token });
    expect(clamped.ok && clamped.value.progress).toEqual({ values: { [characterId]: 100 } });
    expect(contributions.conditions[0]!.evaluate({ characterId, op: 'eq', value: 20 }, saved.progress, {})).toMatchObject({ ok: true, value: true });
    const manifest = { id: 'org.galcraft.affection', version: '0.1.0', stateVersions: { progress: 1, longTerm: 1, document: 1 } } as PluginManifest;
    const adapter = new PluginStateAdapter(contributions, [manifest]);
    const restored = adapter.prepare({ key: { requestId: crypto.randomUUID(), sessionId: token.sessionId, snapshotId: crypto.randomUUID() },
      progress: { [manifest.id]: saved }, longTerm: { [manifest.id]: { version: '0.1.0', stateVersion: 1, data: {} } }, targetLock: FixtureLock });
    expect(restored.ok && restored.value.progress[manifest.id]?.progress).toEqual({ values: { [characterId]: 20 } });
    if (restored.ok) { adapter.release(restored.value.id); adapter.release(restored.value.id); }
  });
  it('converts version zero on a copy and refuses unsupported or invalid states', () => {
    const system = createAffectionContributions(config).systems[0]!;
    const old = { values: { [characterId]: 120 } };
    expect(system.convert(0, 1, old)).toMatchObject({ ok: true, value: { values: { [characterId]: 100 } } });
    expect(old.values[characterId]).toBe(120);
    expect(system.convert(2, 1, old).ok).toBe(false);
    expect(system.validate({ values: {} }, 'progress').ok).toBe(false);
  });
});
