import { pathToFileURL } from 'node:url';
import { studioVersion } from '../apps/studio/main/studio-version.mjs';
import { bundledEngineVersion } from '../apps/studio/main/bundled-engine-version.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rm, stat, realpath } from 'node:fs/promises';
import { join, resolve, dirname, sep, relative, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { StudioProduction } from '../apps/studio/main/production-providers.mjs';

const repo = resolve(import.meta.dirname, '..'), temporaryRoot = join(repo, 'tmp/testing');
const consumer = join(temporaryRoot, 'studio-npm-maintenance'), profile = join(consumer, 'profile'), runtime = join(consumer, 'runtime');
const argument = name => { const at = process.argv.indexOf(name); if (at < 0) return undefined; if (!process.argv[at + 1]) throw new Error(`${name} requires a path`); return resolve(process.argv[at + 1]); };
const packageDirectory = argument('--package-directory') ?? join(repo, 'build/npm-studio'), suppliedTarball = argument('--tarball');
await mkdir(temporaryRoot, { recursive: true });
// An occupied task directory may still own a service; release it before reusing the directory.
await mkdir(consumer);
const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const exec = promisify(execFile);
const packageRoot = join(consumer, 'node_modules/@galcraft/studio'), cli = join(packageRoot, 'service/cli.mjs');
const serviceEnvironment = { ...process.env, TEMP: runtime, TMP: runtime };
const pathKey = Object.keys(serviceEnvironment).find(key => key.toLowerCase() === 'path') ?? 'PATH';
serviceEnvironment[pathKey] = `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${serviceEnvironment[pathKey] ?? ''}`;
const openBrowser = process.argv.includes('--open-browser');
for (const name of ['NODE_PATH', 'GALCRAFT_STUDIO_ROOT', 'GALCRAFT_BUNDLED_ROOT', 'GALCRAFT_MEDIA_TOOL_DIR', 'GALCRAFT_MATTING_MODEL_DIR', 'GALCRAFT_MOTION_CANVAS_RUNTIME', 'GALCRAFT_CHROMIUM_PATH']) delete serviceEnvironment[name];
const run = async (args, cwd) => (await exec(process.execPath, [npm, '--cache', join(consumer, 'npm-cache'), ...args], { cwd, env: serviceEnvironment, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout;
const cliCall = async command => (await exec(process.execPath, [cli, command, ...(!openBrowser || command !== 'start' ? ['--no-open'] : []), '--user-data', profile], { cwd: consumer, env: serviceEnvironment, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout;
let serverInfo, packed, tarball, summary, failure;
let origin, servicePid, phase = 'pack';
const unwrap = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
const exists = async path => { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
const waitStopped = async () => {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (!await exists(join(profile, 'studio-service/active.json')) && (!servicePid || !alive(servicePid))) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Studio service did not finish stopping; isolated consumer retained at ${consumer}`);
};
try {
  await mkdir(runtime);
  packed = JSON.parse(await run(['pack', '--json', ...(suppliedTarball ? ['--dry-run'] : ['--pack-destination', consumer])], packageDirectory))[0];
  tarball = suppliedTarball ?? join(consumer, packed.filename);
  assert(!packed.files.some(file => /resources\/practice\//.test(file.path)));
  assert(!packed.files.some(file => /(?:service|dist)\/help\/|resources\/media\/(?:doc|presets)\/|resources\/matting\/src\/.*(?:smoke|test)\.mjs/.test(file.path)
    || file.path.startsWith('resources/engines/') && !file.path.startsWith(`resources/engines/${bundledEngineVersion}/`)));
  for (const name of ['entry', 'cli', 'worker-entry', 'compiler-utility', 'style-utility']) assert(packed.files.some(file => file.path === `service/${name}.mjs`));
  phase = 'install';
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'galcraft-isolated-consumer', private: true }));
  await run(['install', tarball, '--no-audit', '--no-fund'], consumer);
  const require = createRequire(join(packageRoot, 'package.json'));
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.version, studioVersion); assert.equal(packed.version, studioVersion);
  const engineManifest = JSON.parse(await readFile(join(packageRoot, 'resources/engines', bundledEngineVersion, 'manifest.json'), 'utf8'));
  assert.equal(engineManifest.version, bundledEngineVersion);
  assert.equal(manifest.bin['galcraft-studio'], 'service/cli.mjs');
  assert.equal(manifest.engines.node, '>=22.12.0');
  assert.deepEqual(manifest.os, ['win32']); assert.deepEqual(manifest.cpu, ['x64']);
  for (const version of Object.values(manifest.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/);
  const resolved = {};
  for (const name of ['playwright', 'sharp', 'onnxruntime-node', '@resvg/resvg-js']) {
    resolved[name] = await realpath(require.resolve(name)); assert(resolved[name].startsWith(`${consumer}${sep}`));
  }
  phase = 'native-load';
  const nativeProbe = await exec(process.execPath, ['--input-type=commonjs', '-e', `
    const sharp = require('sharp'), { Resvg } = require('@resvg/resvg-js'), ort = require('onnxruntime-node');
    (async () => {
      const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#123456' } }).png().toBuffer();
      const svg = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>').render().asPng();
      const tensor = new ort.Tensor('float32', Float32Array.from([1]), [1]);
      if (!png.length || !svg.length || tensor.data[0] !== 1) throw new Error('Native load failed');
      console.log(JSON.stringify({ sharp: true, resvg: true, onnxruntime: true }));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: consumer, env: serviceEnvironment, windowsHide: true, maxBuffer: 1024 * 1024 });
  const native = JSON.parse(nativeProbe.stdout);
  phase = 'start';
  const origins = (await cliCall('start')).trim().split(/\r?\n/).filter(line => /^http:\/\/127\.0\.0\.1:\d+$/.test(line));
  assert.equal(origins.length, 1); origin = origins[0];
  const status = await fetch(`${origin}/api/status`).then(response => response.json()); assert.equal(status.userData, profile);
  servicePid = status.pid; assert(Number.isInteger(servicePid));
  const frontend = await fetch(origin); assert.equal(frontend.status, 200);
  const html = await frontend.text(); assert(html.includes('<html'));
  const rendererScript = html.match(/<script[^>]+src="([^"]+)"/)[1];
  const scriptResponse = await fetch(new URL(rendererScript, origin)); assert.equal(scriptResponse.status, 200);
  const rendererBytes = (await scriptResponse.arrayBuffer()).byteLength; assert(rendererBytes > 0);
  const call = (group, method, ...args) => fetch(`${origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group, method, args, clientId: 'NpmOne', entry: 'browser' }) }).then(response => response.json());
  phase = 'create-and-compile';
  const projectParent = join(consumer, 'projects'); await mkdir(projectParent);
  unwrap(await call('projects', 'create', { path: projectParent, name: 'Independent npm', template: 'standard', width: 960, height: 540, engineVersion: bundledEngineVersion }));
  const documents = unwrap(await call('documents', 'list'));
  const project = documents.find(document => document.files['project.json']);
  const projectData = JSON.parse(project.files['project.json']).data;
  assert.equal(projectData.engineVersion, bundledEngineVersion);
  const lock = documents.find(document => document.files['dependencies.lock.json']);
  assert.equal(JSON.parse(lock.files['dependencies.lock.json']).data.engine.version, bundledEngineVersion);
  const projectId = projectData.projectId;
  // The driver prepares JSON input from the service's real M02 documents. Only the installed service executes the compiler.
  const input = StudioProduction.prototype.compileInput({ projectId, documents: new Map(documents.map(document => [document.documentId, document])) });
  const compiled = unwrap(await call('language', 'compile', input)); assert(compiled.snapshot, JSON.stringify(compiled.issues));
  assert(!compiled.issues.some(issue => issue.severity === 'error'), JSON.stringify(compiled.issues));
  const { endpoint } = unwrap(await call('collaboration', 'start'));
  const { Client, StreamableHTTPClientTransport } = await import(pathToFileURL(createRequire(join(repo, 'apps/studio/package.json')).resolve('@modelcontextprotocol/client')).href);
  const client = new Client({ name: 'studio-npm-version-acceptance', version: studioVersion }, { versionNegotiation: { mode: 'auto' } });
  try { await client.connect(new StreamableHTTPClientTransport(new URL(endpoint))); serverInfo = client.getServerVersion(); assert.deepEqual(serverInfo, { name: 'galcraft-studio', version: manifest.version }); }
  finally { await client.close(); }
  phase = 'scss';
  const style = { id: 'NpmSty', name: 'Isolated SCSS', scope: { pageId: input.template.pages[0].id, componentId: null }, language: 'scss', sourcePath: 'ui/styles/npm.scss', sourceRevision: 1, assetIds: [], issues: [] };
  const styled = unwrap(await call('templates', 'compileStyle', { style, source: '$ink:#123456; [data-gc-part="title.workTitle"] { color:$ink; }', instanceId: input.template.instanceId }));
  assert(styled.css.includes('#123456'));
  phase = 'stop';
  await cliCall('status'); await cliCall('stop'); await waitStopped();
  assert.match(await cliCall('status', 'cli-status-stopped'), /stopped/);
  summary = { result: 'passed', node: process.version, npm: (await run(['--version'], consumer)).trim(), version: manifest.version,
    platform: `${process.platform}/${process.arch}`, checks: ['independent tarball install', 'consumer-local dependencies', 'CLI start/status/stop',
      'HTTP frontend', 'new project and engine compile', 'SCSS worker', 'MCP version'], native, tarballBytes: packed.size, stopped: true };
} catch (error) { failure = error; }
finally {
  try {
    const active = join(profile, 'studio-service/active.json'), ownerPid = join(profile, 'studio-service/owner/pid');
    if (await exists(active)) {
      const record = JSON.parse(await readFile(active, 'utf8')); servicePid ??= record.pid;
      try { await cliCall('stop'); } catch { /* The owned PID check below completes release when the CLI fails. */ }
    }
    if (!servicePid && await exists(ownerPid)) servicePid = Number(await readFile(ownerPid, 'utf8'));
    if (servicePid && alive(servicePid)) {
      if (process.platform === 'win32') await exec('taskkill.exe', ['/pid', String(servicePid), '/t', '/f'], { windowsHide: true });
      else process.kill(servicePid, 'SIGTERM');
    }
    if (!servicePid || !alive(servicePid)) await rm(active, { force: true });
    await waitStopped();
    if (failure) {
      const serviceLog = join(profile, 'studio-service/service.log');
      if (await exists(serviceLog)) console.error((await readFile(serviceLog, 'utf8')).slice(-8192));
    }
    const relativeConsumer = relative(resolve(temporaryRoot), resolve(consumer));
    assert(!isAbsolute(relativeConsumer) && relativeConsumer === 'studio-npm-maintenance');
    await rm(consumer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (cleanupError) { failure = failure ? new AggregateError([failure, cleanupError], `Check failed; cleanup also failed at ${consumer}`) : cleanupError; }
}
if (failure) {
  console.error(JSON.stringify({ result: 'failed', phase, consumer, error: String(failure),
    details: String(failure.stdout ?? '').slice(-4096) + String(failure.stderr ?? '').slice(-4096) }));
  process.exitCode = 1;
} else console.log(JSON.stringify({ ...summary, cleaned: !await exists(consumer) }));
