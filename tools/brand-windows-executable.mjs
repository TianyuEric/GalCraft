import { readFile, writeFile } from 'node:fs/promises';
import { NtExecutable, NtExecutableResource, Data, Resource } from 'resedit';

export async function brandWindowsExecutable(path, iconPath) {
  const executable = NtExecutable.from(await readFile(path), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const icon = Data.IconFile.from(await readFile(iconPath));
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, icon.icons.map(entry => entry.data));
  resources.outputResource(executable);
  await writeFile(path, Buffer.from(executable.generate()));
}
