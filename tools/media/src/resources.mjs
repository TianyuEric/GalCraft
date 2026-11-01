import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

const SCHEME = 'galcraft-resource';
// A named host also prevents all-digit project IDs from being canonicalized as IPv4.
const PROJECT_HOST_PREFIX = 'project-';

export function registerResourceScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  }]);
}

export function parseByteRange(range, total) {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return undefined;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return undefined;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : total - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= total || end < start) return undefined;
  return { start, end: Math.min(end, total - 1) };
}

export class ResourceRegistry {
  #entries = new Map();

  register({ projectId, assetId, variantId, relative, path, mime }) {
    const key = this.#key(projectId, assetId, variantId, relative);
    const previous = this.#entries.get(key);
    if (previous && (previous.path !== path || previous.mime !== mime)) throw new Error('Resource identity already registered');
    const entry = previous ?? { path, mime, users: 0 };
    entry.users += 1;
    this.#entries.set(key, entry);
    let released = false;
    return {
      uri: `${SCHEME}://${PROJECT_HOST_PREFIX}${encodeURIComponent(projectId.toLowerCase())}/${[assetId, variantId].map(encodeURIComponent).join('/')}/${relative.split('/').map(encodeURIComponent).join('/')}`,
      release: () => {
        if (released) return;
        released = true;
        entry.users -= 1;
        if (entry.users === 0) this.#entries.delete(key);
      },
    };
  }

  #key(projectId, assetId, variantId, relative) {
    // Standard-scheme hosts are case-insensitive; use the allocator's same project namespace.
    return JSON.stringify([projectId.toLowerCase(), assetId, variantId, relative]);
  }

  async response(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const url = new URL(request.url);
    if (url.protocol !== `${SCHEME}:`) return new Response(null, { status: 404 });
    const host = decodeURIComponent(url.hostname);
    if (!host.startsWith(PROJECT_HOST_PREFIX)) return new Response(null, { status: 404 });
    const parts = url.pathname.slice(1).split('/').map(decodeURIComponent);
    if (parts.length < 3) return new Response(null, { status: 404 });
    const entry = this.#entries.get(this.#key(host.slice(PROJECT_HOST_PREFIX.length), parts[0], parts[1], parts.slice(2).join('/')));
    if (!entry) return new Response(null, { status: 404 });
    let size;
    try { size = (await stat(entry.path)).size; }
    catch { return new Response(null, { status: 404 }); }
    const rangeHeader = request.headers.get('range');
    const range = parseByteRange(rangeHeader, size);
    if (rangeHeader && !range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const headers = {
      'content-type': entry.mime,
      'access-control-allow-origin': '*',
      'accept-ranges': 'bytes',
      'content-length': String(range ? end - start + 1 : size),
      ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
    };
    if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
    const stream = createReadStream(entry.path, range ? { start, end } : undefined);
    return new Response(Readable.toWeb(stream), { status: range ? 206 : 200, headers });
  }

  install(protocol) {
    protocol.handle(SCHEME, request => this.response(request));
  }
}
