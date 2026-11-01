import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '../..'), dest = join(root, 'apps/studio/resources/practice');
const manifest = JSON.parse(await readFile(join(dest, 'manifest.json'), 'utf8'));
for (const key of ['sunset', 'sky']) {
  manifest.backgrounds[key] = `backgrounds/spring-${key}.png`;
}
const paths = {
  start: 'M8 4 20 12 8 20Z', save: 'M5 3h12l4 4v14H3V3h2M7 3v6h10V3M7 21v-8h10v8',
  load: 'M3 7h7l2 3h10l-3 10H3ZM3 7V4h7l2 3h7v3', history: 'M4 5v5h5M4 10a8 8 0 1 1 1 8M12 7v6l4 2',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', pin: 'M8 3h8l-1 6 4 4v2H5v-2l4-4ZM12 15v7',
  auto: 'M7 7 16 12 7 17ZM20 8a9 9 0 0 0-15-3M4 8V4h4M4 16a9 9 0 0 0 15 3M20 16v4h-4',
  skip: 'M3 5 12 12 3 19ZM12 5 21 12 12 19Z', title: 'M3 11 12 3 21 11M5 10v11h14V10M9 21v-7h6v7',
  back: 'M20 12H4M10 5 3 12 10 19', music: 'M9 18V5l12-2v13M9 8l12-2M9 18c0 4-7 5-7 1 0-3 7-4 7-1M21 16c0 4-7 5-7 1 0-3 7-4 7-1',
  cg: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M16 7h.01', exit: 'M10 3H3v18h7M8 12h13M16 7l5 5-5 5',
  flow: 'M9 2h6v5H9ZM3 17h6v5H3ZM15 17h6v5h-6ZM12 7v5M6 17v-5h12v5',
  characters: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-3a8 8 0 0 1 16 0v3',
};
await mkdir(join(dest, 'ui'), { recursive: true }); manifest.ui = {};
for (const [key, d] of Object.entries(paths)) {
  const file = `ui/spring-${key}.svg`; manifest.ui[key] = file;
  await writeFile(join(dest, file), `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="#000" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`);
}
await writeFile(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared spring page backgrounds and SVG icons.');
