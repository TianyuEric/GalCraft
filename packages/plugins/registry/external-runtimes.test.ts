import { expect, it, vi } from 'vitest';
import { createRuntimeDependencyAccess } from './external-runtimes.js';
it('loads only declared, host-resolved external modules and preserves the exact expected descriptor', async () => {
  const resolve = vi.fn(async () => ({ ok: true as const, value: { url: 'data:text/javascript,export const binding=7', expected: { version: '5.1.00' } }, warnings: [] }));
  const access = createRuntimeDependencyAccess(['org.example.runtime/framework'], resolve);
  expect(await access.resolve('org.other.runtime/framework')).toMatchObject({ ok: false, error: { code: 'RUNTIME_DEPENDENCY_UNDECLARED' } });
  expect(resolve).not.toHaveBeenCalled();
  const loaded = await access.load('org.example.runtime/framework');
  expect(loaded).toMatchObject({ ok: true, value: { module: { binding: 7 }, expected: { version: '5.1.00' } } });
  expect(resolve).toHaveBeenCalledOnce();
});
it('releases an acquired descriptor when the external module cannot load', async () => {
  const release = vi.fn(), access = createRuntimeDependencyAccess(['org.example.runtime/framework'], async () => ({ ok: true as const,
    value: { url: 'data:text/javascript,throw new Error("unavailable")', expected: {}, release }, warnings: [] }));
  expect(await access.load('org.example.runtime/framework')).toMatchObject({ ok: false, error: { code: 'RUNTIME_DEPENDENCY_LOAD' } });
  expect(release).toHaveBeenCalledOnce();
});
