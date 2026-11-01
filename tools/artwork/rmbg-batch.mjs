import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, args) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), args[index + 1]]);
  return pairs;
}, []));
if (!options.input || !options.output || !options.workflow) {
  throw new Error('Usage: node tools/artwork/rmbg-batch.mjs --input <white-images> --output <transparent-images> --workflow <RMBG.json> [--server http://127.0.0.1:8188]');
}
const server = (options.server ?? 'http://127.0.0.1:8188').replace(/\/$/, '');
const input = resolve(options.input), output = resolve(options.output);
const workflow = JSON.parse(await readFile(resolve(options.workflow), 'utf8'));
const load = workflow.nodes.find(node => node.type === 'LoadImage');
const matting = workflow.nodes.find(node => node.type === 'BiRefNetRMBG');
const save = workflow.nodes.find(node => node.type === 'SaveImage');
if (!load || !matting || !save || workflow.nodes.length !== 3) throw new Error('Expected the approved LoadImage → BiRefNetRMBG → SaveImage workflow.');
const [model, mask_blur, mask_offset, invert_output, refine_foreground, background, background_color] = matting.widgets_values;
if (background !== 'Alpha') throw new Error('The workflow must output Alpha transparency.');
const sharp = createRequire(new URL('../../packages/assets/package.json', import.meta.url))('sharp');
const request = async (path, init) => {
  const response = await fetch(`${server}${path}`, { ...init, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response;
};
await request('/object_info/BiRefNetRMBG');
await mkdir(output, { recursive: true });
for (const filename of (await readdir(input)).filter(name => name.endsWith('.png')).sort()) {
  const destination = join(output, filename);
  try { await access(destination); console.log(`Already prepared: ${filename}`); continue; } catch { /* New image. */ }
  const source = await readFile(join(input, filename));
  const form = new FormData();
  form.append('image', new Blob([source], { type: 'image/png' }), `galcraft-${filename}`);
  form.append('overwrite', 'true');
  const uploaded = await (await request('/upload/image', { method: 'POST', body: form })).json();
  const image = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
  const prompt = {
    [load.id]: { class_type: load.type, inputs: { image } },
    [matting.id]: { class_type: matting.type, inputs: { image: [String(load.id), 0], model, mask_blur, mask_offset, invert_output, refine_foreground, background, background_color } },
    [save.id]: { class_type: save.type, inputs: { images: [String(matting.id), 0], filename_prefix: `GalCraft/${basename(filename, '.png')}` } },
  };
  const queued = await (await request('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })).json();
  if (!queued.prompt_id) throw new Error(JSON.stringify(queued));
  console.log(`Matting: ${filename}`);
  const deadline = Date.now() + 15 * 60 * 1000;
  let generated;
  while (Date.now() < deadline) {
    const history = await (await request(`/history/${queued.prompt_id}`)).json();
    const entry = history[queued.prompt_id];
    if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status));
    generated = entry?.outputs?.[save.id]?.images?.[0];
    if (generated) break;
    await delay(1500);
  }
  if (!generated) throw new Error(`ComfyUI did not finish ${filename} within 15 minutes.`);
  const query = new URLSearchParams({ filename: generated.filename, subfolder: generated.subfolder, type: generated.type });
  const bytes = Buffer.from(await (await request(`/view?${query}`)).arrayBuffer());
  const metadata = await sharp(bytes).metadata(), original = await sharp(source).metadata();
  const stats = await sharp(bytes).stats(), alpha = stats.channels[3];
  if (!metadata.hasAlpha || !alpha || alpha.min !== 0 || alpha.max !== 255 || metadata.width !== original.width || metadata.height !== original.height) {
    throw new Error(`${filename}: output must preserve canvas dimensions and contain a real transparent foreground cutout.`);
  }
  await writeFile(destination, bytes);
  console.log(`Saved: ${filename} (${metadata.width}×${metadata.height}, alpha mean ${alpha.mean.toFixed(1)})`);
}
