import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const slash = value => value.replaceAll('\\', '/');
const skipped = new Set(['node_modules', 'dist', 'dist-storybook', 'package', '.git', 'test-results', 'tmp']);
const testFile = /(?:\.test\.|\.stories\.|\.acceptance\.|(?:^|\/)(?:tests?|__tests__|fixtures)\/)/;
// These existing real-host acceptance entrypoints intentionally assemble app adapters.
const hostFixtures = new Set([
  'apps/studio/renderer/authoring/current-version-closure-smoke.mjs',
]);

async function files(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return (await Promise.all(entries.filter(entry => !skipped.has(entry.name)).map(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.(?:[cm]?[jt]sx?|css)$/.test(entry.name) ? [file] : [];
  }))).flat();
}

export function staticImports(source, file) {
  const found = [];
  if (file.endsWith('.css')) {
    for (const match of source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) found.push({ value: match[1], offset: match.index });
    return found;
  }
  const tree = parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'], allowAwaitOutsideFunction: true });
  const add = (node, typeOnly = false) => { if (node?.type === 'StringLiteral') found.push({ value: node.value, offset: node.start, typeOnly }); };
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type))
      add(node.source, node.importKind === 'type' || node.exportKind === 'type' ||
        node.specifiers?.length > 0 && node.specifiers.every(item => item.importKind === 'type' || item.exportKind === 'type'));
    if (node.type === 'TSImportType') add(node.argument, true);
    if (node.type === 'CallExpression' && (node.callee.type === 'Import' || node.callee.type === 'Identifier' && node.callee.name === 'require')) add(node.arguments[0]);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) visit(child); });
      else if (value?.type) visit(value);
    }
  }
  visit(tree);
  return found;
}

export function importViolation(from, specifier, packages = new Map(), typeOnly = false) {
  const origin = slash(from), match = origin.match(/^(apps|packages|plugins)\/([^/]+)\//);
  if (!match) return null;
  const target = specifier.startsWith('.') ? posix.normalize(posix.join(posix.dirname(origin), specifier))
    : packages.get(specifier)?.path ?? [...packages.entries()].find(([name]) => specifier.startsWith(`${name}/`))?.[1].path ?? '';
  if (match[1] === 'packages' && target.startsWith('apps/')) return 'package-to-app';
  if (match[1] === 'apps' && target.startsWith('apps/') && target.split('/')[1] !== match[2]) return 'cross-app-internal';
  if (origin.startsWith('packages/authoring/production/') && /^(?:node:)?electron(?:\/|$)/.test(specifier)) return 'production-to-electron';
  // Renderer source is TS/JS; adjacent .mjs files are existing external host/browser drivers.
  if (match[1] === 'apps' && origin.includes('/renderer/') && !typeOnly &&
    (specifier === '@galcraft/authoring/production' || !origin.endsWith('.mjs') && /^(?:node:|electron(?:\/|$))/.test(specifier))) return 'renderer-to-node';
  if (match[1] === 'plugins' && (target.startsWith('apps/') ||
    target.startsWith('packages/') && specifier.startsWith('.') ||
    /^@galcraft\/plugins\/(?:registry|host)(?:\/|$)/.test(specifier))) return 'plugin-private-import';
  if (match[1] === 'apps' && (/(?:^|\/)plugins\/official-[^/]+\/(?:src|dist)\//.test(target) ||
    /^@galcraft\/official-[^/]+$/.test(specifier))) return 'official-business-import';
  return null;
}

export async function checkArchitecture(root) {
  const packages = new Map();
  for (const family of ['apps', 'packages', 'plugins']) {
    for (const entry of await readdir(join(root, family), { withFileTypes: true })) if (entry.isDirectory()) {
      try {
        const metadata = JSON.parse(await readFile(join(root, family, entry.name, 'package.json'), 'utf8'));
        if (metadata.name) packages.set(metadata.name, { path: `${family}/${entry.name}/` });
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const violations = [];
  let checked = 0;
  for (const family of ['apps', 'packages', 'plugins']) for (const file of await files(join(root, family))) {
    const from = slash(relative(root, file));
    if (testFile.test(from) || hostFixtures.has(from) || from.includes('/development-examples/') && !from.includes('/src/')) continue;
    const source = await readFile(file, 'utf8'); checked++;
    for (const item of staticImports(source, from)) {
      const rule = importViolation(from, item.value, packages, item.typeOnly);
      if (rule) violations.push({ file: from, line: source.slice(0, item.offset).split('\n').length, rule, import: item.value });
    }
  }
  return { checked, violations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const result = await checkArchitecture(root);
  for (const item of result.violations) console.error(`${item.file}:${item.line} ${item.rule}: ${item.import}`);
  console.log(`Architecture boundaries: ${result.checked} files, ${result.violations.length} violations`);
  if (result.violations.length) process.exitCode = 1;
}
