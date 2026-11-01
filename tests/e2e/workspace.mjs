import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
export const testingRoot = join(repo, 'tmp/testing');
export const resultsRoot = join(repo, 'test-results');
const budget = 5_000_000_000;

function owned(path, parent) {
  const part = relative(parent, resolve(path));
  if (!part || isAbsolute(part) || part.startsWith('..')) throw new Error(`Cleanup target is outside ${parent}: ${path}`);
  return resolve(path);
}

export async function removeWorkspace(path) {
  await rm(owned(path, testingRoot), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

export async function retainedBytes(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  let total = 0;
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    total += entry.isDirectory() ? await retainedBytes(path) : (await stat(path)).size;
  }
  return total;
}

export async function checkEvidenceBudget() {
  const bytes = await retainedBytes(resultsRoot) + await retainedBytes(testingRoot);
  if (bytes >= budget) throw new Error(`Retained test evidence uses ${bytes} bytes (budget ${budget}); reuse or reduce current owned evidence before saving more.`);
  return bytes;
}

export async function prepareWorkspace(name) {
  const work = owned(join(testingRoot, name), testingRoot);
  await removeWorkspace(work);
  await mkdir(work, { recursive: true });
  return work;
}

export async function prepareResults(name) {
  await checkEvidenceBudget();
  const output = owned(join(resultsRoot, 'latest', name), join(resultsRoot, 'latest'));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  return output;
}
