import { createWriteStream } from 'node:fs';
import { access, cp, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { assertNativeBinaryTarget } from '../native-binary-target.mjs';
import { mediaToolNames } from '../studio-package-target.mjs';

async function saveDownload(response, destination) {
  if (!response.ok || !response.body) throw new Error(`Media tool download failed: ${response.status}`);
  const partial = `${destination}.${process.pid}.part`;
  try { await pipeline(response.body, createWriteStream(partial)); await rename(partial, destination); }
  finally { await unlink(partial).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

async function restorePublishedMedia(manifest, cache, directory, executables) {
  const archive = join(cache, new URL(manifest.publishedStudio).pathname.split('/').at(-1));
  try { await access(archive); }
  catch { await saveDownload(await fetch(manifest.publishedStudio), archive); }
  const bin = 'package/resources/media/bin';
  execFileSync('tar.exe', ['-xf', archive, '-C', cache, ...executables.map(name => `${bin}/${name}`)], { windowsHide: true, stdio: 'inherit' });
  const release = manifest.archive.replace(/^ffmpeg-(.+)-win64-lgpl-\d+\.\d+\.zip$/, '$1');
  for (const name of executables) {
    const file = join(cache, bin, name);
    await assertNativeBinaryTarget(file, { platform: manifest.platform, arch: manifest.arch });
    const version = execFileSync(file, ['-version'], { windowsHide: true, encoding: 'utf8' }).split(/\r?\n/)[0];
    if (!version.includes(`version ${release}-`)) throw new Error(`Published media tool differs from the pinned release: ${version}`);
    console.log(version);
  }
  await mkdir(directory, { recursive: true });
  for (const name of executables) await cp(join(cache, bin, name), join(directory, name));
  return directory;
}

export async function prepareMediaTools() {
  const root = import.meta.dirname;
  const directory = resolve(process.env.GALCRAFT_MEDIA_TOOL_DIR ?? join(root, 'runtime/bin'));
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const executables = mediaToolNames();
  try { for (const name of executables) await assertNativeBinaryTarget(join(directory, name), { platform: process.platform, arch: process.arch }); return directory; }
  catch (error) { if (error.code !== 'ENOENT' || process.env.GALCRAFT_MEDIA_TOOL_DIR) throw error; }
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error(`Prepare ${process.platform}/${process.arch} FFmpeg and ffprobe and set GALCRAFT_MEDIA_TOOL_DIR to their bin directory.`);
  const cache = join(root, 'cache'), archive = join(cache, manifest.archive);
  await mkdir(cache, { recursive: true });
  try { await access(archive); }
  catch {
    console.log(`Preparing media tools: ${manifest.release}`);
    const response = await fetch(manifest.source);
    if ([404, 410].includes(response.status) && manifest.publishedStudio) {
      console.log('Restoring the pinned tools from the published Studio archive.');
      return restorePublishedMedia(manifest, cache, directory, executables);
    }
    await saveDownload(response, archive);
  }
  execFileSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xf', archive, '-C', cache], { windowsHide: true, stdio: 'inherit' });
  await cp(join(cache, manifest.archive.replace(/\.zip$/, '')), join(root, 'runtime'), { recursive: true });
  for (const name of manifest.executables) {
    const version = execFileSync(join(directory, name), ['-version'], { windowsHide: true, encoding: 'utf8' }).split(/\r?\n/)[0];
    console.log(version);
  }
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await prepareMediaTools();
