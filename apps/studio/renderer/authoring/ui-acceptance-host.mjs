import { app, dialog } from 'electron';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Runs the production main entry with an isolated profile and a deterministic file picker.
const testing = resolve('../../tmp/testing/ui-refactor');
await mkdir(resolve(testing, 'user-data'), { recursive: true });
app.setPath('userData', resolve(testing, 'user-data'));
dialog.showOpenDialog = async (_window, options) => ({ canceled: false,
  filePaths: [resolve(testing, options.properties.includes('openDirectory') ? 'project' : 'import.png')] });
await import('../../main/main.mjs');
