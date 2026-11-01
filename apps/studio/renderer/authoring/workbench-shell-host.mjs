import { app, BrowserWindow, dialog } from 'electron';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('../../tmp/testing/workbench-shell-qa');
await mkdir(resolve(root, 'user-data'), { recursive: true });
await mkdir(resolve(root, 'project'), { recursive: true });
app.setPath('userData', resolve(root, 'user-data'));
app.on('browser-window-created', (_, window) => window.hide());
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [resolve(root, 'project')] });
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function () { return loadFile.call(this, resolve(root, 'renderer/index.html')); };
await import('../../main/main.mjs');
