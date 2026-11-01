import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startStudioService } from './server.mjs';
import { createNodeStudioHost } from './host.mjs';

// Starts a real isolated Web host for the companion, interactive browser acceptance.
const root = resolve(import.meta.dirname, '../../..');
const evidence = join(root, 'test-results/latest/music-workflow-ports/actual-workflow-ui');
await mkdir(evidence, { recursive: true });
const profiles = join(root, 'tmp/testing/user-data');
const projects = join(root, 'tmp/testing/projects/a');
await mkdir(profiles, { recursive: true });
await mkdir(projects, { recursive: true });
const userData = await mkdtemp(join(profiles, 'workflow-ui-'));
const projectDirectory = await mkdtemp(join(projects, 'workflow-ui-'));
const apiGraph = {
  '1': { class_type: 'CLIPTextEncode', inputs: { text: 'Local acceptance input only' }, _meta: { title: '画面描述' } },
  '2': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 }, _meta: { title: '画布与数量' } },
  '3': { class_type: 'SaveImage', inputs: { images: ['2', 0], filename_prefix: 'workflow-ui-acceptance' }, _meta: { title: '保存图像' } },
};
await writeFile(join(evidence, 'api-graph.json'), JSON.stringify(apiGraph, null, 2));
const service = await startStudioService({ userData, createHost: createNodeStudioHost, frontendDirectory: join(root, 'apps/studio/dist') });
assert.equal(service.reused, false);
const call = async (group, method, ...args) => {
  const response = await fetch(`${service.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group, method, args, clientId: 'workflow-ui-setup', entry: 'browser' }) });
  const result = await response.json();
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
try {
  const project = await call('projects', 'create', { path: projectDirectory, name: '工作流配置实际宿主验收', template: 'light', width: 960, height: 540, engineVersion: '0.1.0' });
  const run = { origin: service.origin, pid: process.pid, userData, projectDirectory, project, frontendDirectory: join(root, 'apps/studio/dist'), node: process.version, platform: process.platform, startedAt: new Date().toISOString() };
  await writeFile(join(evidence, 'host-run.json'), JSON.stringify(run, null, 2));
  console.log(JSON.stringify(run));
  const stop = join(evidence, `stop-${process.pid}.request`);
  while (true) {
    try { await access(stop); break; } catch { /* Wait only for this run's own stop request. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
} finally {
  await service.close();
  await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ pid: process.pid, origin: service.origin, stoppedAt: new Date().toISOString(), activeRecordRemoved: await readFile(join(userData, 'studio-service/active.json'), 'utf8').then(() => false, error => error.code === 'ENOENT') }, null, 2));
}
