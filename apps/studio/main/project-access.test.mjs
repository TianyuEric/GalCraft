import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectAccess } from './project-access.mjs';

const root = join(process.cwd(), '..', '..', 'tmp', 'testing', 'host-project-access');
const directory = join(root, '中文 空格');
const projectId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';

beforeAll(async () => { await mkdir(directory, { recursive: true }); });
afterAll(async () => { await rmdir(directory); await rmdir(root); });

describe('project directory attachment', () => {
  it('preserves a selected Chinese path and permits a validated recent path without reselection', async () => {
    const access = new ProjectAccess();
    await access.attach({ projectId, sessionId, path: directory, resolveEntityDirectory: ref => ref.id === assetId ? join(directory, 'assets') : null });
    expect(access.wasSelected(directory)).toBe(false);
    expect(access.getRoot(sessionId)).toBe(directory);
    expect(await access.resolveEntityDirectory({ kind: 'project', id: projectId })).toBe(directory);
    expect(await access.resolveEntityDirectory({ kind: 'asset', id: assetId })).toBe(join(directory, 'assets'));
    expect(await access.approveDirectory(directory)).toBe(directory);
    expect(access.wasSelected(directory)).toBe(true);
    access.release(sessionId);
    expect(access.getRoot(sessionId)).toBeNull();
  });
});
