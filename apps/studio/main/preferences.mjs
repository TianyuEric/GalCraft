import { rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DefaultStudioPreferences, IdSchema, StageGuidePreferencesSchema, StudioPreferencesSchema, WorkspaceResumeSchema, AuthoringInputDraftSchema } from '@galcraft/contracts';
import { readOptionalJson, writeJson } from './preference-files.mts';
export { ConnectionVault } from './connection-vault.mts';

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
