import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const { unzipSync } = createRequire(new URL('../../../packages/plugins/package.json', import.meta.url))('fflate');
const evidence = resolve(process.argv[2]), acceptance = JSON.parse(await readFile(join(evidence, 'acceptance.json'), 'utf8')), proof = [];
for (const receipt of acceptance.receipts.filter(receipt => receipt.target === 'android')) {
  const files = unzipSync(await readFile(receipt.entry)), prefix = receipt.artifacts[0].kind === 'apk' ? 'assets/game/' : 'base/assets/game/';
  const manifest = JSON.parse(new TextDecoder().decode(files[prefix + 'release.manifest.json']));
  for (const file of manifest.files) assert.equal(files[prefix + file.path]?.length, file.size, `Embedded manifest: ${file.path}`);
  const snapshot = JSON.parse(new TextDecoder().decode(files[prefix + manifest.snapshot]));
  assert(snapshot.assets.some(asset => asset.assetId === acceptance.assetId)); assert(JSON.stringify(snapshot.template).includes(`"variableId":"${acceptance.variableId}"`));
  const png = snapshot.assets.find(asset => asset.assetId === acceptance.assetId); assert(files[prefix + png.entry]);
  assert(Object.keys(files).some(path => path.endsWith('.dex'))); assert(Object.keys(files).some(path => path.startsWith(prefix + 'runtime/fonts/')));
  proof.push({ entry: receipt.entry, zipEntries: Object.keys(files).length, snapshot: prefix + manifest.snapshot, png: prefix + png.entry, coreVariable: acceptance.variableId, fontsAndDex: true, embeddedManifestSizesMatch: true });
}
await writeFile(join(evidence, 'artifact-contents.json'), JSON.stringify(proof, null, 2)); console.log(proof);
