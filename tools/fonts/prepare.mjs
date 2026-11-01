import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const directory = resolve(process.argv[2] ?? 'tools/fonts/cache');
const revision = 'f8d157532fbfaeda587e826d4cd5b21a49186f7c';
const source = `https://raw.githubusercontent.com/notofonts/noto-cjk/${revision}/Sans/`;
const fonts = [
  { family: 'GalCraft Noto SC', language: 'zh-CN', path: 'NotoSansCJKsc-Regular.otf', upstream: 'OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf' },
  { family: 'GalCraft Noto JP', language: 'ja', path: 'NotoSansCJKjp-Regular.otf', upstream: 'OTF/Japanese/NotoSansCJKjp-Regular.otf' },
];
await mkdir(directory, { recursive: true });
for (const file of [...fonts.map(font => ({ path: font.path, upstream: font.upstream })), { path: 'OFL.txt', upstream: 'LICENSE' }, { path: 'UPSTREAM.md', upstream: 'README-third_party.md' }]) {
  const response = await fetch(source + file.upstream); if (!response.ok) throw new Error(`Font source unavailable: ${file.upstream} (${response.status})`);
  await writeFile(join(directory, file.path), new Uint8Array(await response.arrayBuffer()));
}
await writeFile(join(directory, 'fonts.json'), JSON.stringify({ source: `https://github.com/notofonts/noto-cjk/tree/${revision}/Sans`, license: 'OFL.txt', fonts }, null, 2));
console.log(JSON.stringify({ directory, fonts: fonts.map(font => font.path), source: revision }));
