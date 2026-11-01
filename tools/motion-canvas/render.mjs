import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile, copyFile, rm, symlink, rename, stat} from 'node:fs/promises';
import {join, dirname, resolve, relative, extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {probeMedia, runProcess, inspectToolPair} from '../media/src/process.mjs';

export const version = '0.1.0';
const portablePath = value => value.replaceAll('\\', '/');
const fail = (stage, message, detail = {}) => Object.assign(new Error(message), {stage, ...detail});

/** Only the optional toolchain owns its browser/server/encoder and per-call staging. */
export async function renderMotionProject({project, resources, directory, requestId, signal, onProgress = () => {}, expected}) {
  signal?.throwIfAborted();
  if (expected?.id !== 'org.galcraft.motion-canvas/toolchain' || expected.version !== version) throw fail('preparing', 'Motion Canvas toolchain identity differs from the frozen request');
  const runtime = expected.runtimeDirectory ?? join(import.meta.dirname, 'runtime');
  const require = createRequire(join(runtime, 'package.json'));
  for (const [name, wanted] of Object.entries(expected.dependencies)) {
    const installed = JSON.parse(await readFile(require.resolve(`${name}/package.json`), 'utf8'));
    if (installed.version !== wanted) throw fail('preparing', `${name}: expected ${wanted}, installed ${installed.version}`);
  }
  const actualEncoding = await inspectToolPair(expected.encoding.toolDirectory);
  if (actualEncoding.ffmpegVersion !== expected.encoding.ffmpegVersion || actualEncoding.ffprobeVersion !== expected.encoding.ffprobeVersion || actualEncoding.videoEncoder !== expected.encoding.videoEncoder || !actualEncoding.aac) throw fail('preparing', 'The actual encoding tools differ from the prepared versions');
  const work = resolve(directory, `motion-${requestId}`), framesDirectory = join(work, 'frames'), output = resolve(directory, 'motion.mp4');
  if (relative(resolve(directory), work).startsWith('..')) throw fail('preparing', 'Render staging must belong to the task directory');
  await rm(work, {recursive: true, force: true}); await mkdir(framesDirectory, {recursive: true}); await mkdir(join(work, 'public/media'), {recursive: true}); await mkdir(join(work, 'browser'));
  let browser, server, result, failure, count = 0;
  const diagnostics = [];
  const progress = (phase, completed = null, total = null) => onProgress({phase, completed, total});
  const stop = () => {void browser?.close().catch(() => {});};
  signal?.addEventListener('abort', stop, {once: true});
  try {
    progress('preparing');
    for (const file of project.files) {
      const path = resolve(work, file.path);
      if (relative(work, path).startsWith('..') || relative(work, path) === '') throw fail('preparing', `Invalid source file: ${file.path}`);
      await mkdir(dirname(path), {recursive: true}); await writeFile(path, file.content);
    }
    await symlink(join(runtime, 'node_modules'), join(work, 'node_modules'), 'junction');
    for (const file of ['index.js', 'editor.html']) await copyFile(join(import.meta.dirname, 'browser', file), join(work, 'browser', file));
    const aliases = {}, media = [];
    for (const binding of project.bindings) {
      const resource = resources.find(item => item.alias === binding.alias);
      if (!resource) throw fail('resources', `Missing bound asset: ${binding.alias}`, {assetId: binding.assetId, variantId: binding.variantId});
      const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'audio/ogg': '.ogg', 'audio/opus': '.opus', 'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'font/otf': '.otf', 'font/ttf': '.ttf', 'font/woff': '.woff', 'font/woff2': '.woff2', 'application/font-sfnt': '.otf' }[resource.mime];
      if (!extension) throw fail('resources', `Unsupported media ${binding.alias}: ${resource.mime}`);
      const name = `${binding.alias}${extension}`; await writeFile(join(work, 'public/media', name), resource.bytes);
      aliases[binding.alias] = `/media/${name}`;
      media.push({alias: binding.alias, uri: aliases[binding.alias], mime: resource.mime, purpose: binding.purpose, family: `GalCraftMotion_${binding.alias}`});
    }
    const {createServer, createLogger} = await import(pathToFileURL(join(dirname(require.resolve('vite')), 'dist/node/index.js')));
    const logger = createLogger('silent');
    logger.error = (message, options) => {
      const error = options?.error;
      diagnostics.push({stage: 'compiling', message, file: error?.id ? portablePath(relative(work, error.id)) : null, location: error?.loc ?? null, frame: error?.frame ?? null});
      failure = fail('compiling', message, {diagnostics});
    };
    const assetsModule = '\0galcraft:motion-assets';
    server = await createServer({root: work, configFile: false, customLogger: logger, cacheDir: join(work, '.vite'),
      plugins: [{name: 'galcraft-motion-assets', resolveId(id) {if (id === '@galcraft/motion-canvas-assets') return assetsModule;},
        load(id) {if (id === assetsModule) return `const urls=${JSON.stringify(aliases)}; export function asset(alias){if(!urls[alias])throw new Error('Missing resource alias: '+alias);return urls[alias]}; export function font(alias){asset(alias);return 'GalCraftMotion_'+alias};`; }},
        ...require('@motion-canvas/vite-plugin').default({project: portablePath(join(work, project.entry)), output: join(work, 'output'), editor: portablePath(join(work, 'browser/index.js'))})],
      server: {host: '127.0.0.1', port: 0, fs: {allow: [work, runtime]}},
    });
    await server.listen(); signal?.throwIfAborted();
    const {chromium} = require('playwright-core');
    browser = await chromium.launch({executablePath: expected.browser.executablePath, headless: true});
    browser.on('disconnected', () => {if (result === undefined && !signal?.aborted && !failure) failure = fail('rendering', 'Motion Canvas browser exited before completing the frame sequence', {completedFrames: count, expectedFrames: project.render.frames});});
    if (browser.version() !== expected.browser.version) throw fail('preparing', `Browser version changed: ${browser.version()} / ${expected.browser.version}`);
    const page = await browser.newPage();
    await page.exposeFunction('motionSettings', () => ({...project.render, resources: media}));
    await page.exposeFunction('motionEvent', event => {
      if (event.kind === 'failure') failure = fail('rendering', event.message, {stack: event.stack, diagnostics});
      if (event.kind === 'finished') result = event.result;
      if (event.kind === 'phase') progress(event.stage);
      if (event.kind === 'log' && event.level === 'error') diagnostics.push({stage: 'rendering', message: event.message, stack: event.stack});
      if (event.kind === 'duration') diagnostics.push({stage: 'duration', ...event});
    });
    await page.exposeFunction('motionFrame', async ({frame, png}) => {
      signal?.throwIfAborted();
      if (frame !== count) throw fail('rendering', `Unexpected source frame ${frame}; expected ${count}`);
      await writeFile(join(framesDirectory, `${String(frame).padStart(6, '0')}.png`), Buffer.from(png, 'base64'));
      count++; if (count % project.render.fps === 0) progress('rendering', count, project.render.frames);
    });
    page.on('pageerror', error => {failure = fail('rendering', error.message, {stack: error.stack});});
    page.on('response', response => { if (!failure && response.status() >= 400 && !response.url().endsWith('/favicon.ico')) failure = fail('resources', `HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });
    progress('compiling'); await page.goto(server.resolvedUrls.local[0]);
    const timeout = Date.now() + Math.max(120000, project.render.frames * 1000);
    while (result === undefined && !failure) {
      signal?.throwIfAborted(); if (Date.now() > timeout) throw fail('rendering', 'Motion Canvas render timed out');
      await new Promise(done => setTimeout(done, 50));
    }
    signal?.throwIfAborted();
    if (failure) throw failure;
    if (result !== 0 || count !== project.render.frames) throw fail('rendering', `Incomplete render: result ${result}, frames ${count}/${project.render.frames}`, {diagnostics});
    await browser.close(); browser = null; await server.close(); server = null;
    progress('encoding');
    const duration = project.render.frames / project.render.fps, audio = project.render.audio;
    const args = ['-hide_banner','-y','-framerate',String(project.render.fps),'-i',join(framesDirectory,'%06d.png')];
    if (audio) {
      const resource = media.find(item => item.alias === audio.alias);
      if (!resource) throw fail('resources', `Missing audio: ${audio.alias}`);
      args.push('-ss', String(audio.trimSec), '-i', join(work, 'public', resource.uri));
    }
    args.push('-map','0:v:0', ...(audio ? ['-map','1:a:0','-af',`volume=${audio.gainDb}dB,adelay=${Math.round(audio.startSec * 1000)}:all=1,apad`] : ['-an']),
      '-frames:v',String(project.render.frames),'-t',String(duration),'-c:v',expected.encoding.videoEncoder,'-pix_fmt','yuv420p','-b:v','5000k',
      ...(audio ? ['-c:a','aac','-b:a','128k'] : []),'-movflags','+faststart','-progress','pipe:1',join(work,'render.part.mp4'));
    await runProcess(actualEncoding.paths.ffmpeg, args, {signal, onProgress: event => {
      if (event.stream === 'stdout') {const frame = /frame=(\d+)/.exec(event.text); if (frame) progress('encoding', Number(frame[1]), project.render.frames);}
    }});
    signal?.throwIfAborted();
    const probe = await probeMedia(expected.encoding.toolDirectory, join(work, 'render.part.mp4'), signal);
    const video = probe.streams.find(stream => stream.codec_type === 'video'), audioStream = probe.streams.find(stream => stream.codec_type === 'audio');
    if (video?.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p' || video.width !== project.render.width || video.height !== project.render.height || Number(video.nb_frames) !== project.render.frames || Math.abs(Number(probe.format.duration) - duration) > 1 / project.render.fps || audio && audioStream?.codec_name !== 'aac') throw fail('encoding', 'Encoded media does not match the frozen render settings');
    await rename(join(work, 'render.part.mp4'), output);
    return {localPath: output, mime: 'video/mp4', bytes: (await stat(output)).size, metadata: {width: video.width, height: video.height, fps: project.render.fps, frames: project.render.frames, durationSeconds: duration, encoding: expected.encoding, toolchain: expected, diagnostics}};
  } finally {
    signal?.removeEventListener('abort', stop);
    await browser?.close().catch(() => {}); await server?.close().catch(() => {});
    await rm(work, {recursive: true, force: true});
  }
}
