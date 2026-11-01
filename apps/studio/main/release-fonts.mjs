import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { officialLocaleResources } from '@galcraft/templates';
import { buildIssue } from '@galcraft/publishing/build';

const run = promisify(execFile);
const strings = value => typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings)
  : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
export async function prepareReleaseFonts({ input, snapshot, engine, files, textFiles, directory, python = process.env.GALCRAFT_FONT_PYTHON ?? 'python', subsetScript = resolve(import.meta.dirname, '../../../tools/fonts/subset.py') }) {
  const issues = [], prefix = `${input.target === 'windows' ? 'windows' : 'web'}/`, fontManifest = `${prefix}runtime/fonts.json`;
  if (!engine.manifest.files.some(file => file.path === fontManifest)) return [buildIssue('BUILD_FONT_MISSING', '引擎运行包缺少可发行的中日文完整字体及许可')];
  const catalog = JSON.parse(await readFile(join(engine.directory, fontManifest), 'utf8'));
  const faces = catalog.fonts.map(font => ({ ...font, fullPath: font.path, assetId: null }));
  if (!faces.some(face => face.language === 'zh-CN') || !faces.some(face => face.language === 'ja') || !files.some(file => file.path === catalog.license))
    return [buildIssue('BUILD_FONT_MISSING', '引擎字体或许可集合不完整')];
  for (const asset of snapshot.assets.filter(asset => asset.kind === 'font'))
    faces.push({ family: `GalCraft Asset ${asset.assetId}`, language: null, path: asset.entry, fullPath: asset.entry, assetId: asset.assetId });
  const fallback = input.font.fallbackAssetId ? faces.find(face => face.assetId === input.font.fallbackAssetId) : null;
  if (input.font.fallbackAssetId && !fallback) return [buildIssue('BUILD_FONT_FALLBACK', '完整回退字体不存在于发行集合')];
  if (input.font.mode === 'subsetStatic') {
    await mkdir(directory, { recursive: true });
    const text = [...new Set(strings([snapshot.project, snapshot.scenes, snapshot.characters, snapshot.template, snapshot.gallery, snapshot.pluginDocuments, officialLocaleResources()]).join('') + '「」“”…')].join('');
    const textFile = join(directory, 'static-text.txt'); await writeFile(textFile, text);
    for (const [index, face] of faces.entries()) {
      if (face === fallback) continue;
      const source = files.find(file => file.path === face.path);
      if (!source) { issues.push(buildIssue('BUILD_FONT_MISSING', face.path)); continue; }
      const output = join(directory, `subset-${index}.otf`), family = `GalCraft Static ${index}`;
      try {
        const result = await run(python, [subsetScript, '--font', source.source, '--text', textFile, '--output', output, '--family', family], { windowsHide: true, maxBuffer: 1024 * 1024 });
        const coverage = JSON.parse(result.stdout), path = `runtime/fonts/subset-${index}.otf`;
        files.push({ path, size: (await stat(output)).size, source: output, role: 'asset' });
        face.subset = { family, path, missing: coverage.missing };
      } catch (error) { issues.push(buildIssue('BUILD_FONT_SUBSET', `字体子集工具失败：${String(error)}`)); }
    }
  }
  textFiles['runtime/font-policy.json'] = JSON.stringify({ mode: input.font.mode, faces, fallbackAssetId: input.font.fallbackAssetId });
  return issues;
}
