import { commitFiles } from '../dist/index.js';
import { readFile } from 'node:fs/promises';

const [root, projectId, stopAt, inputFile] = process.argv.slice(2);
const changes = inputFile ? JSON.parse(await readFile(inputFile, 'utf8'))
  : ['one.json', 'two.json', 'three.json'].map((path, index) =>
    ({ path, documentId: projectId, revision: 2, content: `new-${index}` }));
await commitFiles(root, projectId, changes, async phase => {
  if (phase !== stopAt) return;
  process.stdout.write(`READY:${phase}\n`);
  await new Promise(() => setInterval(() => undefined, 1000));
});
