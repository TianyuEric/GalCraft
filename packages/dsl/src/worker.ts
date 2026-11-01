import type { CompileInput } from './compiler.js';
import type { ParseInput } from './parser.js';
import type { FieldPatchInput } from './editing.js';
import type { SemanticQuery } from './semantic.js';
import { LanguageService } from './service.js';

export type WorkerRequest =
  | { requestId: string; kind: 'parse'; input: ParseInput }
  | { requestId: string; kind: 'compile'; input: Omit<CompileInput, 'signal'> }
  | { requestId: string; kind: 'patchFields'; input: FieldPatchInput }
  | { requestId: string; kind: 'querySemantic'; input: SemanticQuery }
  | { requestId: string; kind: 'cancel'; operationId: string };
export type WorkerResponse = { requestId: string; kind: 'result'; value: unknown } | { requestId: string; kind: 'error'; message: string };

const service = new LanguageService();
const operations = new Map<string, AbortController>();
const worker = self as unknown as { postMessage(message: WorkerResponse): void; onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null };
worker.onmessage = event => {
  const request = event.data;
  if (request.kind === 'cancel') { operations.get(request.operationId)?.abort(); return; }
  const respond = (value: unknown) => worker.postMessage({ requestId: request.requestId, kind: 'result', value });
  try {
    switch (request.kind) {
      case 'parse': respond(service.parse(request.input)); break;
      case 'patchFields': respond(service.patchFields(request.input)); break;
      case 'querySemantic': respond(service.querySemantic(request.input)); break;
      case 'compile': {
        const controller = new AbortController();
        operations.set(request.input.cancelOperationId, controller);
        void service.compile({ ...request.input, signal: controller.signal }).then(respond, error => worker.postMessage({ requestId: request.requestId, kind: 'error', message: String(error) }))
          .finally(() => operations.delete(request.input.cancelOperationId));
        break;
      }
    }
  } catch (error) { worker.postMessage({ requestId: request.requestId, kind: 'error', message: String(error) }); }
};
