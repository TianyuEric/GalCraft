import { join } from 'node:path';
import { createId, type ConnectionConfig } from '@galcraft/contracts';
import { migrateConnection } from '@galcraft/generation-services/catalog';
import { readOptionalJson, writeJson } from './preference-files.mts';

type CredentialStorage = Pick<typeof import('electron').safeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'>;
type Configs = Record<string, ConnectionConfig>;
type Credentials = Record<string, string>;

export class ConnectionVault {
  readonly configPath: string;
  readonly secretPath: string;
  private readonly safeStorage?: CredentialStorage;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(userData: string, safeStorage?: CredentialStorage) {
    this.configPath = join(userData, 'connections.json');
    this.secretPath = join(userData, 'credentials.json');
    this.safeStorage = safeStorage;
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation);
    this.pending = result;
    return result;
  }

  private async migrate(): Promise<Configs> {
    const configs = await readOptionalJson<Configs>(this.configPath) ?? {};
    const next = Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, migrateConnection(config)]));
    if (JSON.stringify(configs) !== JSON.stringify(next)) {
      const backup = `${this.configPath}.before-services-v1.json`;
      if (await readOptionalJson(backup) === null) await writeJson(backup, configs);
      await writeJson(this.configPath, next);
    }
    return next;
  }

  list() {
    return this.run(async () => Object.values(await this.migrate()));
  }

  credential(id: string) {
    return this.run(async () => {
      const encrypted = (await readOptionalJson<Credentials>(this.secretPath))?.[id];
      return encrypted ? this.decrypt(encrypted) : null;
    });
  }

  private decrypt(encrypted: string) {
    if (!this.safeStorage) throw Object.assign(new Error('系统凭据加密不可用'), { code: 'CREDENTIALS_UNAVAILABLE' });
    return this.safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }

  save(config: ConnectionConfig, secret?: string) {
    return this.run(async () => {
      const configs = await readOptionalJson<Configs>(this.configPath) ?? {};
      const previous = configs[config.id];
      const revision = (previous?.revision ?? 0) + 1;
      if (config.revision !== undefined && config.revision !== revision) {
        throw Object.assign(new Error('连接版本已变化，请重新打开并合并修改。'), { code: 'CONNECTION_CONFLICT' });
      }
      let stored: ConnectionConfig = { ...config, revision, credentialId: config.credentialId ?? previous?.credentialId ?? null };
      let previousCredentials: Credentials | null = null;
      if (secret !== undefined) {
        if (!this.safeStorage?.isEncryptionAvailable()) throw Object.assign(new Error('系统凭据加密不可用'), { code: 'CREDENTIALS_UNAVAILABLE' });
        previousCredentials = await readOptionalJson<Credentials>(this.secretPath) ?? {};
        const shared = Object.values(configs).some(entry => entry.id !== config.id && entry.credentialId === stored.credentialId);
        const credentialId = shared || !stored.credentialId ? createId([configs, previousCredentials]) : stored.credentialId;
        const encrypted = this.safeStorage.encryptString(secret).toString('base64');
        await writeJson(this.secretPath, { ...previousCredentials, [credentialId]: encrypted });
        stored = { ...stored, credentialId };
      }
      try {
        await writeJson(this.configPath, { ...configs, [config.id]: stored });
      } catch (error) {
        if (previousCredentials) await writeJson(this.secretPath, previousCredentials);
        throw error;
      }
      return stored.id;
    });
  }

  read(connectionId: string) {
    return this.run(async () => {
      const config = (await this.migrate())[connectionId];
      if (!config) return null;
      const encrypted = config.credentialId ? (await readOptionalJson<Credentials>(this.secretPath))?.[config.credentialId] : undefined;
      if (config.credentialId && !encrypted) throw Object.assign(new Error('连接凭据不可用'), { code: 'CREDENTIALS_MISSING' });
      return { config, secret: encrypted ? this.decrypt(encrypted) : undefined };
    });
  }

  remove(connectionId: string) {
    return this.run(async () => {
      const configs = await readOptionalJson<Configs>(this.configPath) ?? {};
      const removed = configs[connectionId];
      if (!removed) throw new Error('连接不存在');
      delete configs[connectionId];
      await writeJson(this.configPath, configs);
      if (removed.credentialId && !Object.values(configs).some(config => config.credentialId === removed.credentialId)) {
        const credentials = await readOptionalJson<Credentials>(this.secretPath) ?? {};
        delete credentials[removed.credentialId];
        await writeJson(this.secretPath, credentials);
      }
    });
  }
}
