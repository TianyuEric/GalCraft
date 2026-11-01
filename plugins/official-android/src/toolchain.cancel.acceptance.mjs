import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadPluginServices } from '../../../packages/plugins/dist/registry/host.js';
const directory = resolve('plugins/official-android/package'), manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
const plugin = await loadPluginServices(directory, manifest), offered = await plugin.activate({ pluginId: manifest.id, target: 'android', domain: { kind: 'sample', projectId: 'Cancel', instance: 'sh6' }, documents: {}, assets: {}, pages: {}, log() {} });
const builder = offered.targetBuilders[0], selected = 'D:/GalCraftTools/sh6-cancel-download', progress = [];
try {
  await mkdir(selected, { recursive: true }); await writeFile(join(selected, 'author.txt'), 'preserved');
  const download = new AbortController();
  const cancelled = await builder.prepare({ directory: selected, acceptLicenses: true }, { signal: download.signal, progress: event => { progress.push(event); if (event.phase === 'downloading' && event.completed > 0) download.abort(); } });
  assert.equal(cancelled.error.code, 'BUILD_CANCELLED'); assert(progress.some(event => event.phase === 'downloading' && event.completed > 0));
  assert.equal(await readFile(join(selected, 'author.txt'), 'utf8'), 'preserved');
  const installed = new AbortController();
  const interrupted = await builder.prepare({ directory: 'D:/GalCraftTools', acceptLicenses: true }, { signal: installed.signal, progress: event => { if (event.phase === 'installing') installed.abort(); } });
  assert.equal(interrupted.error.code, 'BUILD_CANCELLED');
  const detected = await builder.detect({ directory: 'D:/GalCraftTools' }); assert.equal(detected.ok, true);
  await writeFile('test-results/sh6-mobile/toolchain-cancel.json', JSON.stringify({ result: 'passed', cancelledDownload: cancelled.error.code, downloadedBytes: progress.find(event => event.phase === 'downloading' && event.completed > 0).completed,
    unrelatedFile: 'preserved', cancelledInstaller: interrupted.error.code, completedComponentsReusable: detected, m10Requests: 0 }, null, 2));
  console.log('Actual SDK download and installer cancellation passed; existing SDK remains usable.');
} finally { await plugin.deactivate(); }
