import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builder } from './services.mjs';
test('Xcode export carries source, schema-complete project, assets, shared runtime and selected identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-ios-')); await mkdir(join(root, 'game')); await writeFile(join(root, 'index.html'), '<html><head></head></html>'); await writeFile(join(root, 'game/snapshot.json'), '{"projectId":"Game01"}');
  await writeFile(join(root, 'release.manifest.json'), JSON.stringify({ files: [] }));
  const result = await builder.build({ plan: { input: { releaseVersion: '0.1.0' } }, project: { projectId: 'Game01', name: 'My & Story' }, stagingDirectory: root, webEntry: 'index.html', options: { bundleId: 'org.example.story', buildNumber: '12', output: 'xcodeProject' } }, { signal: new AbortController().signal, progress() {} });
  assert.equal(result.ok, true, JSON.stringify(result));
  for (const path of ['GalCraftPlayer/Player.swift', 'GalCraftPlayer/Game/game/snapshot.json', 'GalCraftPlayer/Game/mobile-host.js', 'GalCraftPlayer.xcodeproj/project.pbxproj', 'GalCraftPlayer.xcodeproj/xcshareddata/xcschemes/GalCraftPlayer.xcscheme', 'build.sh']) assert.ok((await stat(join(root, 'ios-project', path))).size);
  assert.match(await readFile(join(root, 'ios-project/GalCraftPlayer/Info.plist'), 'utf8'), /My &amp; Story/);
  assert.match(await readFile(join(root, result.value.entry), 'utf8'), /org.example.story/);
});
test('archive selection on Windows reports the macOS requirement', async () => {
  if (process.platform === 'darwin') return;
  const issues = await builder.validate({ bundleId: 'org.example.story', buildNumber: '1', output: 'archive' }); assert.match(issues[0].message, /macOS/);
});
