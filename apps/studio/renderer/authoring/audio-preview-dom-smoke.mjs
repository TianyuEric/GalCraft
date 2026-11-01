import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const userData = resolve('..', '..', 'tmp', 'testing', 'authoring-audio-user-data');
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
const source = readFileSync(new URL('./audio-preview.ts', import.meta.url), 'utf8');
const compiled = source.replace(/^export type .*$/m, '')
  .replace('export function configureAudioPreview(audio: HTMLAudioElement, playback: PreviewPlayback): () => void', 'function configureAudioPreview(audio, playback)')
  .replace('let timer: ReturnType<typeof setInterval> | null = null;', 'let timer = null;')
  .replace('(ended: boolean)', '(ended)');

function wavDataUri() {
  const sampleRate = 8000;
  const samples = sampleRate * 2;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  return `data:audio/wav;base64,${wav.toString('base64')}`;
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  let exitCode = 0;
  try {
  await window.loadURL('data:text/html,<html><body></body></html>');
  const result = await window.webContents.executeJavaScript(`(async () => {
    ${compiled}
    const audio = document.createElement('audio'); document.body.append(audio);
    audio.src = ${JSON.stringify(wavDataUri())};
    configureAudioPreview(audio, { loopStartSec: 0.1, loopEndSec: 0.4 });
    let seeks = 0; audio.addEventListener('seeking', () => { seeks++; });
    await Promise.race([audio.play(), new Promise((_, reject) => setTimeout(() => reject(new Error('play timeout')), 3000))]);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const result = { domAudio: audio instanceof HTMLAudioElement, seeks, currentTime: audio.currentTime, paused: audio.paused };
    audio.pause(); return result;
  })()`);
  if (!result.domAudio || result.seeks < 2 || result.currentTime >= 0.7 || result.paused) throw new Error(`音频循环试听失败：${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
  } catch (error) {
    console.error(String(error));
    exitCode = 1;
  } finally {
    window.destroy(); app.exit(exitCode);
  }
});
