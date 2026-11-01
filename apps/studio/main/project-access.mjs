import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { IdSchema, RefSchema } from '@galcraft/contracts';

export class ProjectAccess {
  #sessions = new Map();
  #selected = new Set();

  async approveDirectory(path) {
    const absolute = resolve(path);
    if (!isAbsolute(path) || !(await stat(absolute)).isDirectory()) throw new Error('Expected an existing absolute project directory');
    this.#selected.add(absolute);
    return absolute;
  }

  wasSelected(path) { return this.#selected.has(resolve(path)); }

  async attach({ projectId, sessionId, path, resolveEntityDirectory }) {
    IdSchema.parse(projectId);
    IdSchema.parse(sessionId);
    const absolute = resolve(path);
    if (!isAbsolute(path) || !(await stat(absolute)).isDirectory()) throw new Error('Expected an existing absolute project directory');
    if (this.#sessions.has(sessionId)) throw new Error('Session already attached');
    this.#sessions.set(sessionId, { projectId, path: absolute, resolveEntityDirectory });
  }

  getRoot(sessionId) { return this.#sessions.get(IdSchema.parse(sessionId))?.path ?? null; }

  async resolveEntityDirectory(input) {
    const ref = RefSchema.parse(input);
    for (const session of this.#sessions.values()) {
      if (ref.kind === 'project' && ref.id === session.projectId) return session.path;
      const path = await session.resolveEntityDirectory?.(ref);
      if (path) return path;
    }
    return null;
  }

  release(sessionId) { this.#sessions.delete(IdSchema.parse(sessionId)); }
}
