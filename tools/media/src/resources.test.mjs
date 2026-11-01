import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ResourceRegistry } from './resources.mjs';

const directory = join(process.cwd(), '..', '..', 'tmp', 'testing', 'host-resources');
const file = join(directory, '春日 来信.ogg');
const ids = { projectId: '11111111-1111-4111-8111-111111111111', assetId: '22222222-2222-4222-8222-222222222222', variantId: '33333333-3333-4333-8333-333333333333' };

beforeAll(async () => { await mkdir(directory, { recursive: true }); await writeFile(file, Buffer.from('0123456789')); });
afterAll(async () => { await rm(file, { force: true }); });

describe('registered media resources', () => {
  it.each(['bLb3jI', 'jD5Wu3', '123456'])('serves short project ID %s through a canonical host', async projectId => {
    const registry = new ResourceRegistry();
    const entry = registry.register({ projectId, assetId: 'YC8mKh', variantId: 'Uga7Ji',
      relative: 'audio/春日 来信.ogg', path: file, mime: 'audio/ogg' });
    expect(entry.uri).toBe(`galcraft-resource://project-${projectId.toLowerCase()}/YC8mKh/Uga7Ji/audio/${encodeURIComponent('春日 来信.ogg')}`);
    const response = await registry.response(new Request(entry.uri));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('0123456789');
    expect((await registry.response(new Request(entry.uri, { method: 'HEAD' }))).status).toBe(200);
    entry.release();
    expect((await registry.response(new Request(entry.uri))).status).toBe(404);
  });
  it('serves a registered Chinese path with MIME, byte range and release isolation', async () => {
    const registry = new ResourceRegistry();
    const first = registry.register({ ...ids, relative: 'audio/春日 来信.ogg', path: file, mime: 'audio/ogg' });
    const second = registry.register({ ...ids, relative: 'audio/春日 来信.ogg', path: file, mime: 'audio/ogg' });
    const request = range => new Request(first.uri, { headers: range ? { range } : {} });
    const partial = await registry.response(request('bytes=4-7'));
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-type')).toBe('audio/ogg');
    expect(partial.headers.get('content-range')).toBe('bytes 4-7/10');
    expect(await partial.text()).toBe('4567');
    expect((await registry.response(request('bytes=20-'))).status).toBe(416);
    first.release();
    expect((await registry.response(request())).status).toBe(200);
    second.release();
    expect((await registry.response(request())).status).toBe(404);
  });
  it('preserves directories for relative module imports', async () => {
    const registry = new ResourceRegistry();
    const entry = registry.register({ ...ids, relative: 'runtime/index.js', path: file, mime: 'text/javascript' });
    const helper = registry.register({ ...ids, relative: 'runtime/helper.js', path: file, mime: 'text/javascript' });
    expect(new URL('./helper.js', entry.uri).href).toBe(helper.uri);
    expect((await registry.response(new Request(new URL('./helper.js', entry.uri)))).status).toBe(200);
    entry.release(); helper.release();
  });
});
