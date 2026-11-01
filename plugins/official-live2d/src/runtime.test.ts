import { expect, it, vi } from 'vitest';
import type { PluginContext } from '@galcraft/plugins/contracts';
import type { ResolvedAsset } from '@galcraft/contracts';
import { stageProvider } from './runtime.js';

const resource = { kind: 'live2d' } as ResolvedAsset;
it('does not create SDK bindings when a pending dependency completes after disposal', async () => {
  let complete!: (value: unknown) => void;
  const createBindings = vi.fn();
  const context = { assets: { readText: vi.fn(), readBytes: vi.fn() }, runtimeDependencies: { load: () => new Promise(resolve => { complete = resolve; }) } } as unknown as PluginContext;
  const provider = await stageProvider(context), pending = provider.create(resource, {});
  provider.dispose();
  complete({ ok: true, value: { url: 'http://localhost/runtime/adapter.mjs', expected: {}, module: { createBindings } } });
  expect(await pending).toMatchObject({ ok: false, error: { code: 'LIVE2D_RUNTIME_UNAVAILABLE', message: expect.stringContaining('已关闭') } });
  expect(createBindings).not.toHaveBeenCalled();
  expect(await provider.create(resource, {})).toMatchObject({ ok: false });
});

it('rejects bindings returned after abort before allocating a model runtime', async () => {
  let complete!: (value: unknown) => void;
  const controller = new AbortController(), createBindings = vi.fn(() => new Promise(resolve => { complete = resolve; }));
  const context = { signal: controller.signal, assets: { readText: vi.fn(), readBytes: vi.fn() }, runtimeDependencies: { load: async () => ({ ok: true, value: { url: 'http://localhost/runtime/adapter.mjs', expected: {}, module: { createBindings } } }) } } as unknown as PluginContext;
  const provider = await stageProvider(context), pending = provider.create(resource, {});
  await vi.waitFor(() => expect(createBindings).toHaveBeenCalledOnce());
  controller.abort();
  const coreVersion = vi.fn();complete({ coreVersion });
  expect(await pending).toMatchObject({ ok: false, error: { message: expect.stringContaining('已关闭') } });
  expect(coreVersion).not.toHaveBeenCalled();provider.dispose();
});
