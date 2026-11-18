import type { RuntimeTemplate } from '@galcraft/contracts';
import type { ProjectSession } from '@galcraft/documents';
import { CollaborationError } from '@galcraft/collaboration';

export type PreviewCaptureOptions = { project?: ProjectSession; template?: RuntimeTemplate; signal?: AbortSignal };

export function awaitPreviewCapture<T>(work: Promise<T>, signal?: AbortSignal, timeoutMs = 45_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  let abort: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new CollaborationError('CANCELLED', 'The isolated Player preview was stopped.'));
    timeout = setTimeout(() => reject(new CollaborationError('PREVIEW_TIMEOUT', 'Player capture timed out. Query the original callId before capturing again.')), timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  return Promise.race([work, cancelled]).finally(() => {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  });
}
