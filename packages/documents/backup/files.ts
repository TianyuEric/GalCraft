import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { RelativePathSchema } from '@galcraft/contracts';
export async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
export function under(root: string, path: string): string { RelativePathSchema.parse(path); const target = resolve(root, ...path.split('/')); if (!target.startsWith(resolve(root) + sep)) throw new Error(`路径越界：${path}`); return target; }
export async function listFiles(root: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(prefix ? under(root, prefix) : root, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, path)); else if (entry.isFile()) files.push(path);
  }
  return files;
}
export async function put(path: string, bytes: string | Uint8Array): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); }
export async function atomicJson(path: string, data: unknown): Promise<void> { await put(`${path}.tmp`, JSON.stringify(data, null, 2)); await rename(`${path}.tmp`, path); }
export async function removeOwned(root: string, target: string): Promise<void> { const absolute = resolve(target); if (!absolute.startsWith(resolve(root) + sep)) throw new Error('不能清理操作目录之外的路径'); await rm(absolute, { recursive: true, force: true }); }
export async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T; }
