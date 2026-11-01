import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { UtilityTasks } from '../../../apps/studio/main/utility-tasks.mjs';
import { modelPath, toolManifest } from './matting.mjs';

const require = createRequire(new URL('../../../apps/studio/package.json', import.meta.url));
const { app, utilityProcess, MessageChannelMain } = require('electron');
app.disableHardwareAcceleration();
const [outputRootArg, modelDirectoryArg] = process.argv.slice(-2);
if (!outputRootArg || !modelDirectoryArg)
  throw new Error('Usage: electron prepare-smoke.mjs output-directory model-directory|fresh');
const outputRoot = resolve(outputRootArg);
mkdirSync(outputRoot, { recursive: true });
app.setPath('userData', join(outputRoot, 'electron-user-data'));

app.whenReady().then(async () => {
  const tasks = new UtilityTasks({ utilityProcess, MessageChannelMain });
  const script = join(import.meta.dirname, 'worker.mjs');
  const fresh = modelDirectoryArg === 'fresh';
  const modelDirectory = fresh ? join(outputRoot, `first-use-${randomUUID()}`) : resolve(modelDirectoryArg);
  const needsDownload = !existsSync(modelPath(modelDirectory));
  const events = [];
  let lastPhase;
  let nextReport = 16 * 1024 * 1024;
  tasks.on('changed', event => {
    events.push(event);
    if (event.phase !== lastPhase || (event.phase === 'downloading' && event.completed >= nextReport)) {
      process.stdout.write(`${JSON.stringify({ phase: event.phase, completed: event.completed, total: event.total })}\n`);
      lastPhase = event.phase;
      if (event.phase === 'downloading' && event.completed >= nextReport)
        nextReport = event.completed + 16 * 1024 * 1024;
    }
  });
  const run = operationId => tasks.start({ operationId, owner: 'M04', script,
    input: { kind: 'prepareModel', modelDirectory }, outputDirectory: null });
  const firstId = randomUUID();
  const first = await run(firstId);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.value.state, 'ready');
  assert.equal(first.value.modelVersion, toolManifest.release);
  assert.deepEqual(first.value.input, toolManifest.input.shape);
  assert.deepEqual(first.value.output, toolManifest.output.shape);
  const firstPhases = events.filter(event => event.operationId === firstId).map(event => event.phase);
  if (needsDownload) {
    assert(firstPhases.includes('downloading'));
    assert(firstPhases.includes('verifying'));
  } else assert(!firstPhases.includes('downloading'));
  assert(firstPhases.includes('ready'));
  const secondId = randomUUID();
  const second = await run(secondId);
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.value.state, 'ready');
  assert.equal(second.value.bytes, first.value.bytes);
  const secondPhases = events.filter(event => event.operationId === secondId).map(event => event.phase);
  assert(secondPhases.includes('ready'));
  assert(!secondPhases.includes('downloading'));
  const report = { fresh, needsDownload, first: first.value, firstPhases,
    firstProgressSamples: events.filter(event => event.operationId === firstId && event.phase === 'downloading')
      .length, second: second.value, secondPhases };
  await writeFile(join(outputRoot, 'prepare-smoke.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
  app.quit();
}).catch(error => { process.stderr.write(`${error.stack ?? error}\n`); app.exit(1); });
