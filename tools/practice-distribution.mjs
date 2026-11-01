import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** The same adopted media closure drives sample creation and Studio packaging. */
export function practiceMediaFiles(manifest) {
  return [...new Set([...Object.values(manifest.backgrounds), ...Object.values(manifest.home ?? {}), ...Object.values(manifest.branding ?? {}), ...Object.values(manifest.cg), ...manifest.music,
    ...Object.values(manifest.voices).flat(), ...Object.values(manifest.effects),
    ...Object.values(manifest.textures), ...Object.values(manifest.videos), ...Object.values(manifest.figures).flatMap(Object.values), ...Object.values(manifest.avatars), ...Object.values(manifest.ui), ...(manifest.authorAssets ?? [])])];
}

async function tree(directory, prefix) {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => { const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? tree(directory, path) : [path]; }))).flat();
}

/** Preserve reusable adopted sources and complete licenses; superseded media stay outside the package. */
export async function practiceDistributionFiles(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const sourceFiles = [
    'sources/voice/README.md', ...['README.md', 'lines.json', 'lines.md', 'production-summary.json', 'license-provenance.json'].map(file => `${manifest.voiceSources}/${file}`),
    ...Object.values(manifest.effects).map(path => `sources/audio/${path.split('/').at(-1).replace(/\.[^.]+$/, '.json')}`),
    ...(await Promise.all(['sources/images', 'sources/music', manifest.videoSources, 'sources/textures', 'licenses'].map(prefix => tree(directory, prefix)))).flat(),
  ];
  const files = [...new Set(['manifest.json', 'README.md', 'coverage.md', 'source-index.md', ...practiceMediaFiles(manifest), ...sourceFiles])].sort();
  for (const path of files) {
    if (!path || path.includes('\\') || path.startsWith('/') || path.split('/').some(part => part === '..' || part === '.')) throw new Error(`Invalid sample distribution path: ${path}`);
    if (!(await stat(join(directory, path))).isFile()) throw new Error(`Sample distribution entry is not a file: ${path}`);
  }
  return { manifest, media: practiceMediaFiles(manifest), files };
}

export async function stagePracticeDistribution(source, destination) {
  const closure = await practiceDistributionFiles(source), target = resolve(destination);
  for (const path of closure.files) {
    const output = resolve(target, path), local = relative(target, output);
    if (local === '..' || local.startsWith(`..${sep}`) || resolve(source) === target) throw new Error('Sample staging must copy to an independent directory');
    await mkdir(dirname(output), { recursive: true }); await copyFile(join(source, path), output);
  }
  return closure;
}

export async function verifyPracticeDistribution(source, destination) {
  const closure = await practiceDistributionFiles(source), actual = (await tree(destination, '')).sort();
  if (JSON.stringify(actual) !== JSON.stringify(closure.files)) throw new Error('Packaged sample files differ from the adopted media/source closure');
  for (const path of closure.files) if ((await stat(join(destination, path))).size !== (await stat(join(source, path))).size) throw new Error(`Packaged sample file differs: ${path}`);
  return closure;
}
