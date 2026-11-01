import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit';
import sharp from 'sharp';
import type { Project } from '@galcraft/contracts';

/** The Player executable selects native plugin files independently of the Studio host. */
export async function readWindowsExecutableArchitecture(path: string): Promise<'x64' | 'arm64'> {
  const file = await open(path, 'r');
  try {
    const dos = Buffer.alloc(64); await file.read(dos, 0, dos.length, 0);
    if (dos.toString('ascii', 0, 2) !== 'MZ') throw new Error(`Invalid Windows executable: ${path}`);
    const pe = Buffer.alloc(6); await file.read(pe, 0, pe.length, dos.readUInt32LE(0x3c));
    if (pe.toString('ascii', 0, 4) !== 'PE\0\0') throw new Error(`Invalid Windows PE header: ${path}`);
    const machine = pe.readUInt16LE(4);
    if (machine === 0x8664) return 'x64';
    if (machine === 0xaa64) return 'arm64';
    throw new Error(`Unsupported Windows Player machine: ${machine.toString(16)}`);
  } finally { await file.close(); }
}

/** Stamp the final launcher before author signing; never retain the engine publisher identity. */
export async function brandWindowsExecutable(executable: string, project: Project, iconSource?: string): Promise<string[]> {
  const exe = NtExecutable.from(await readFile(executable), { ignoreCert: true });
  const resources = NtExecutableResource.from(exe);
  const changed: string[] = [];
  if (iconSource) {
    const icon = new Data.IconFile();
    for (const size of [16, 24, 32, 48, 64, 128, 256]) {
      const png = await sharp(await readFile(iconSource), { animated: false }).resize(size, size, { fit: 'contain', background: '#00000000' }).png().toBuffer();
      icon.icons.push({ data: Data.RawIconItem.from(png, size, size, 32) });
    }
    Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, icon.icons.map(item => item.data));
    const path = join(dirname(executable), 'resources/app/branding/work.ico');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, new Uint8Array(icon.generate())); changed.push(path);
  }
  const version = Resource.VersionInfo.createEmpty();
  const parts = project.releaseVersion.split(/[+-]/)[0]!.split('.').map(Number);
  version.setFileVersion(parts[0]!, parts[1]!, parts[2]!, 0);
  version.setProductVersion(parts[0]!, parts[1]!, parts[2]!, 0);
  version.setStringValues({ lang: 1033, codepage: 1200 }, {
    ProductName: project.name, FileDescription: project.name,
    CompanyName: project.release?.publisher ?? '',
    ProductVersion: project.releaseVersion, FileVersion: project.releaseVersion,
    OriginalFilename: project.release?.executableName ?? executable.split(/[\\/]/).at(-1)!,
    InternalName: project.name, LegalCopyright: '',
  });
  // Remove every engine language table so Explorer cannot select stale Electron metadata.
  resources.entries = resources.entries.filter(entry => entry.type !== 16);
  version.outputToResourceEntries(resources.entries);
  resources.outputResource(exe);
  await writeFile(executable, new Uint8Array(exe.generate()));
  return changed;
}
