import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
export const modelPath = directory => join(directory, manifest.modelDirectory, manifest.modelFile);
export const toolManifest = manifest;

export async function inspectModel(directory) {
  const path = modelPath(directory);
  await access(path);
  const session = await ort.InferenceSession.create(path, { executionProviders: ['cpu'] });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const input = session.inputMetadata[0];
  const output = session.outputMetadata[0];
  const matches = (actual, expected) => actual?.length === expected.length &&
    actual.every((value, index) => typeof value !== 'number' || value === expected[index]);
  if (input?.type !== 'float32' || !matches(input.shape, manifest.input.shape) ||
      !matches(output?.shape, manifest.output.shape)) {
    await session.release();
    throw new Error(`模型输入/输出张量与工具契约不符: ${JSON.stringify({ input, output })}`);
  }
  return { session, inputName, outputName, input: input.shape, output: output.shape,
    bytes: (await stat(path)).size, ortVersion: manifest.runtime['onnxruntime-node'], sharpVersion: sharp.versions.sharp };
}

export async function prepareModel(directory, { signal, onState = () => {} } = {}) {
  const path = modelPath(directory);
  try {
    const ready = await inspectModel(directory);
    await ready.session.release();
    delete ready.session;
    onState({ state: 'ready', bytes: ready.bytes, inputName: ready.inputName, outputName: ready.outputName });
    return ready;
  } catch (error) {
    if (!(error?.code === 'ENOENT')) throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  const partial = `${path}.part`;
  let prior = 0;
  try { prior = (await stat(partial)).size; } catch { /* first download */ }
  onState({ state: 'downloading', bytes: prior });
  const response = await fetch(manifest.modelUrl, { headers: prior ? { Range: `bytes=${prior}-` } : {}, signal });
  if (!response.ok || !response.body) throw new Error(`模型下载失败：HTTP ${response.status}`);
  const resume = prior > 0 && response.status === 206;
  let downloaded = resume ? prior : 0;
  const remaining = Number(response.headers.get('content-length'));
  const totalBytes = Number.isFinite(remaining) && remaining > 0 ? downloaded + remaining : undefined;
  onState({ state: 'downloading', bytes: downloaded, totalBytes });
  let nextReport = downloaded + 1024 * 1024;
  const progress = new Transform({ transform(chunk, encoding, callback) {
    downloaded += chunk.length;
    if (downloaded >= nextReport) {
      onState({ state: 'downloading', bytes: downloaded, totalBytes });
      nextReport = downloaded + 1024 * 1024;
    }
    callback(null, chunk);
  } });
  await pipeline(response.body, progress, createWriteStream(partial, { flags: resume ? 'a' : 'w' }), { signal });
  onState({ state: 'downloading', bytes: downloaded, totalBytes });
  onState({ state: 'verifying', bytes: (await stat(partial)).size });
  await rm(path, { force: true });
  await import('node:fs/promises').then(fs => fs.rename(partial, path));
  try {
    const ready = await inspectModel(directory);
    await ready.session.release();
    delete ready.session;
    await writeFile(join(dirname(path), 'installed.json'), JSON.stringify({
      release: manifest.release, modelFile: manifest.modelFile, modelUrl: manifest.modelUrl, bytes: ready.bytes,
      inputName: ready.inputName, inputShape: ready.input, outputName: ready.outputName, outputShape: ready.output,
      mean: manifest.input.mean, std: manifest.input.std, ortVersion: ready.ortVersion, sharpVersion: ready.sharpVersion,
    }, null, 2));
    onState({ state: 'ready', bytes: ready.bytes, inputName: ready.inputName, outputName: ready.outputName });
    return ready;
  } catch (error) { await rm(path, { force: true }); throw error; }
}

export async function removeModel(directory) {
  await rm(join(directory, manifest.modelDirectory), { recursive: true, force: true });
}

export function normalizedTensor(rgb) {
  const pixels = 1024 * 1024;
  if (rgb.length !== pixels * 3) throw new Error('推理图像尺寸不符');
  const tensor = new Float32Array(pixels * 3);
  for (let p = 0; p < pixels; p++) for (let c = 0; c < 3; c++)
    tensor[c * pixels + p] = (rgb[p * 3 + c] / 255 - manifest.input.mean[c]) / manifest.input.std[c];
  return tensor;
}

export async function resizeMask(mask, sourceWidth, sourceHeight, width, height) {
  return sharp(mask, { raw: { width: sourceWidth, height: sourceHeight, channels: 1 } })
    .resize(width, height, { fit: 'fill', kernel: 'linear' }).toColourspace('b-w').raw().toBuffer();
}

export async function removeBackground(inputPath, outputDirectory, modelDirectory, { signal } = {}) {
  if (signal?.aborted) throw new Error('Cancelled');
  const loaded = await inspectModel(modelDirectory);
  try {
  const original = await sharp(inputPath).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = original.info;
  const rgb = await sharp(inputPath).toColourspace('srgb').removeAlpha().resize(1024, 1024, { fit: 'fill' }).raw().toBuffer();
  const tensor = new ort.Tensor('float32', normalizedTensor(rgb), manifest.input.shape);
  const values = await loaded.session.run({ [loaded.inputName]: tensor });
  const logits = values[loaded.outputName];
  if (!logits || logits.data.length !== 1024 * 1024) throw new Error('模型输出蒙版尺寸不符');
  if (signal?.aborted) throw new Error('Cancelled');
  const mask1024 = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < mask1024.length; i++) mask1024[i] = Math.round(255 / (1 + Math.exp(-logits.data[i])));
  const mask = await resizeMask(mask1024, 1024, 1024, width, height);
  const rgba = original.data;
  for (let i = 0; i < width * height; i++) rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * mask[i] / 255);
  let alphaMin = 255;
  for (let i = 3; i < rgba.length; i += 4) alphaMin = Math.min(alphaMin, rgba[i]);
  if (signal?.aborted) throw new Error('Cancelled');
  await mkdir(outputDirectory, { recursive: true });
  const imagePath = join(outputDirectory, 'transparent.png');
  const maskPath = join(outputDirectory, 'mask.png');
  try {
    await sharp(mask, { raw: { width, height, channels: 1 } }).png().toFile(maskPath);
    await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(imagePath);
    return { imagePath, maskPath, width, height,
      result: { declared: 'removed', hasAlpha: true, hasTransparency: alphaMin < 255 },
      provider: 'node', providerVersion: '0.1.0',
      modelVersion: manifest.release, inputName: loaded.inputName, outputName: loaded.outputName };
  } catch (error) { await rm(outputDirectory, { recursive: true, force: true }); throw error; }
  } finally { await loaded.session.release(); }
}
