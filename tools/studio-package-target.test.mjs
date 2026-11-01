import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { studioPackageTarget } from './studio-package-target.mjs';
import { stageNativeDependencies } from './stage-native-dependencies.mjs';
import { assertNativeBinaryTarget } from './native-binary-target.mjs';

test('selects each Studio target explicitly and prevents formats for a different OS', () => {
  for (const platform of ['win32', 'linux', 'darwin']) for (const arch of ['x64', 'arm64']) {
    assert.deepEqual(studioPackageTarget(['--platform', platform, '--arch', arch, '--format', 'dir']).platform, platform);
    assert.equal(studioPackageTarget(['--platform', platform, '--arch', arch, '--format', 'dir']).arch, arch);
  }
  assert.throws(() => studioPackageTarget(['--platform', 'linux', '--arch', 'arm64', '--format', 'nsis']), /Unsupported Studio format/);
});

test('stages optional dependencies for the requested target, independently of the host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-native-stage-'));
  try {
    const source = join(root, 'source'), destination = join(root, 'out'); await mkdir(source);
    await writeFile(join(source, 'package.json'), '{}');
    for (const [name, manifest] of Object.entries({ driver: { optionalDependencies: { 'target-arm64': '0.1.0', 'target-x64': '0.1.0' } }, 'target-arm64': { os: ['linux'], cpu: ['arm64'] }, 'target-x64': { os: ['win32'], cpu: ['x64'] } })) {
      const directory = join(source, 'node_modules', name); await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '0.1.0', ...manifest }));
    }
    const copied = await stageNativeDependencies(join(source, 'package.json'), destination, { platform: 'linux', arch: 'arm64', dependencies: ['driver'] });
    assert.deepEqual(copied, { driver: '0.1.0', 'target-arm64': '0.1.0' });
    assert.equal(JSON.parse(await readFile(join(destination, 'node_modules/target-arm64/package.json'), 'utf8')).name, 'target-arm64');
    const wrong = join(root, 'ffmpeg.exe'), bytes = Buffer.alloc(134); bytes.write('MZ'); bytes.writeUInt32LE(128, 0x3c); bytes.write('PE\0\0', 128); bytes.writeUInt16LE(0x8664, 132); await writeFile(wrong, bytes);
    await assert.rejects(assertNativeBinaryTarget(wrong, { platform: 'win32', arch: 'arm64' }), /expected win32\/arm64/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
