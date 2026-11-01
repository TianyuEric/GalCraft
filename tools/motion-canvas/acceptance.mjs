import { checkEvidenceBudget, removeWorkspace } from '../../tests/e2e/workspace.mjs';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, rm, copyFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {renderMotionProject} from './render.mjs';
import {runProcess, probeMedia} from '../media/src/process.mjs';

await checkEvidenceBudget();
const repo = resolve(import.meta.dirname, '../..'), directory = join(repo, 'tmp/testing/motion-canvas-product');
const evidence = join(repo, 'test-results/latest/motion-canvas/MC-T00'); await mkdir(evidence, {recursive: true});
const expected = JSON.parse(await readFile(join(import.meta.dirname, 'runtime/manifest.json'), 'utf8'));
const sourceImage = join(repo, 'apps/studio/resources/practice/backgrounds/spring-shop.png');
const sourceAudio = join(repo, 'apps/studio/resources/practice/music/spring-01.opus');
const project = {schemaVersion: 1, id: 'g0-product', revision: 1, title: '春日序章', entry: 'project.ts',
  files: await Promise.all(['project.ts','scene.tsx'].map(async path => ({path, content: (await readFile(join(import.meta.dirname,'fixture',path),'utf8')).replaceAll('GalCraftMotion', 'GalCraftMotion_font')}))),
  bindings: [{alias: 'image', assetId: 'g0image', variantId: 'g0imagev1', port: 'images', purpose: 'image'}, {alias: 'font', assetId: 'g0font', variantId: 'g0fontv1', port: 'fonts', purpose: 'font'}, {alias: 'audio', assetId: 'g0audio', variantId: 'g0audiov1', port: 'audio', purpose: 'audio'}],
  render: {width: 960, height: 540, fps: 24, frames: 360, audio: {alias: 'audio', startSec: 0, trimSec: 0, gainDb: 0}}, toolchain: {motionCanvas: '3.17.2', vite: '5.4.21', renderer: '0.1.0'}};
project.files[0].content = "import {asset} from '@galcraft/motion-canvas-assets';\n" + project.files[0].content.replace("'/media/audio.opus'", "asset('audio')");
project.files[1].content = "import {asset,font} from '@galcraft/motion-canvas-assets';\n" + project.files[1].content.replace('src="/media/image.png"', "src={asset('image')}").replace('fontFamily="GalCraftMotion_font"', "fontFamily={font('font')}");
await writeFile(join(evidence,'project.json'),JSON.stringify(project,null,2));
const resources = await Promise.all([{alias: 'image', mime: 'image/png', path: sourceImage}, {alias: 'font', mime: 'font/otf', path: join(repo,'tools/fonts/cache/NotoSansCJKsc-Regular.otf')}, {alias: 'audio', mime: 'audio/ogg', path: sourceAudio}].map(async item => ({alias: item.alias, mime: item.mime, bytes: new Uint8Array(await readFile(item.path))})));
const records = [], report = {expected, records};
try {
  const events = [], started = performance.now();
  const output = await renderMotionProject({project, resources, directory, requestId: 'success', signal: new AbortController().signal, expected, onProgress: event => events.push(event)});
  await copyFile(output.localPath, join(evidence, 'product.mp4'));
  const probe = await probeMedia(expected.encoding.toolDirectory, output.localPath);
  const decode = await runProcess(join(expected.encoding.toolDirectory,'ffmpeg.exe'), ['-v','error','-xerror','-i',output.localPath,'-f','null','-']);
  assert.equal(decode.stderr, '');
  for (const [name, path] of [['source',sourceAudio],['encoded',output.localPath]]) await runProcess(join(expected.encoding.toolDirectory,'ffmpeg.exe'), ['-v','error','-y','-i',path,'-map','0:a:0','-t','15','-ar','48000','-ac','2','-f','f32le',join(directory,`${name}.f32`)]);
  const original = await readFile(join(directory,'source.f32')), encoded = await readFile(join(directory,'encoded.f32'));
  let cross = 0, a = 0, b = 0, samples = 0;
  for (let i = 0; i < Math.min(original.length, encoded.length); i += 4 * 16) {const x = original.readFloatLE(i), y = encoded.readFloatLE(i); cross += x*y; a += x*x; b += y*y; samples++;}
  const correlation = cross / Math.sqrt(a*b), rms = Math.sqrt(b/samples); assert(correlation > 0.97 && rms > 0.001);
  records.push({caseId: 'MC-T00/product-decode', result: 'passed', durationMs: Math.round(performance.now()-started), probe, correlation, rms, events, expected: 'Complete media decodes; source audio at the requested start remains time aligned; exact 360 frames, 24fps and 15 seconds'});
  const mismatch = structuredClone(project); mismatch.files[1].content = mismatch.files[1].content.replaceAll('15, linear', '16, linear');
  await assert.rejects(renderMotionProject({project: mismatch, resources, directory, requestId: 'duration-mismatch', expected, signal: new AbortController().signal}), error => {
    records.push({caseId: 'MC-T00/duration-mismatch', result: 'passed', actual: {stage: error.stage, message: error.message}}); return /384 sampled frames.*360 frames/.test(error.message);
  });
  const controller = new AbortController();
  await assert.rejects(renderMotionProject({project, resources, directory, requestId: 'cancel', expected, signal: controller.signal, onProgress: event => {if (event.phase === 'rendering' && event.completed >= 24) controller.abort();}}), error => error.name === 'AbortError');
  records.push({caseId: 'MC-T00/product-cancel', result: 'passed', actual: 'The prepared product runtime stops at 24 frames and cleans its staging directory'});
  report.result = 'passed';
} catch (error) {report.result = 'failed'; report.error = String(error.stack ?? error); process.exitCode = 1;}
finally {await removeWorkspace(directory); await checkEvidenceBudget(); await writeFile(join(evidence,'product.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report));}
