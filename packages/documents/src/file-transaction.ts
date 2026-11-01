import { createId } from '@galcraft/contracts';

import { copyFile, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { FileTxSchema, IdSchema, RelativePathSchema } from '@galcraft/contracts';
import type { FileTx, Id } from '@galcraft/contracts';

export type FileChange = { path: string; documentId: Id; revision: number; content: string | null };

export async function renameWithSharingRetry(from:string,to:string):Promise<void>{
  const sharingDelays=[25,50,100,200,400,800];
  for(let attempt=0;;attempt++){
    try{await rename(from,to);return;}
    catch(error){
      if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code??'')||attempt>=sharingDelays.length)throw error;
      await delay(sharingDelays[attempt]);
    }
  }
}

function inside(root: string, path: string): string {
  RelativePathSchema.parse(path);
  if (path.startsWith('.galcraft/')) throw new Error('Internal transaction paths cannot be edited');
  const absolute = resolve(root, ...path.split('/'));
  if (!absolute.startsWith(resolve(root) + '\\') && !absolute.startsWith(resolve(root) + '/')) throw new Error('Path escapes project');
  return absolute;
}

async function replace(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.galcraft-${createId()}.tmp`;
  try {
    const file = await open(temporary, 'w');
    try { await file.writeFile(content, 'utf8'); await file.sync(); } finally { await file.close(); }
    await renameWithSharingRetry(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeRecord(directory: string, record: FileTx): Promise<void> {
  await replace(join(directory, 'record.json'), JSON.stringify(record));
}

export async function recoverTransactions(root: string): Promise<'ready' | 'recoveryPending'> {
  const base = join(root, '.galcraft', 'transactions');
  let names: string[];
  try { names = await readdir(base); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'ready';
    throw error;
  }
  let pending = false;
  for (const name of names) {
    const directory = join(base, name);
    const raw = await readFile(join(directory, 'record.json'), 'utf8').catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if (raw === null) { await rm(directory, { recursive: true, force: true }); continue; }
    const record = FileTxSchema.parse(JSON.parse(raw));
    if (record.phase === 'committed') {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      continue;
    }
    record.phase = 'rollingBack';
    await writeRecord(directory, record);
    try {
      for (const member of record.members) {
        const target = inside(root, member.path);
        if (member.oldExists) await replace(target, await readFile(join(directory, 'old', member.path), 'utf8'));
        else await rm(target, { force: true });
      }
      await rm(directory, { recursive: true, force: true });
    } catch {
      pending = true;
    }
  }
  return pending ? 'recoveryPending' : 'ready';
}

export async function commitFiles(root: string, projectId: Id, changes: FileChange[],
  observe?: (phase: 'prepared' | 'secondInstalled' | 'beforeCommitted' | 'committed') => Promise<void>): Promise<Id> {
  IdSchema.parse(projectId);
  const status = await recoverTransactions(root);
  if (status !== 'ready') throw new Error('Project recovery is pending');
  const id = createId();
  const directory = join(root, '.galcraft', 'transactions', id);
  if (new Set(changes.map(change => change.path)).size !== changes.length) throw new Error('Duplicate file path in transaction');
  const record: FileTx = { schemaVersion: 1, id, projectId, phase: 'prepared', members: [] };
  await mkdir(directory, { recursive: true });
  try {
    for (const change of changes) {
      const target = inside(root, change.path);
      let old: string | null;
      try { old = await readFile(target, 'utf8'); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        old = null;
      }
      if (old !== null) {
        const oldPath = join(directory, 'old', change.path);
        await mkdir(dirname(oldPath), { recursive: true });
        await copyFile(target, oldPath);
      }
      if (change.content !== null) {
        const newPath = join(directory, 'new', change.path);
        await mkdir(dirname(newPath), { recursive: true });
        const file = await open(newPath, 'w');
        try { await file.writeFile(change.content, 'utf8'); await file.sync(); } finally { await file.close(); }
        if (await readFile(newPath, 'utf8') !== change.content) throw new Error(`Failed to stage ${change.path}`);
      }
      record.members.push({ path: change.path, documentId: change.documentId, revision: change.revision,
        oldExists: old !== null, newExists: change.content !== null, installed: false });
    }
    await writeRecord(directory, record);
    await observe?.('prepared');
    record.phase = 'installing';
    await writeRecord(directory, record);
    for (const [index, member] of record.members.entries()) {
      const target = inside(root, member.path);
      if (member.newExists) await replace(target, await readFile(join(directory, 'new', member.path), 'utf8'));
      else await rm(target, { force: true });
      member.installed = true;
      await writeRecord(directory, record);
      if (index === 1) await observe?.('secondInstalled');
    }
    await observe?.('beforeCommitted');
    record.phase = 'committed';
    await writeRecord(directory, record);
    await observe?.('committed');
  } catch (error) {
    if (record.phase !== 'prepared' || record.members.length) await recoverTransactions(root);
    else await rm(directory, { recursive: true, force: true });
    throw error;
  }
  await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  return id;
}
