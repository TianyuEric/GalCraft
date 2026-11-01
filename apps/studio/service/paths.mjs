import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Shares Electron's existing application directory, including its existing vault. */
export function studioUserData(env = process.env, platform = process.platform, home = homedir()) {
  if (env.GALCRAFT_USER_DATA) return resolve(env.GALCRAFT_USER_DATA);
  return join(platform === 'win32' ? env.APPDATA ?? join(home, 'AppData/Roaming')
    : platform === 'darwin' ? join(home, 'Library/Application Support')
    : env.XDG_CONFIG_HOME ?? join(home, '.config'), '@galcraft/studio');
}
