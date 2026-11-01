import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { applicationUrl, ensureApplication } from './studio-npm-entry.mjs';

const base = resolve(import.meta.dirname, '../tmp/testing/studio-npm-entry-tests');
await mkdir(base, { recursive: true });
const fixture = async (prefix, version = '0.1.0') => {
  const app = join(prefix, 'node_modules/@galcraft/studio');
  await mkdir(join(app, 'service'), { recursive: true });
  await writeFile(join(app, 'package.json'), JSON.stringify({ name: '@galcraft/studio', version }));
  await writeFile(join(app, 'service/cli.mjs'), '');
};
const scenario = async callback => {
  const cache = await mkdtemp(join(base, 'case-'));
  try { await callback(cache); }
  finally {
    assert.equal(resolve(cache, '..'), base);
    await rm(cache, { recursive: true, force: true });
  }
};

test('first preparation uses the full release URL and completed installations are reused', async () => scenario(async cache => {
  let count = 0;
  const install = async (prefix, url) => { count++; assert.equal(url, applicationUrl('0.1.0')); await fixture(prefix); };
  const options = { version: '0.1.0', cache, install, log() {} };
  assert.equal(await ensureApplication(options), join(cache, 'application/node_modules/@galcraft/studio/service/cli.mjs'));
  await ensureApplication(options);
  assert.equal(count, 1);
}));

test('failed preparation releases ownership and retries without marking the partial install complete', async () => scenario(async cache => {
  const options = { version: '0.1.0', cache, log() {} };
  await assert.rejects(ensureApplication({ ...options, install: async prefix => { await fixture(prefix); throw new Error('download interrupted'); } }), /download interrupted/);
  await assert.rejects(readFile(join(cache, 'installed.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(cache, 'install.lock')), { code: 'ENOENT' });
  let count = 0;
  await ensureApplication({ ...options, install: async prefix => { count++; await fixture(prefix); } });
  assert.equal(count, 1);
}));

test('concurrent commands share one preparation and a stale process lock permits retry', async () => scenario(async cache => {
  await writeFile(join(cache, 'install.lock'), '999999999');
  let count = 0;
  const options = { version: '0.1.0', cache, log() {}, install: async prefix => { count++; await new Promise(resolvePause => setTimeout(resolvePause, 30)); await fixture(prefix); } };
  const [first, second] = await Promise.all([ensureApplication(options), ensureApplication(options)]);
  assert.equal(first, second);
  assert.equal(count, 1);
}));
