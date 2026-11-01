import { describe, expect, it } from 'vitest';
import type { ResolvedAsset, Result } from '@galcraft/contracts';
import { createLive2DResourceProvider, createLive2DStageProvider, type CubismModelPort, type CubismOptions } from './model.js';
import { modelType } from './definition.js';

const id = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };
const moc = async () => ({ ok: true as const, value: { version: 53, parameters: [
  { id: 'ParamMouthOpenY', min: 0, max: 1, default: 0 }, { id: 'ParamA', min: 0, max: 1, default: 0 }], partIds: ['PartArm'] }, warnings: [] });

describe('Live2D resource and instance', () => {
  it('collects exact declared files, motions, expressions and MotionSync capability', async () => {
    const files: Record<string, string> = {
      'role.model3.json': JSON.stringify({ Version: 3, FileReferences: { Moc: 'role.moc3', Textures: ['tex/0.png'],
        Motions: { Idle: [{ File: 'motions/idle.motion3.json', Sound: 'sounds/idle.wav' }] },
        Expressions: [{ Name: 'smile', File: 'expressions/smile.exp3.json' }], MotionSync: 'role.motionsync3.json', Physics: 'role.physics3.json' },
      Groups: [{ Target: 'Parameter', Name: 'LipSync', Ids: ['ParamMouthOpenY'] }] }),
      'role.motionsync3.json': JSON.stringify({ Settings: [{ AnalysisType: 'CRI', CubismParameters: [{ Id: 'ParamA' }] }] }),
      'role.moc3': '', 'tex/0.png': '', 'motions/idle.motion3.json': '', 'sounds/idle.wav': '',
      'expressions/smile.exp3.json': '', 'role.physics3.json': '',
    };
    const provider = createLive2DResourceProvider(async path => files[path]!, moc);
    const inspected = unwrap(await provider.inspect('role.model3.json', Object.keys(files)));
    expect(inspected.files).toContain('sounds/idle.wav');
    expect(inspected.capabilities.capabilities).toEqual(expect.arrayContaining(['motion', 'expression', 'physics', 'amplitudeLip', 'motionSync']));
    expect(inspected.capabilities.motions[0]).toMatchObject({ group: 'Idle', index: 0 });
    const incomplete = await provider.inspect('role.model3.json', Object.keys(files).filter(path => path !== 'tex/0.png'));
    expect(incomplete.ok).toBe(false); if (!incomplete.ok) expect(incomplete.error.message).toContain('Textures[0] tex/0.png');
    files['role.motionsync3.json'] = JSON.stringify({ Settings: [{ AnalysisType: 'unsupported' }] });
    const unsupported = await provider.inspect('role.model3.json', Object.keys(files));
    expect(unsupported).toMatchObject({ ok: false, error: { code: 'MOTIONSYNC_UNSUPPORTED' } });
  });
  it('validates persisted model capabilities against the exact resource implementation', () => {
    const value = { capabilities: { resolver: 'org.galcraft.live2d/resource', resolverVersion: '0.1.0', format: 'live2d-model3', formatVersion: '3',
      capabilities: [], parameters: [], motions: [], expressions: [], missingFiles: [] }, model: { mocVersion: 5 } };
    expect(modelType.validate!(value).ok).toBe(true);
    expect(modelType.validate!({ ...value, capabilities: { ...value.capabilities, parameters: 'lost' } }).ok).toBe(false);
    expect(modelType.validate!({ ...value, capabilities: { ...value.capabilities, resolverVersion: '2.0.0' } }).ok).toBe(false);
    expect(value.capabilities.parameters).toEqual([]);
  });
  it('keeps exact Core versions and restores model motion, parameter and lip settings', async () => {
    const calls: string[] = [];
    const observed: CubismOptions[] = [];
    const model: CubismModelPort = { canvas: {} as HTMLCanvasElement, parameterRanges: { ParamA: { min: 0, max: 1, default: 0 } },
      partIds: ['PartArm'], motions: [{ group: 'Idle', index: 0, file: 'idle.motion3.json', sound: null, fadeInMs: null, fadeOutMs: null }],
      expressions: ['smile'], motionSync: true, setParameter: (name, value) => calls.push(`${name}:${value}`),
      setPartOpacity: (name, value) => calls.push(`${name}:${value}`), playMotion: (_group, _index, _loop, _priority, elapsed) => calls.push(`motion:${elapsed}`),
      setExpression: (_name, elapsed) => calls.push(`expression:${elapsed}`), update: (dt, options, lip) => { observed.push(structuredClone(options)); calls.push(`update:${dt}:${lip}`); },
      draw: () => calls.push('draw'), pause: paused => calls.push(`pause:${paused}`), dispose: () => calls.push('dispose') };
    const resource: ResolvedAsset = { assetId: id(1), variantId: id(2), kind: 'live2d', entry: 'role.model3.json', files: [],
      metadata: {}, canvas: null, provider: 'galcraft.live2d' };
    const runtime = { sdkRelease: '5-r.4' as const, coreVersion: '6.0.01', motionSyncCoreVersion: '5-r.2',
      open: async () => ({ ok: true as const, value: model, warnings: [] }) };
    const missing = await createLive2DStageProvider(runtime, { coreVersion: '5.2.00', motionSyncCoreVersion: '5-r.2' }).create(resource, {});
    expect(missing.ok).toBe(false);
    const provider = createLive2DStageProvider(runtime, { coreVersion: '6.0.01', motionSyncCoreVersion: '5-r.2' });
    const configured = unwrap(await provider.create(resource, { blink: false, breath: false, physics: false,
      gaze: { follow: 'none', x: 0.8, y: -0.7 }, lip: { mode: 'basic', gain: 1.5 },
      motion: { op: 'play', group: 'Idle', index: 0, loop: true }, expression: { op: 'set', name: 'smile' },
      parameters: { ParamA: 0.4 } }));
    configured.pause(false); configured.update(16, 0.5);
    expect(observed.at(-1)).toMatchObject({ autoBlink: false, breath: false, physics: false,
      look: { mode: 'fixed', x: 0, y: 0 }, lip: { mode: 'amplitude', gain: 1.5 },
      motion: { group: 'Idle', index: 0, loop: true }, expression: 'smile', parameters: { ParamA: 0.4 } });
    configured.dispose();
    const instance = unwrap(await provider.create(resource, { schemaVersion: 1, resourceId: id(1), variantId: id(2),
      options: { motion: { group: 'Idle', index: 0, loop: true, priority: 1 }, expression: 'smile', lip: { mode: 'motionSync', gain: 1 } },
      parameterValues: { ParamA: 0.6 }, motionElapsedMs: 500, expressionElapsedMs: 200 }));
    expect(calls).toEqual(expect.arrayContaining(['ParamA:0.6', 'motion:500', 'expression:200']));
    instance.pause(false); instance.update(60, 0.5);
    expect(calls.some(value => value.startsWith('update:60:'))).toBe(true);
    expect(unwrap(instance.capture())).toMatchObject({ motionElapsedMs: 560, options: { expression: 'smile' } });
    expect(instance.set({ parameterId: 'ParamA', value: 2 }).ok).toBe(true);
    expect(calls).toContain('ParamA:1');
    expect(instance.set({ parameterId: 'Missing', value: 1 }).ok).toBe(false);
    instance.dispose(); expect(calls.at(-1)).toBe('dispose');
    const withoutSync = createLive2DStageProvider({ ...runtime, open: async () => ({ ok: true as const,
      value: { ...model, motionSync: false }, warnings: [] }) },
    { coreVersion: '6.0.01', motionSyncCoreVersion: '5-r.2' });
    const unsupported = await withoutSync.create(resource, { options: { lip: { mode: 'motionSync', gain: 1 } } });
    expect(unsupported.ok).toBe(false);
    expect(await withoutSync.create(resource, { lip: { mode: 'motionSync', gain: 1 } })).toMatchObject({ ok: false, error: { code: 'MOTIONSYNC_CORE_MISSING' } });
  });
});
