import { it, expect } from 'vitest';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import { brandWindowsExecutable, readWindowsExecutableArchitecture } from './branding.js';

it('selects the Player architecture from its PE machine rather than the Studio host', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-player-arch-'));
  try {
    for (const [machine, expected] of [[0x8664, 'x64'], [0xaa64, 'arm64']] as const) {
      const bytes = Buffer.alloc(134); bytes.write('MZ'); bytes.writeUInt32LE(128, 0x3c); bytes.write('PE\0\0', 128); bytes.writeUInt16LE(machine, 132);
      const file = join(directory, `${expected}.exe`); await writeFile(file, bytes);
      expect(await readWindowsExecutableArchitecture(file)).toBe(expected);
    }
    const invalid = join(directory, 'invalid.exe'); await writeFile(invalid, 'an HTML export');
    await expect(readWindowsExecutableArchitecture(invalid)).rejects.toThrow('Invalid Windows executable');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('writes the work identity and multi-size icon into a real Windows PE launcher', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-brand-'));
  try {
    const executable = join(directory, '雨站来信.exe');
    const requireRoot = createRequire(new URL('../../../../apps/player-windows/package.json', import.meta.url));
    const electron = requireRoot('electron') as string;
    await copyFile(electron, executable);
    const icon = join(directory, 'work.svg');
    await writeFile(icon, '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#216299"/><circle cx="64" cy="64" r="32" fill="#ffffff"/></svg>');
    const project = { ...FixtureProject, name: '雨站来信', releaseVersion: '2.3.4+local.1', release: {
      executableName: '雨站来信.exe', publisher: '雨站制作组', windowsSigning: 'unsigned' as const,
    } };
    const changed = await brandWindowsExecutable(executable, project, icon);
    const resource = NtExecutableResource.from(NtExecutable.from(await readFile(executable)));
    const versions = Resource.VersionInfo.fromEntries(resource.entries);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.getStringValues({ lang: 1033, codepage: 1200 })).toMatchObject({
      ProductName: project.name, CompanyName: '雨站制作组', ProductVersion: '2.3.4+local.1', OriginalFilename: '雨站来信.exe',
    });
    expect(versions[0]!.fixedInfo.fileVersionLS).toBe(4 * 65536);
    expect(versions[0]!.fixedInfo.productVersionLS).toBe(4 * 65536);
    expect(Data.IconFile.from(await readFile(changed[0]!)).icons.map(item => item.data.width)).toEqual([16, 24, 32, 48, 64, 128, 256]);
    expect(resource.entries.some(entry => entry.type === 14)).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
