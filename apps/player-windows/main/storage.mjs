import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { commitFiles, recoverTransactions } from '@galcraft/documents';

function ok(value) { return { ok: true, value, warnings: [] }; }
function fail(code, message) {
  const error = { code, severity: 'error', message, owner: 'M07', related: [], actions: ['retry'] };
  return { ok: false, error, issues: [error] };
}

const keyPattern = /^player\/([0-9a-f-]{36}|[A-Za-z0-9]{6})\/(player|playtest|candidate|sample)\/([^/]+)\/(revision|index|longTerm|preferences|currentMainStory|(?:records|thumbnails)\/(?:[0-9a-f-]{36}|[A-Za-z0-9]{6}))$/;

function parseKey(key) {
  const match = keyPattern.exec(key);
  if (!match) throw new Error(`Invalid player storage key: ${key}`);
  const instance = decodeURIComponent(match[3]);
  if (encodeURIComponent(instance) !== match[3]) throw new Error(`Invalid player storage instance: ${key}`);
  const domain = { projectId: match[1], kind: match[2], instance };
  const path = `profiles/${domain.projectId}/${domain.kind}/${Buffer.from(instance).toString('base64url')}/${match[4]}.b64`;
  return { domain, path, suffix: match[4] };
}

function sameDomain(left, right) {
  return left.projectId === right.projectId && left.kind === right.kind && left.instance === right.instance;
}

export class WindowsPlayerStorage {
  #queue = Promise.resolve();

  constructor(root) { this.root = root; }

  #run(action) {
    const next = this.#queue.then(action, action);
    this.#queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async #ready() {
    await mkdir(this.root, { recursive: true });
    if (await recoverTransactions(this.root) !== 'ready') throw new Error('Player data recovery is pending');
  }

  async #read(path) {
    try { return new Uint8Array(Buffer.from(await readFile(join(this.root, ...path.split('/')), 'utf8'), 'base64')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  read(key) {
    return this.#run(async () => {
      try {
        const entry = parseKey(key);
        await this.#ready();
        return ok(await this.#read(entry.path));
      } catch (error) { return fail('STORAGE_READ', String(error)); }
    });
  }

  commit(batch) {
    return this.#run(async () => {
      try {
        await this.#ready();
        const prefix = `player/${batch.domain.projectId}/${batch.domain.kind}/${encodeURIComponent(batch.domain.instance)}/`;
        const revisionKey = `${prefix}revision`;
        const entries = batch.writes.map(item => ({ ...parseKey(item.key), bytes: item.bytes, key: item.key }));
        const deletes = batch.deletes.map(key => ({ ...parseKey(key), key }));
        if ([...entries, ...deletes].some(entry => !entry.key.startsWith(prefix) || !sameDomain(entry.domain, batch.domain)))
          return fail('STORAGE_DOMAIN', '资料写入跨越当前资料域');
        if (new Set([...entries, ...deletes].map(entry => entry.key)).size !== entries.length + deletes.length)
          return fail('STORAGE_DUPLICATE', '资料批次包含重复键');
        const revisionWrite = entries.find(entry => entry.key === revisionKey);
        if (!revisionWrite || JSON.parse(Buffer.from(revisionWrite.bytes).toString('utf8')) !== batch.expectedRevision + 1)
          return fail('STORAGE_REVISION', '资料批次未写入下一版本');
        const revisionPath = parseKey(revisionKey).path;
        const current = await this.#read(revisionPath);
        const storedRevision = current === null ? 0 : JSON.parse(Buffer.from(current).toString('utf8'));
        if (storedRevision !== batch.expectedRevision) return fail('STORAGE_STALE', '资料已由另一批次更新');
        const changes = [
          ...entries.filter(entry => entry.suffix !== 'index' && entry.suffix !== 'revision')
            .map(entry => ({ path: entry.path, documentId: batch.domain.projectId,
              revision: storedRevision + 1, content: Buffer.from(entry.bytes).toString('base64') })),
          ...deletes.map(entry => ({ path: entry.path, documentId: batch.domain.projectId,
            revision: storedRevision + 1, content: null })),
          ...entries.filter(entry => entry.suffix === 'index' || entry.suffix === 'revision')
            .map(entry => ({ path: entry.path, documentId: batch.domain.projectId,
              revision: storedRevision + 1, content: Buffer.from(entry.bytes).toString('base64') })),
        ];
        await commitFiles(this.root, batch.domain.projectId, changes);
        return ok({ revision: storedRevision + 1 });
      } catch (error) { return fail('STORAGE_COMMIT', String(error)); }
    });
  }
}
