import { createId } from '@galcraft/contracts';
import { join } from 'node:path';

import { fail, ok } from './result.mjs';

const workerScript = join(import.meta.dirname, 'compiler-utility.mjs');

export class CompilerTasks {
  #lastValid = new Map();
  #generation = new Map();
  #lastInput = new Map();
  #compilers = new Map();

  constructor(utilityTasks, engineCatalog = null) {
    this.utilityTasks = utilityTasks;
    this.engineCatalog = engineCatalog;
  }

  lastValid(projectId) {
    return ok(this.#lastValid.get(projectId) ?? null);
  }

  currentInput(projectId) {
    return structuredClone(this.#lastInput.get(projectId) ?? null);
  }

  async compile(input, { publish = true } = {}) {
    let compiler = null;
    if (this.engineCatalog) {
      const resolved = await this.engineCatalog.resolveProjectEngine(input.project, input.lock, 'web');
      if (!resolved.ok) return resolved;
      compiler = resolved.value.compiler;
    }
    const generation = publish ? (this.#generation.get(input.projectId) ?? 0) + 1 : null;
    if (publish) this.#generation.set(input.projectId, generation);
    const result = await this.utilityTasks.start({
      operationId: input.cancelOperationId,
      script: workerScript,
      input: { kind: 'compile', compileInput: input, compiler },
      outputDirectory: null,
    });
    if (!result.ok) return result;
    if (!result.value || typeof result.value.current !== 'boolean' || !Array.isArray(result.value.issues))
      return fail('WORKER_RESULT_MISSING', 'The compiler exited without a valid compile result. Retry the original check after correcting the worker failure.', 'M03', ['retry']);
    const current = (!publish || generation === this.#generation.get(input.projectId)) && result.value.current;
    if (publish && current) { this.#lastInput.set(input.projectId, input); this.#compilers.set(input.projectId, compiler); }
    if (publish && current && result.value.snapshot) this.#lastValid.set(input.projectId, result.value.snapshot);
    return ok({ ...result.value, current, snapshot: current ? result.value.snapshot : null,
      lastValid: this.#lastValid.get(input.projectId) ?? null });
  }

  async querySemantic(query) {
    const compileInput = this.#lastInput.get(query.projectId);
    if (!compileInput) return fail('QUERY_STALE', '当前作品尚无编译语义索引', 'M03', ['retry']);
    const result = await this.utilityTasks.start({ operationId: createId(), script: workerScript,
      input: { kind: 'query', compileInput, query, compiler: this.#compilers.get(query.projectId) }, outputDirectory: null });
    return result.ok ? result.value : result;
  }

  async pluginQuery(projectId, query) {
    const compileInput = this.#lastInput.get(projectId);
    if (!compileInput) return fail('QUERY_STALE', '当前作品尚无编译语义索引', 'M03', ['retry']);
    const result = await this.utilityTasks.start({ operationId: createId(), script: workerScript,
      input: { kind: 'pluginQuery', compileInput, query, compiler: this.#compilers.get(projectId) }, outputDirectory: null });
    return result.ok ? result.value : result;
  }

  async pluginPrepare(projectId, input) {
    const compileInput = this.#lastInput.get(projectId);
    if (!compileInput) return fail('QUERY_STALE', '当前作品尚无编译原文', 'M03', ['retry']);
    const result = await this.utilityTasks.start({ operationId: createId(), script: workerScript,
      input: { kind: 'pluginPrepare', compileInput, edit: input, compiler: this.#compilers.get(projectId) }, outputDirectory: null });
    return result.ok ? result.value : result;
  }

  async locate(source, fieldPath = null) {
    const compileInput = [...this.#lastInput.values()].find(input =>
      input.documents.some(document => document.documentId === source.documentId));
    if (!compileInput) return fail('QUERY_STALE', '当前位置尚无编译原文', 'M03', ['retry']);
    const result = await this.utilityTasks.start({ operationId: createId(), script: workerScript,
      input: { kind: 'locate', compileInput, source, fieldPath, compiler: this.#compilers.get(compileInput.projectId) }, outputDirectory: null });
    return result.ok ? result.value : result;
  }
}
