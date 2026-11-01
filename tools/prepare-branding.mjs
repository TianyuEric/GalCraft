import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const repo = resolve(import.meta.dirname, '..');
const destination = join(repo, 'assets/branding');
const svg = await readFile(join(destination, 'galcraft-icon-light-blue.svg'));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map(size => Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let index = 0; index < sizes.length; index++) {
  const entry = 6 + index * 16, size = sizes[index];
  header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(pngs[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += pngs[index].length;
}
await writeFile(join(destination, 'galcraft.ico'), Buffer.concat([header, ...pngs]));
await writeFile(join(destination, 'galcraft.png'), new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng());
for (const directory of [join(repo, 'apps/studio/resources/branding'), join(repo, 'apps/player-windows/branding')]) {
  await mkdir(directory, { recursive: true });
  for (const name of ['galcraft.ico', 'galcraft.png']) await writeFile(join(directory, name), await readFile(join(destination, name)));
}
for (const [theme, file] of [['light', 'galcraft-icon.svg'], ['dark', 'galcraft-icon-dark.svg']]) {
  const source = await readFile(join(repo, 'apps/studio/renderer/authoring', file));
  await writeFile(join(repo, `apps/studio/resources/branding/galcraft-${theme}.png`), new Resvg(source, { fitTo: { mode: 'width', value: 256 } }).render().asPng());
}
console.log(JSON.stringify({ iconSizes: sizes, source: 'assets/branding/galcraft-icon-light-blue.svg' }));
