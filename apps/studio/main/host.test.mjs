import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { StudioHost } from './host.mjs';

const userData = join(process.cwd(), '..', '..', 'tmp', 'testing', 'host-studio-user-data');
const projectId = '11111111-1111-4111-8111-111111111111';
let host;

beforeAll(async () => {
  await mkdir(userData, { recursive: true });
  host = new StudioHost({
    userData, window: {}, shell: { openPath: async () => '' },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(`encrypted:${text}`), decryptString: data => data.toString().slice('encrypted:'.length) },
  });
});
afterAll(async () => { await rm(userData, { recursive: true, force: true }); });

describe('Studio host boundaries', () => {
  it('returns null on native directory cancellation and keeps user preferences outside a project', async () => {
    expect(await host.call('projects', 'chooseDirectory')).toEqual({ ok: true, value: null, warnings: [] });
    expect(await host.call('authoringPreferences', 'readWorkspace', projectId)).toEqual({ ok: true, value: null, warnings: [] });
    const guides = await host.call('authoringPreferences', 'readStageGuides', projectId);
    expect(guides.value).toMatchObject({ projectId, center: false });
    expect((await host.call('files', 'pickAssets')).value).toEqual([]);
  });

  it('offers exported recipe JSON through a dedicated file dialog', async () => {
    let options;
    const previous = host.dialog.showOpenDialog;
    host.dialog.showOpenDialog = async (_window, input) => { options = input; return { canceled: false, filePaths: ['D:/recipes.galrecipe.json'] }; };
    try {
      expect((await host.call('files', 'pickRecipes')).value).toEqual(['D:/recipes.galrecipe.json']);
      expect(options.filters[0].extensions).toContain('json');
      expect(options.properties).toEqual(['openFile']);
    } finally { host.dialog.showOpenDialog = previous; }
  });

  it('selects only project backup files and keeps cancellation empty', async () => {
    let options;
    const previous = host.dialog.showOpenDialog;
    host.dialog.showOpenDialog = async (_window, input) => { options = input; return { canceled: false, filePaths: ['D:/故事.galproject'] }; };
    try {
      expect((await host.call('projects', 'chooseBackupFile')).value).toBe('D:/故事.galproject');
      expect(options.filters[0].extensions).toEqual(['galproject']);
      expect(options.properties).toEqual(['openFile']);
      host.dialog.showOpenDialog = previous;
      expect((await host.call('projects', 'chooseBackupFile')).value).toBeNull();
    } finally { host.dialog.showOpenDialog = previous; }
  });

  it('keeps credentials encrypted and checks the selected purpose before delegating', async () => {
    const config = {
      id: '22222222-2222-4222-8222-222222222222', revision: 0, name: '本地连接', protocol: 'comfyUI', baseUrl: 'http://127.0.0.1:8188',
      credentialId: null, auth: 'bearer', apiKeyHeader: null, model: 'test', purposes: ['image'],
      timeoutSecByPurpose: { text: 120, image: 600, difference: 600, speech: 600, music: 600, matting: 600 },
      concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null,
    };
    const saved = await host.call('connections', 'save', config, 'private-key');
    expect(saved.ok).toBe(true);
    const selected = { connectionId: config.id, purpose: 'text', imageUsage: null, workflowBindingId: null, model: 'test' };
    expect((await host.call('connections', 'test', selected)).error.code).toBe('PURPOSE_UNSUPPORTED');
    const readBack = await host.connections.read(config.id);
    expect(readBack.secret).toBe('private-key');
    expect(readBack.config).not.toHaveProperty('secret');
  });
});
