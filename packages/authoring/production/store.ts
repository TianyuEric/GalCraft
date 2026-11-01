import { createId } from '@galcraft/contracts';

import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { IdSchema } from '@galcraft/contracts';
import type { Artifact, Id } from '@galcraft/contracts';
import { listDirectories, readOptional, replaceFile } from '../recipes/storage.js';
import type { Candidate, ProductionFormDraft, Task, TaskPlan } from './types.js';

export class ProductionStore {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly userData: string, readonly projectId: Id) { IdSchema.parse(projectId); }
  path(...parts: string[]): string { return join(this.userData, 'tasks', this.projectId, ...parts); }
  async write(path: string, value: unknown): Promise<void> {
    const content = JSON.stringify(value, null, 2) + '\n';
    const pending = this.tail.catch(() => {}).then(() => replaceFile(path, content)); this.tail = pending; await pending;
  }
  async read<T>(path: string): Promise<T | null> { const raw = await readOptional(path); return raw === null ? null : JSON.parse(raw) as T; }
  taskPath(id: Id): string { return this.path(IdSchema.parse(id), 'task.json'); }
  saveTask(task: Task): Promise<void> { return this.write(this.taskPath(task.id), task); }
  async tasks(): Promise<Task[]> { const result: Task[] = []; for (const id of await listDirectories(this.path())) {
    if (!IdSchema.safeParse(id).success) continue; const task = await this.read<Task>(this.taskPath(id)); if (task) result.push(task);
  } return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  planPath(id: Id): string { return this.path('plans', `${IdSchema.parse(id)}.json`); }
  savePlan(plan: TaskPlan): Promise<void> { return this.write(this.planPath(plan.planId), plan); }
  draftPath(id: Id): string { return join(this.userData, 'task-drafts', this.projectId, `${IdSchema.parse(id)}.json`); }
  candidatePath(task: Id, item: Id, candidate: Id): string { return this.path(IdSchema.parse(task), 'items', IdSchema.parse(item), 'candidates', IdSchema.parse(candidate)); }
  async saveCandidate(candidate: Candidate): Promise<void> { await this.write(join(this.candidatePath(candidate.taskId, candidate.itemId, candidate.id), 'candidate.json'), candidate); }
  async candidates(task: Task): Promise<Candidate[]> {
    const result: Candidate[] = [];
    for (const item of task.items) for (const id of await listDirectories(this.path(task.id, 'items', item.id, 'candidates'))) {
      if (!IdSchema.safeParse(id).success) continue;
      const value = await this.read<Candidate>(join(this.candidatePath(task.id, item.id, id), 'candidate.json')); if (value) result.push(value);
    } return result;
  }
  async freezeAttachments(task: Task): Promise<void> {
    const copied = new Map<string, string>();
    const visit = async (value: unknown): Promise<void> => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { for (const item of value) await visit(item); return; }
      const object = value as Record<string, unknown>;
      if (typeof object.localPath === 'string' && typeof object.mime === 'string') {
        const source = object.localPath;
        if (!copied.has(source)) { const folder = this.path(task.id, 'inputs'); await mkdir(folder, { recursive: true });
          const destination = join(folder, `${createId()}-${basename(source)}`); await copyFile(source, destination); copied.set(source, destination); }
        object.localPath = copied.get(source)!;
      }
      for (const item of Object.values(object)) await visit(item);
    };
    await visit(task);
  }
  async discardDraft(id: Id): Promise<void> { await rm(this.draftPath(id), { force: true }); }
  loadDraft(id: Id): Promise<ProductionFormDraft | null> { return this.read(this.draftPath(id)); }
  async text(candidate: Candidate, selected?: Artifact): Promise<string> {
    const first = candidate.artifacts.find(value => value.kind === 'text');
    // Candidate-level editing displays and replaces the first text artifact.
    if (candidate.editedText !== null && (!selected || selected === first)) return candidate.editedText;
    const artifact = selected ?? first; return artifact ? readFile(artifact.localPath, 'utf8') : '';
  }
}
