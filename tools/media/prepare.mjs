import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNativeBinaryTarget } from '../native-binary-target.mjs';
import { mediaToolNames } from '../studio-package-target.mjs';

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
    if (!response.ok) throw new Error(`Media tool download failed: ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
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
