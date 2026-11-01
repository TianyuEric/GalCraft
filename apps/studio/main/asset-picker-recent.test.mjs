import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AssetPickerRecent } from './asset-picker-recent.mjs';

const root = resolve(import.meta.dirname, '../../../tmp/testing/asset-picker-recent');
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
it('stores actual picks by project and media type, deduplicates and caps each type at 30', async () => {
  const store = new AssetPickerRecent(root), projectId = randomUUID(), otherProject = randomUUID();
  const images = Array.from({ length: 35 }, () => ({ id: randomUUID(), kind: 'image' })), audio = { id: randomUUID(), kind: 'audio' };
  expect(await store.read(projectId)).toEqual({});
  await store.record(projectId, [...images, audio]);
  await store.record(projectId, [images[10]]);
  const saved = await new AssetPickerRecent(root).read(projectId);
  expect(saved.image).toHaveLength(30); expect(saved.image[0]).toBe(images[10].id);
  expect(new Set(saved.image).size).toBe(30); expect(saved.audio).toEqual([audio.id]);
  expect(await store.read(otherProject)).toEqual({});
  await store.remove(projectId, images[10].id);
  expect((await store.read(projectId)).image).not.toContain(images[10].id);
  expect(JSON.parse(await readFile(store.path(projectId), 'utf8')).audio).toEqual([audio.id]);
  const custom = { id: randomUUID(), kind: 'org.example.custom/polygon' };
  await store.record(projectId, [custom]);
  expect((await new AssetPickerRecent(root).read(projectId))[custom.kind]).toEqual([custom.id]);
});
