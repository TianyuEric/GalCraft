import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { IdSchema, ProjectSchema, normalizeProjectAuthoringData } from '@galcraft/contracts';
import { fail, ok } from './result.mjs';

const key = directory => process.platform === 'win32' ? resolve(directory).toLowerCase() : resolve(directory);

/** Personal project index shared by the start page and backup/restore registration. */
export class StudioProjectLibrary {
  constructor({ userData }) {
    this.userData = userData;
    this.path = join(userData, 'recent-projects.json');
    this.pending = Promise.resolve();
  }
  async capture() {
    await this.pending;
    return this.read();
  }
  async read() {
    try {
      const records = JSON.parse(await readFile(this.path, 'utf8'));
      if (!Array.isArray(records)) throw new Error('作品列表格式无效');
      return records.filter(item => typeof item.directory === 'string' && IdSchema.safeParse(item.projectId).success);
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async write(records) {
    await mkdir(this.userData, { recursive: true });
    await writeFile(`${this.path}.tmp`, JSON.stringify(records, null, 2) + '\n');
    await rename(`${this.path}.tmp`, this.path);
  }
  update(change) {
    const operation = this.pending.then(async () => this.write(await change(await this.read())));
    this.pending = operation.catch(() => {});
    return operation;
  }
  restore(records) { return this.update(() => records); }
  async metadata(directory, previous = {}) {
    const root = resolve(directory);
    const entry = { projectId: previous.projectId, directory: root, name: previous.name || basename(root),
      description: previous.description ?? '', engineVersion: previous.engineVersion ?? '',
      lastOpenedAt: previous.lastOpenedAt ?? null, pinned: previous.pinned === true };
    try {
      const record = JSON.parse(await readFile(join(root, 'project.json'), 'utf8'));
      if (record.schemaVersion !== 1 || !IdSchema.safeParse(record.documentId).success) throw new Error('Invalid project document');
      const project = ProjectSchema.parse(normalizeProjectAuthoringData(record.data));
      return { ...entry, projectId: project.projectId, name: project.name, description: project.description,
        engineVersion: project.engineVersion, status: /** @type {const} */ ('available') };
    } catch (error) {
      return { ...entry, status: error.code === 'ENOENT' ? /** @type {const} */ ('missing') : /** @type {const} */ ('invalid') };
    }
  }
  async register({ projectId, directory }) {
    return this.update(async records => {
      const previous = records.find(item => key(item.directory) === key(directory));
      const entry = await this.metadata(directory, { ...previous, projectId, lastOpenedAt: new Date().toISOString() });
      const { status, ...stored } = entry;
      return [stored, ...records.filter(item => key(item.directory) !== key(directory))];
    });
  }
  async listRecent() {
    try {
      const records = await this.capture();
      const entries = await Promise.all(records.map(item => this.metadata(item.directory, item)));
      return ok(entries.sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '')));
    } catch (error) { return fail('PROJECT_LIBRARY_READ', String(error), 'M01'); }
  }
  async inspect(directory) {
    const entry = await this.metadata(directory);
    return entry.status === 'available' ? ok(entry) : fail(entry.status === 'missing' ? 'PROJECT_PATH_MISSING' : 'PROJECT_INVALID',
      entry.status === 'missing' ? '找不到作品目录或 project.json，请重新定位。' : '所选目录没有有效的 GalCraft 作品配置。', 'M02');
  }
  async setPinned({ directory, pinned }) {
    try {
      await this.update(records => records.map(item => key(item.directory) === key(directory) ? { ...item, pinned } : item));
      return ok(undefined);
    } catch (error) { return fail('PROJECT_LIBRARY_WRITE', String(error), 'M01'); }
  }
  async forget(directory) {
    try {
      await this.update(records => records.filter(item => key(item.directory) !== key(directory)));
      return ok(undefined);
    } catch (error) { return fail('PROJECT_LIBRARY_WRITE', String(error), 'M01'); }
  }
  async relocate({ directory, replacement }) {
    const inspected = await this.inspect(replacement);
    if (!inspected.ok) return inspected;
    let mismatch = false;
    try {
      await this.update(records => {
        const previous = records.find(item => key(item.directory) === key(directory));
        if (!previous || previous.projectId !== inspected.value.projectId) { mismatch = true; return records; }
        const { status, ...entry } = { ...inspected.value, pinned: previous.pinned === true, lastOpenedAt: previous.lastOpenedAt ?? null };
        return [entry, ...records.filter(item => ![key(directory), key(replacement)].includes(key(item.directory)))];
      });
      return mismatch ? fail('PROJECT_ID_MISMATCH', '该目录不是原作品，请选择原作品的新位置；其他作品请使用“打开作品”。', 'M02') : ok(undefined);
    } catch (error) { return fail('PROJECT_LIBRARY_WRITE', String(error), 'M01'); }
  }
}
