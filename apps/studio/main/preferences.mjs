import { migrateConnection } from '@galcraft/generation-services/catalog';
import { createId } from '@galcraft/contracts';
import { mkdir, readFile, rename, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { DefaultStudioPreferences, IdSchema, StageGuidePreferencesSchema, StudioPreferencesSchema, WorkspaceResumeSchema, AuthoringInputDraftSchema } from '@galcraft/contracts';

async function readOptionalJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  const staged = `${path}.${createId()}.tmp`;
  try {
    await writeFile(staged, JSON.stringify(value), 'utf8');
    await rename(staged, path);
  } catch (error) {
    await rm(staged, { force: true });
    throw error;
  }
}

export class AuthoringPreferences {
  constructor(userData) { this.root = join(userData, 'authoring-preferences'); this.preferencesPath = join(userData, 'preferences.json'); this.draftWrites = Promise.resolve(); }
  /** @param {{projectId: string, entry: 'desktop' | 'browser', clientId?: string}} input */
  async readInputDraft({ projectId, entry, clientId }) {
    if (!['desktop', 'browser'].includes(entry)) throw new Error('Unknown Studio entry');
    await this.draftWrites;
    const directory = join(this.root, 'input-drafts', entry, IdSchema.parse(projectId));
    if (clientId) {
      const own = await readOptionalJson(join(directory, `${IdSchema.parse(clientId)}.json`));
      if (own !== null) return AuthoringInputDraftSchema.parse(own);
    }
    const legacy = await readOptionalJson(this.path(`input-drafts/${entry}`, projectId));
    const records = legacy ? [AuthoringInputDraftSchema.parse(legacy)] : [];
    for (const file of await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
      if (file.endsWith('.json')) records.push(AuthoringInputDraftSchema.parse(await readOptionalJson(join(directory, file))));
    }
    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  }
  async writeInputDraft(value) {
    const record = AuthoringInputDraftSchema.parse(value);
    const path = record.clientId ? join(this.root, 'input-drafts', record.entry, record.projectId, `${record.clientId}.json`) : this.path(`input-drafts/${record.entry}`, record.projectId);
    const write = this.draftWrites.catch(() => {}).then(() => writeJson(path, record)); this.draftWrites = write;
    await write;
  }
  async readPreferences() {
    const value = await readOptionalJson(this.preferencesPath);
    if (value === null) return structuredClone(DefaultStudioPreferences);
    const preferences = StudioPreferencesSchema.parse(value);
    if (value.palette !== preferences.palette) await this.writePreferences(preferences);
    return preferences;
  }
  async writePreferences(value) { await writeJson(this.preferencesPath, StudioPreferencesSchema.parse(value)); }
  path(kind, projectId) { return join(this.root, kind, `${IdSchema.parse(projectId)}.json`); }
  async readWorkspace(projectId) {
    const value = await readOptionalJson(this.path('workspace', projectId));
    return value === null ? null : WorkspaceResumeSchema.parse(value);
  }
  async writeWorkspace(value) {
    const record = WorkspaceResumeSchema.parse(value);
    await writeJson(this.path('workspace', record.projectId), record);
  }
  async clearWorkspace(projectId) { await rm(this.path('workspace', projectId), { force: true }); }
  async readStageGuides(projectId) {
    const value = await readOptionalJson(this.path('stage-guides', projectId));
    return value === null ? { schemaVersion: /** @type {const} */ (1), projectId, uiBounds: false, center: false, thirds: false } : StageGuidePreferencesSchema.parse(value);
  }
  async writeStageGuides(value) {
    const record = StageGuidePreferencesSchema.parse(value);
    await writeJson(this.path('stage-guides', record.projectId), record);
  }
}

export class ConnectionVault {
  constructor(userData, safeStorage) {
    this.configPath = join(userData, 'connections.json');
    this.secretPath = join(userData, 'credentials.json');
    this.safeStorage = safeStorage;
  }

  async migrate() {
    const configs = (await readOptionalJson(this.configPath)) ?? {};
    const next = Object.fromEntries(Object.entries(configs).map(([id,value])=>[id,migrateConnection(value)]));
    if(JSON.stringify(configs)!==JSON.stringify(next)) {
      const backup = `${this.configPath}.before-services-v1.json`;
      if(await readOptionalJson(backup)===null)await writeJson(backup,configs);
      await writeJson(this.configPath,next);
    }
    return next;
  }
  async list() { return Object.values(await this.migrate()); }
  async credential(id) {
    const credentials = (await readOptionalJson(this.secretPath)) ?? {};
    return credentials[id] ? this.safeStorage.decryptString(Buffer.from(credentials[id], 'base64')) : null;
  }

  async save(config, secret) {
    const configs = (await readOptionalJson(this.configPath)) ?? {};
    let stored = { ...config, credentialId: config.credentialId ?? configs[config.id]?.credentialId ?? null };
    if (secret !== undefined) {
      if (!this.safeStorage.isEncryptionAvailable()) throw Object.assign(new Error('系统凭据加密不可用'), { code: 'CREDENTIALS_UNAVAILABLE' });
      const credentials = (await readOptionalJson(this.secretPath)) ?? {};
      const shared = Object.values(configs).some(entry => entry.id !== config.id && entry.credentialId === stored.credentialId);
      const credentialId = shared ? createId([configs, credentials]) : stored.credentialId ?? createId([configs, credentials]);
      credentials[credentialId] = this.safeStorage.encryptString(secret).toString('base64');
      await writeJson(this.secretPath, credentials);
      stored = { ...stored, credentialId };
    }
    configs[config.id] = stored;
    await writeJson(this.configPath, configs);
    return stored.id;
  }

  async read(connectionId) {
    const configs = (await readOptionalJson(this.configPath)) ?? {};
    const config = (await this.migrate())[connectionId];
    if (!config) return null;
    const credentials = config.credentialId ? ((await readOptionalJson(this.secretPath)) ?? {}) : {};
    const encrypted = config.credentialId ? credentials[config.credentialId] : undefined;
    if (config.credentialId && !encrypted) throw Object.assign(new Error('连接凭据不可用'), { code: 'CREDENTIALS_MISSING' });
    const secret = encrypted ? this.safeStorage.decryptString(Buffer.from(encrypted, 'base64')) : undefined;
    return { config, secret };
  }

  async remove(connectionId) {
    const configs = (await readOptionalJson(this.configPath)) ?? {};
    const removed = configs[connectionId];
    if (!removed) throw new Error('连接不存在');
    delete configs[connectionId];
    await writeJson(this.configPath, configs);
    if (removed.credentialId && !Object.values(configs).some(config => config.credentialId === removed.credentialId)) {
      const credentials = (await readOptionalJson(this.secretPath)) ?? {};
      delete credentials[removed.credentialId];
      await writeJson(this.secretPath, credentials);
    }
  }
}
