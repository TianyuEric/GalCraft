// @ts-check
import { createId } from '@galcraft/contracts';
import { join } from 'node:path';

import { fail, ok } from './result.mjs';

const workerScript = join(import.meta.dirname, 'compiler-utility.mjs');

/** @typedef {import('@galcraft/contracts').Id} Id */
/** @typedef {import('@galcraft/dsl').CompileInput} CompileInput */
/** @typedef {import('./compiler-protocol.js').CompilerRequest} CompilerRequest */
/** @typedef {import('./compiler-protocol.js').CompilerReplies} CompilerReplies */

export class CompilerTasks {
  /** @type {Map<Id, import('@galcraft/contracts').Snapshot>} */
  #lastValid = new Map();
  /** @type {Map<Id, number>} */
  #generation = new Map();
  /** @type {Map<Id, CompileInput>} */
  #lastInput = new Map();
  /** @type {Map<Id, string | null>} */
  #compilers = new Map();

  /**
   * @param {import('../service/worker-protocol.js').UtilityTaskRunner} utilityTasks
   * @param {Pick<import('@galcraft/publishing/engine').EngineCatalog, 'resolveProjectEngine'> | null} engineCatalog
   */
  constructor(utilityTasks, engineCatalog = null) {
    this.utilityTasks = utilityTasks;
    this.engineCatalog = engineCatalog;
  }

  /** @param {Id} projectId */
  lastValid(projectId) {
    return ok(this.#lastValid.get(projectId) ?? null);
  }

  /** @param {Id} projectId */
  currentInput(projectId) {
    return structuredClone(this.#lastInput.get(projectId) ?? null);
  }

  /**
   * @template {CompilerRequest} Request
   * @param {Id} operationId
   * @param {Request} input
   * @returns {Promise<import('@galcraft/contracts').Result<CompilerReplies[Request['kind']]>>}
   */
  #start(operationId, input) {
    return this.utilityTasks.start({ operationId, script: workerScript, input, outputDirectory: null });
  }

  /** @param {CompileInput} input */
  async compile(input, { publish = true } = {}) {
    let compiler = null;
    if (this.engineCatalog) {
      const resolved = await this.engineCatalog.resolveProjectEngine(input.project, input.lock, 'web');
      if (!resolved.ok) return resolved;
      compiler = resolved.value.compiler;
    }
    const generation = publish ? (this.#generation.get(input.projectId) ?? 0) + 1 : null;
    if (generation !== null) this.#generation.set(input.projectId, generation);
    const result = await this.#start(input.cancelOperationId, { kind: 'compile', compileInput: input, compiler });
    if (!result.ok) return result;
    if (!result.value || typeof result.value.current !== 'boolean' || !Array.isArray(result.value.issues))
      return fail('WORKER_RESULT_MISSING', 'The compiler exited without a valid compile result. Retry the original check after correcting the worker failure.', 'M03', ['retry']);
    const current = (!publish || generation === this.#generation.get(input.projectId)) && result.value.current;
    if (publish && current) { this.#lastInput.set(input.projectId, input); this.#compilers.set(input.projectId, compiler); }
    if (publish && current && result.value.snapshot) this.#lastValid.set(input.projectId, result.value.snapshot);
    return ok({ ...result.value, current, snapshot: current ? result.value.snapshot : null,
      lastValid: this.#lastValid.get(input.projectId) ?? null });
  }

  /** @param {import('@galcraft/contracts').SemanticQuery} query */
  async querySemantic(query) {
    const compileInput = this.#lastInput.get(query.projectId);
    if (!compileInput) return fail('QUERY_STALE', '当前作品尚无编译语义索引', 'M03', ['retry']);
    const result = await this.#start(createId(), { kind: 'query', compileInput, query, compiler: this.#compilers.get(query.projectId) });
    return result.ok ? result.value : result;
  }

  /** @param {Id} projectId @param {import('./compiler-protocol.js').PluginCompilerQuery} query */
  async pluginQuery(projectId, query) {
    const compileInput = this.#lastInput.get(projectId);
    if (!compileInput) return fail('QUERY_STALE', '当前作品尚无编译语义索引', 'M03', ['retry']);
    const result = await this.#start(createId(), { kind: 'pluginQuery', compileInput, query, compiler: this.#compilers.get(projectId) });
    // The parser declares JSON statement arguments as unknown. Keep the existing JSON bridge contract.
    return result.ok ? /** @type {import('@galcraft/contracts').Result<import('@galcraft/contracts').Json>} */ (result.value) : result;
  }

  /** @param {Id} projectId @param {import('@galcraft/contracts').Json} input */
  async pluginPrepare(projectId, input) {
    const compileInput = this.#lastInput.get(projectId);
    if (!compileInput) return fail('QUERY_STALE', '当前作品尚无编译原文', 'M03', ['retry']);
    const edit = /** @type {import('./compiler-protocol.js').PluginCompilerEdit} */ (input);
    const result = await this.#start(createId(), { kind: 'pluginPrepare', compileInput, edit, compiler: this.#compilers.get(projectId) });
    return result.ok ? result.value : result;
  }

  /** @param {import('@galcraft/contracts').Source} source @param {string | null} fieldPath */
  async locate(source, fieldPath = null) {
    const compileInput = [...this.#lastInput.values()].find(input =>
      input.documents.some(document => document.documentId === source.documentId));
    if (!compileInput) return fail('QUERY_STALE', '当前位置尚无编译原文', 'M03', ['retry']);
    const result = await this.#start(createId(), { kind: 'locate', compileInput, source, fieldPath, compiler: this.#compilers.get(compileInput.projectId) });
    return result.ok ? result.value : result;
  }
}
