import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rm, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve, dirname, sep, extname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { Readable } from 'node:stream';
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { endpointPort, listenLocalService, requireServicePort, servicePort, STUDIO_WEB_PORT } from '../main/local-service-ports.mjs';

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
};
const errorResult = (code, message) => {
  const error = { code, message, severity: 'error', owner: 'M01', related: [], actions: ['retry'] };
  return { ok: false, error, issues: [error] };
};
const readJson = async request => {
  const chunks = []; let length = 0;
  for await (const chunk of request) { length += chunk.length; if (length > 32 * 1024 * 1024) throw new Error('Studio request exceeds 32 MiB'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const mutations = new Set(['create', 'open', 'switch', 'close', 'copy', 'applyEdit', 'applyDiscard', 'undo', 'redo', 'save', 'recover', 'resolveConflict', 'resolveRecoveryConflict', 'commitRestore', 'import', 'rename', 'applyBatchRename', 'remove', 'confirmBackground', 'saveAnimation', 'editTypeData', 'submit', 'resume', 'retry', 'cancel', 'select', 'apply', 'keepResults', 'editCandidate', 'saveOutline', 'saveImageRoutes', 'install', 'commit']);

export async function readActiveService(userData) {
  try {
    const record = JSON.parse(await readFile(join(userData, 'studio-service', 'active.json'), 'utf8'));
    if (!alive(record.pid)) return null;
    const url = new URL(record.origin);
    if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') return null;
    const response = await fetch(`${record.origin}/api/status`, { signal: AbortSignal.timeout(2000) });
    const status = await response.json();
    return response.ok && status.pid === record.pid && status.userData === resolve(userData) ? { ...record, status } : null;
  } catch { return null; }
}

/** Acquires the personal-directory owner before constructing any domain service. */
export async function startStudioService({ userData, createHost, frontendDirectory, port }) {
  port = servicePort(port);
  userData = resolve(userData);
  const directory = join(userData, 'studio-service'), lock = join(directory, 'owner');
  await mkdir(directory, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try { await mkdir(lock); await writeFile(join(lock, 'pid'), String(process.pid)); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const active = await readActiveService(userData);
      if (active) { requireServicePort(port, active.origin); return { ...active, reused: true, close: async () => {} }; }
      let owner;
      try { owner = Number(await readFile(join(lock, 'pid'), 'utf8')); } catch {}
      if (owner && !alive(owner)) { await rm(lock, { recursive: true, force: true }); continue; }
      if (attempt >= 200) throw new Error('Studio service is still starting. Check its process or retry.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  const events = new EventEmitter(), clients = new Set(), context = new AsyncLocalStorage();
  const dialogs = new Map(); let nextDialog = 0, host, assembly, origin, addressChange, stopping = false;
  const pending = new Set();
  const publish = (event, data, clientId, excludeClient) => {
    events.emit(event, data);
    const message = `event: ${event}\ndata: ${JSON.stringify(data ?? null)}\n\n`;
    for (const client of clients) if ((!clientId || client.id === clientId) && client.id !== excludeClient) client.response.write(message);
  };
  const requestDialog = options => {
    const clientId = context.getStore()?.clientId;
    if (!clientId || ![...clients].some(client => client.id === clientId)) throw new Error('Open Studio to choose a local file or directory.');
    return new Promise(resolve => { const id = ++nextDialog; dialogs.set(id, { resolve, clientId }); publish('dialog', { id, ...options }, clientId); });
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (request.headers.host !== new URL(origin).host || request.headers.origin && request.headers.origin !== origin) {
        json(response, 403, errorResult('HOST_ORIGIN_REJECTED', 'Use the active local Studio address.')); return;
      }
      if (url.pathname === '/api/status' && request.method === 'GET') {
        json(response, 200, { pid: process.pid, userData, origin, addressChange, state: stopping ? 'stopping' : 'running',
          project: host?.projects?.currentSession ? { projectId: host.projects.currentSession.projectId, sessionId: host.projects.currentSessionId, directory: host.projects.currentRoot } : null }); return;
      }
      if (stopping) { json(response, 503, errorResult('SERVICE_STOPPING', 'Studio is saving recovery data and stopping.')); return; }
      if (url.pathname === '/api/methods' && request.method === 'GET') { json(response, 200, Object.fromEntries(Object.entries(host.handlers).map(([group, methods]) => [group, Object.keys(methods)]))); return; }
      if (url.pathname === '/api/events' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        response.write(': connected\n\n');
        const client = { id: url.searchParams.get('client'), response }; clients.add(client);
        const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15000);
        request.on('close', () => { clearInterval(heartbeat); clients.delete(client); for (const [id, dialog] of dialogs) if (dialog.clientId === client.id) { dialogs.delete(id); dialog.resolve({ canceled: true, filePaths: [] }); } }); return;
      }
      if (request.method === 'POST' && !request.headers['content-type']?.startsWith('application/json')) { json(response, 415, errorResult('JSON_REQUIRED', 'Use a JSON Studio request.')); return; }
      if(url.pathname==='/api/desktop-runtime'&&request.method==='POST'){
        const input=await readJson(request);if(typeof input.executablePath!=='string'||!isAbsolute(input.executablePath)||typeof input.appDirectory!=='string')throw new Error('The desktop runtime requires its absolute executable path.');
        process.env.GALCRAFT_ELECTRON_PATH=input.executablePath;process.env.GALCRAFT_ELECTRON_APP=input.appDirectory;json(response,200,{ready:true});return;
      }
      if (url.pathname === '/api/files/list' && request.method === 'POST') {
        const input = await readJson(request);
        if (input.directory !== null && typeof input.directory !== 'string') { json(response, 400, { error: 'A local directory path is required.' }); return; }
        const directory = resolve(input.directory ?? homedir());
        const entries = (await readdir(directory, { withFileTypes: true })).map(entry => ({ name: entry.name, path: join(directory, entry.name), kind: entry.isDirectory() ? 'directory' : 'file' }));
        entries.sort((left, right) => Number(right.kind === 'directory') - Number(left.kind === 'directory') || left.name.localeCompare(right.name));
        json(response, 200, { directory, parent: dirname(directory) === directory ? null : dirname(directory), entries }); return;
      }
      if (url.pathname === '/api/bridge' && request.method === 'POST') {
        const { group, method, args, clientId, entry } = await readJson(request);
        if (!Object.hasOwn(host.handlers, group) || !Object.hasOwn(host.handlers[group], method) || !Array.isArray(args)) {
          json(response, 404, errorResult('UNKNOWN_HOST_OPERATION', 'Unknown Studio operation.')); return;
        }
        const work = context.run({ clientId, entry: entry === 'browser' ? 'browser' : 'desktop' }, () => host.call(group, method, ...args)); pending.add(work);
        let result; try { result = await work; } finally { pending.delete(work); }
        if (result.ok && mutations.has(method) && !['authoringPreferences', 'language', 'engines', 'files', 'operations', 'service'].includes(group)) {
          publish(group === 'projects' ? 'studio:collaborationNavigate' : 'studio:collaborationChanged', group === 'projects' ? { page: 'creation', projectChanged: true } : undefined, undefined, clientId);
        }
        json(response, 200, result); return;
      }
      if (url.pathname === '/api/dialog' && request.method === 'POST') {
        const { id, clientId, value } = await readJson(request), dialog = dialogs.get(id);
        if (!dialog || dialog.clientId !== clientId) { json(response, 404, { error: 'Dialog is no longer pending.' }); return; }
        dialogs.delete(id); dialog.resolve(value); json(response, 200, { ok: true }); return;
      }
      if (url.pathname === '/api/stop' && request.method === 'POST') { json(response, 200, { ok: true }); setImmediate(() => void close()); return; }
      if (url.pathname.startsWith('/resources/') && assembly?.resources) {
        const resourceUrl = `galcraft-resource://${url.pathname.slice('/resources/'.length)}${url.search}`;
        const resource = await assembly.resources.response(new Request(resourceUrl, { method: request.method, headers: request.headers }));
        response.writeHead(resource.status, Object.fromEntries(resource.headers));
        if (resource.body) Readable.fromWeb(resource.body).pipe(response); else response.end(); return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { json(response, 404, { error: 'Unknown Studio endpoint.' }); return; }
      if (!frontendDirectory) { json(response, 404, { error: 'Studio browser files are unavailable.' }); return; }
      const base = resolve(frontendDirectory), file = resolve(base, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!file.startsWith(`${base}${sep}`)) { response.writeHead(404); response.end(); return; }
      const info = await stat(file).catch(error => { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; throw error; });
      if (!info?.isFile()) { response.writeHead(404); response.end(); return; }
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }[extname(file)] ?? 'application/octet-stream';
      response.writeHead(200, { 'content-type': mime, 'content-length': info.size, 'cache-control': 'no-cache' });
      if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
    } catch (error) { if (!response.headersSent) json(response, 500, errorResult(error.code ?? 'SERVICE_REQUEST_FAILED', String(error.message ?? error))); else response.end(); }
  });
  let closing;
  function close() {
    return closing ??= (async () => {
      stopping = true; publish('studio:serviceStopping');
      for (const dialog of dialogs.values()) dialog.resolve({ canceled: true, filePaths: [] }); dialogs.clear();
      await assembly?.prepareStop?.();
      await Promise.allSettled([...pending]);
      await assembly?.close?.();
      for (const client of clients) client.response.end(); clients.clear();
      server.closeIdleConnections(); await new Promise(resolve => server.close(resolve));
      await rm(join(directory, 'active.json'), { force: true }); await rm(lock, { recursive: true, force: true });
    })();
  }
  try {
    let previous;
    for (const file of ['successful.json', 'active.json']) {
      try { previous = JSON.parse(await readFile(join(directory, file), 'utf8')); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const previousPort = previous ? servicePort(endpointPort(previous.origin)) : undefined;
    const selected = await listenLocalService(server, { port, previousPort, defaultPort: STUDIO_WEB_PORT });
    origin = `http://127.0.0.1:${server.address().port}`;
    const previousOrigin = previous?.origin ?? `http://127.0.0.1:${selected.requestedPort}`;
    if (previousOrigin !== origin) addressChange = { previous: previousOrigin, current: origin };
    assembly = await createHost({ origin, publish, events, requestDialog, requestContext: () => context.getStore(), userData }); host = assembly.host;
    const record = { pid: process.pid, userData, origin, ...(addressChange ? { addressChange } : {}) };
    await writeFile(join(directory, 'successful.json'), JSON.stringify({ origin, port: selected.port }));
    await writeFile(join(directory, 'active.json'), JSON.stringify(record));
    return { ...record, reused: false, host, events, close };
  } catch (error) { await new Promise(resolve => server.close(resolve)); await assembly?.close?.(); await rm(lock, { recursive: true, force: true }); throw error; }
}
