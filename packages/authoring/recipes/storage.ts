import { createId } from '@galcraft/contracts';

import { open, readFile, readdir, rename, rm, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function readOptional(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function listFiles(path: string): Promise<string[]> {
  try { return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function listDirectories(path: string): Promise<string[]> {
  try { return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function replaceFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.galcraft-${createId()}.tmp`;
  try {
    const file = await open(temporary, 'wx');
    try { await file.writeFile(content, 'utf8'); await file.sync(); }
    finally { await file.close(); }
    const sharingDelays = [25, 50, 100, 200, 400, 800];
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); break; }
      catch (error) {
        if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt >= sharingDelays.length) throw error;
        await new Promise(resolve => setTimeout(resolve, sharingDelays[attempt]));
      }
    }
  } finally { await rm(temporary, { force: true }); }
}

export function recipePath(userData: string, id: string): string { return join(userData, 'recipes', `${id}.json`); }
export function importDirectory(userData: string, planId: string): string { return join(userData, 'recipe-imports', planId); }
