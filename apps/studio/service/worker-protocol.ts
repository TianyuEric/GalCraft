import type { Id, Issue, Result } from '@galcraft/contracts';
import type { MessagePort } from 'node:worker_threads';

export type UtilityTaskRequest<Input> = {
  operationId: Id;
  script: string;
  input: Input;
  outputDirectory?: string | null;
  owner?: Issue['owner'];
};

export type UtilityConnect<Input> = {
  type: 'connect';
  operationId: Id;
  input: Input;
  outputDirectory?: string | null;
};

export type UtilityCancel = { type: 'cancel' };

export type UtilityReply<Output> =
  | { type: 'progress'; phase: string; completed?: number; total?: number }
  | { type: 'result'; value: Output }
  | { type: 'error'; code?: string; message?: string };

export type WorkerConnection<Input> = { data: UtilityConnect<Input>; ports: MessagePort[] };

export type UtilityPort<Output> = {
  on(event: 'message', listener: (event: { data: UtilityCancel }) => void): unknown;
  postMessage(value: UtilityReply<Output>): void;
  start(): void;
  close(): void;
};

export type UtilityConnection<Input, Output> = {
  data: UtilityConnect<Input>;
  ports: UtilityPort<Output>[];
};

export type UtilityTaskRunner = {
  start<Input, Output>(request: UtilityTaskRequest<Input>): Promise<Result<Output>>;
};
