import { app, BrowserWindow, session } from 'electron';
const url = process.argv.at(-1);
app.whenReady().then(async () => {
session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  callback({ cancel: /^https?:/.test(details.url) && new URL(details.url).origin !== new URL(url).origin });
});
const window = new BrowserWindow({ width: 1280, height: 800, show: true,
  webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
await window.loadURL(url);
});
