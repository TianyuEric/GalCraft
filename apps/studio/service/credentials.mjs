import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const unavailable = message => Object.assign(new Error(message), { code: 'CREDENTIALS_UNAVAILABLE' });
function command(file, args, input) {
  const result = spawnSync(file, args, { input, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw unavailable('系统凭据存储不可用，请解锁当前用户的系统凭据存储');
  return result.stdout.trim();
}
function dpapi(value, protect) {
  const method = protect ? 'Protect' : 'Unprotect';
  const script = `Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${method}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  return Buffer.from(command('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], value.toString('base64')), 'base64');
}
function windowsKey(userData) {
  const path = join(userData, 'Local State');
  let state;
  try { state = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; state = {}; }
  if (state.os_crypt?.encrypted_key) {
    const encrypted = Buffer.from(state.os_crypt.encrypted_key, 'base64');
    if (encrypted.subarray(0, 5).toString() !== 'DPAPI') throw unavailable('系统凭据密钥格式不受支持');
    const key = dpapi(encrypted.subarray(5), false);
    if (key.length !== 32) throw unavailable('系统凭据密钥无效');
    return key;
  }
  const key = randomBytes(32);
  state.os_crypt = { ...state.os_crypt, encrypted_key: Buffer.concat([Buffer.from('DPAPI'), dpapi(key, true)]).toString('base64') };
  mkdirSync(userData, { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 }); renameSync(temporary, path);
  return key;
}
function password(appName, platform) {
  const service = `${appName} Safe Storage`;
  if (platform === 'darwin') {
    const existing = spawnSync('security', ['find-generic-password', '-a', appName, '-s', service, '-w'], { encoding: 'utf8' });
    if (existing.status === 0) return existing.stdout.trim();
    if (existing.error || existing.status !== 44) throw unavailable('请解锁 macOS 登录钥匙串');
    const created = randomBytes(16).toString('base64');
    command('security', ['add-generic-password', '-a', appName, '-s', service, '-w', created]); return created;
  }
  const existing = spawnSync('secret-tool', ['lookup', 'application', appName], { encoding: 'utf8' });
  if (existing.status === 0 && existing.stdout.trim()) return existing.stdout.trim();
  if (existing.error || ![0, 1].includes(existing.status)) throw unavailable('Secret Service 不可用，请安装 secret-tool 并解锁凭据存储');
  const created = randomBytes(16).toString('base64');
  command('secret-tool', ['store', '--label', service, 'application', appName], created); return created;
}

/** Chromium synchronous safeStorage format; shares Electron's existing personal vault. */
export function createNodeSafeStorage(userData, { appName = '@galcraft/studio' } = {}) {
  let key, initializationError;
  const platform = process.platform;
  try { key = platform === 'win32' ? windowsKey(userData) : pbkdf2Sync(password(appName, platform), 'saltysalt', platform === 'darwin' ? 1003 : 1, 16, 'sha1'); }
  catch (error) { initializationError = error; }
  const ready = () => { if (!key) throw initializationError ?? unavailable('系统凭据加密不可用'); };
  return {
    isEncryptionAvailable: () => !!key,
    encryptString(text) {
      ready();
      if (platform === 'win32') {
        const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce);
        return Buffer.concat([Buffer.from('v10'), nonce, cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]);
      }
      const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 32));
      return Buffer.concat([Buffer.from(platform === 'darwin' ? 'v10' : 'v11'), cipher.update(text, 'utf8'), cipher.final()]);
    },
    decryptString(bytes) {
      ready(); if (!bytes.length) return '';
      const version = bytes.subarray(0, 3).toString();
      if (platform === 'win32') {
        if (version !== 'v10') return dpapi(bytes, false).toString('utf8');
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(3, 15));
        decipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([decipher.update(bytes.subarray(15, -16)), decipher.final()]).toString('utf8');
      }
      if (!['v10', 'v11'].includes(version)) throw unavailable('凭据加密格式无效');
      const actualKey = platform === 'linux' && version === 'v10' ? pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1') : key;
      const decipher = createDecipheriv('aes-128-cbc', actualKey, Buffer.alloc(16, 32));
      return Buffer.concat([decipher.update(bytes.subarray(3)), decipher.final()]).toString('utf8');
    },
  };
}
