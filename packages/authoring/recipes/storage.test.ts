import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { replaceFile } from './storage.js';
const parent = fileURLToPath(new URL('../../../tmp/testing/', import.meta.url)), created: string[] = [];
async function temporary(label: string) { await mkdir(parent,{recursive:true});const path=await mkdtemp(join(parent,label));created.push(path);return path; }
afterEach(async()=>{for(const path of created.splice(0))await rm(path,{recursive:true,force:true});});

vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

it.skipIf(process.platform !== 'win32')('retries an observed Windows sharing violation while retaining the prior file until replacement', async () => {
  const directory = await temporary('storage-sharing-'),path=join(directory,'task.json');
  await writeFile(path,'old');
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  let attempts=0;
  vi.mocked(rename).mockImplementation(async (source,destination)=>{
    if(attempts++<2){expect(await readFile(path,'utf8')).toBe('old');throw Object.assign(new Error('sharing violation'),{code:'EPERM'});}
    return actual.rename(source,destination);
  });
  try{await replaceFile(path,'new');expect(attempts).toBe(3);expect(await readFile(path,'utf8')).toBe('new');expect(await readdir(directory)).toEqual(['task.json']);}
  finally{vi.mocked(rename).mockImplementation(actual.rename);}
});

it('retains the old target and removes staging files on a permanent write failure', async () => {
  const directory = await temporary('storage-failure-'),path=join(directory,'task.json');
  await writeFile(path,'old');
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('disk IO'),{code:'EIO'}));
  try{await expect(replaceFile(path,'new')).rejects.toMatchObject({code:'EIO'});expect(await readFile(path,'utf8')).toBe('old');expect(await readdir(directory)).toEqual(['task.json']);}
  finally{vi.mocked(rename).mockImplementation(actual.rename);}
});
