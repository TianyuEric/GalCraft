import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { RelativePathSchema } from '@galcraft/contracts';
import { parseByteRange } from '@galcraft/media-tools/resources';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.gca': 'application/vnd.galcraft.animation+json', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
export async function serveRelease(directory) {
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname.slice(1)) || 'index.html';
      if (!RelativePathSchema.safeParse(path).success) { response.writeHead(404).end(); return; }
      const file = join(directory, path), details = await stat(file);
      if (!details.isFile()) { response.writeHead(404).end(); return; }
      const range = parseByteRange(request.headers.range, details.size);
      if (request.headers.range && !range) { response.writeHead(416, { 'content-range': `bytes */${details.size}` }).end(); return; }
      response.writeHead(range ? 206 : 200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'accept-ranges': 'bytes',
        'content-length': range ? range.end - range.start + 1 : details.size, ...(range ? { 'content-range': `bytes ${range.start}-${range.end}/${details.size}` } : {}) });
      if (request.method === 'HEAD') response.end(); else createReadStream(file, range ?? undefined).on('error', () => response.destroy()).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
