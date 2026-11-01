import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function workspacePackages(root) {
  const packages = [];
  for (const family of ['apps', 'packages', 'plugins', 'tools']) {
    for (const entry of await readdir(join(root, family), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = `${family}/${entry.name}`;
      let metadata;
      try { metadata = JSON.parse(await readFile(join(root, path, 'package.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      packages.push({ name: metadata.name, path, scripts: metadata.scripts ?? {}, dependencies: Object.keys({ ...metadata.dependencies, ...metadata.devDependencies, ...metadata.peerDependencies, ...metadata.optionalDependencies }) });
    }
  }
  return packages;
}

export function planChecks(paths, packages) {
  const files = [...new Set(paths.map(path => path.replaceAll('\\', '/').replace(/^\.\//, '')))];
  const selected = new Set();
  let tools = false, architecture = false, storybook = false, full = false;
  const documentation = path => /\.(?:md|txt)$/i.test(path) || /^docs\//.test(path) || /^(?:LICENSE|NOTICE|COPYING)(?:\.|$)/.test(path);
  for (const file of files) {
    if (documentation(file) && !/^tools\/.*\.txt$/.test(file)) continue;
    if (/^tools\/(?:ci-(?:plan|checks)(?:\.test)?|studio-npm-entry(?:\.test)?|package-studio-npm-entry)\.mjs$/.test(file)) {
      tools = true;
      continue;
    }
    const owner = packages.find(pkg => file.startsWith(`${pkg.path}/`));
    if (owner) selected.add(owner.name);
    else if (/^(?:tools|tests)\//.test(file)) { tools = true; selected.add('@galcraft/studio'); }
    else full = true;
    if (/^(?:apps|packages|plugins)\//.test(file)) architecture = true;
    if (/\.stories\.[cm]?[jt]sx?$/.test(file) || file.startsWith('apps/studio/.storybook/')) storybook = true;
  }
  if (full) { for (const pkg of packages) selected.add(pkg.name); tools = architecture = storybook = true; }
  // An exported contract or implementation can affect every actual workspace consumer.
  for (let size = -1; size !== selected.size;) {
    size = selected.size;
    for (const pkg of packages) if (pkg.dependencies.some(name => selected.has(name))) selected.add(pkg.name);
  }
  const names = [...selected].filter(name => packages.some(pkg => pkg.name === name)).sort();
  return { paths: files, packages: names, tools, architecture, storybook, install: names.length > 0 || tools || architecture || storybook };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), root = resolve(import.meta.dirname, '..');
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  let paths;
  if (args.includes('--paths')) paths = args.slice(args.indexOf('--paths') + 1);
  else if (option('--paths-file')) paths = (await readFile(resolve(option('--paths-file')), 'utf8')).split(/\r?\n/).filter(Boolean);
  else if (process.env.GALCRAFT_CI_BASE && process.env.GALCRAFT_CI_HEAD) paths = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACDMRT', process.env.GALCRAFT_CI_BASE, process.env.GALCRAFT_CI_HEAD, '--'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).filter(Boolean);
  else throw new Error('Supply --paths <repository paths>, --paths-file <newline list>, or the PR base/head environment variables.');
  const plan = planChecks(paths, await workspacePackages(root));
  const output = join(root, 'tmp/ci-plan.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(plan, null, 2));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `install=${plan.install}\n`);
  console.log(JSON.stringify(plan));
}
