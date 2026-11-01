import { cp, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPluginProject } from '../../packages/plugins/dist/development/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const generated = join(root, 'tmp/testing/plugin-development/generated-example');
if (relative(root, generated).startsWith('..')) throw new Error('Generated examples must stay in the designated test directory');
await rm(generated, { recursive: true, force: true });
await createPluginProject({ directory: generated, id: 'org.example.complete', template: 'complete' });
await cp(generated, join(root, 'plugins/development-examples/complete'), { recursive: true });
console.log('Synchronized the complete public SDK example.');
