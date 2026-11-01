import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const directory = dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm' };

function byteRange(value, total) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !match[1] && !match[2]) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < total && end >= start && (match[1] || Number(match[2]) > 0) ? { start, end } : null;
}

/** Self-contained release helper: no project dependencies or network installation. */
export async function startPreview({ openBrowser = true } = {}) {
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const file = resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname)), part = relative(directory, file);
      if (part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) { response.writeHead(404).end(); return; }
      const details = await stat(file); if (!details.isFile()) { response.writeHead(404).end(); return; }
      const range = request.headers.range ? byteRange(request.headers.range, details.size) : null;
      if (request.headers.range && !range) { response.writeHead(416, { 'content-range': `bytes */${details.size}` }).end(); return; }
      response.writeHead(range ? 206 : 200, { 'content-type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': range ? range.end - range.start + 1 : details.size, 'accept-ranges': 'bytes',
        ...(range ? { 'content-range': `bytes ${range.start}-${range.end}/${details.size}` } : {}) });
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = createReadStream(file, range ?? undefined);
      stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  const listen = port => new Promise((accept, reject) => {
    const failed = error => { server.removeListener('listening', ready); reject(error); };
    const ready = () => { server.removeListener('error', failed); accept(); };
    server.once('error', failed); server.once('listening', ready); server.listen(port, '127.0.0.1');
  });
  // A stable preferred origin retains browser saves between preview sessions.
  try { await listen(4173); }
  catch (error) { if (error.code !== 'EADDRINUSE') throw error; await listen(0); }
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`GalCraft local preview: ${url}\nKeep this window open. Press Ctrl+C or close the window to stop.`);
  if (openBrowser) {
    const [command, args] = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] :
      process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const browser = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log(`Open this address in your browser: ${url}`));
  }
  return { server, url };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  startPreview({ openBrowser: !process.argv.includes('--no-open') }).catch(error => { console.error(`Unable to start local preview: ${error.message}`); process.exitCode = 1; });
}
