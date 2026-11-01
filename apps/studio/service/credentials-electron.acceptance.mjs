import { app, safeStorage } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = process.env.GALCRAFT_CREDENTIAL_FIXTURE;
app.setPath('userData', directory);
void (async () => {
  await app.whenReady();
  try {
    const fixture = 'GalCraft credential fixture — 安全';
    if (safeStorage.decryptString(await readFile(join(directory, 'node-cipher.bin'))) !== fixture) throw new Error('Electron could not decrypt the Node fixture');
    await writeFile(join(directory, 'electron-cipher.bin'), safeStorage.encryptString(fixture));
    console.log('ELECTRON_CREDENTIAL_COMPATIBLE'); app.exit(0);
  } catch (error) { console.error(error.message); app.exit(1); }
})();
