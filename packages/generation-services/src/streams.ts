export async function inactivityResponse(fetcher: typeof fetch, url: string, init: RequestInit, signal: AbortSignal, timeoutMs: number): Promise<Response> {
  signal.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let output: ReadableStreamDefaultController<Uint8Array> | undefined, finished = false, cancellation: Promise<void> | undefined;
  const clear = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', interrupted); };
  const abort = () => controller.abort(signal.reason);
  const interrupted = () => {
    if (finished) return;
    finished = true; clear();
    if (reader) { const source = reader; cancellation = source.cancel(controller.signal.reason).catch(() => {}).finally(() => source.releaseLock()); }
    output?.error(controller.signal.reason);
  };
  const renew = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(new DOMException('HTTP 等待无活动超时', 'TimeoutError')), timeoutMs); };
  const wait = <T>(pending: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const interrupted = () => { cleanup(); reject(controller.signal.reason); };
    const cleanup = () => controller.signal.removeEventListener('abort', interrupted);
    controller.signal.addEventListener('abort', interrupted, { once: true });
    if (controller.signal.aborted) interrupted();
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
  signal.addEventListener('abort', abort, { once: true });
  controller.signal.addEventListener('abort', interrupted, { once: true });
  if (signal.aborted) abort();
  renew();
  try {
    const response = await wait(fetcher(url, { ...init, signal: controller.signal }));
    if (!response.body) { finished = true; clear(); return response; }
    reader = response.body.getReader(); renew();
    const source = reader;
    const body = new ReadableStream<Uint8Array>({
      start(value) { output = value; },
      async pull(value) {
        try {
          const chunk = await wait(source.read());
          if (finished) return;
          if (chunk.done) { finished = true; clear(); source.releaseLock(); value.close(); }
          else { if (chunk.value.length) renew(); value.enqueue(chunk.value); }
        } catch (error) { if (!finished) { finished = true; clear(); await source.cancel(error).catch(() => {}); source.releaseLock(); value.error(error); } }
      },
      async cancel(reason) { output = undefined; controller.abort(reason); await cancellation; },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) { clear(); controller.abort(error); throw error; }
}

export async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader(), decoder = new TextDecoder(); let pending = '', done = false;
  try { while (true) { const chunk = await reader.read(); pending += decoder.decode(chunk.value, { stream: !chunk.done });
    let at: number; while ((at = pending.indexOf('\n')) >= 0) { yield pending.slice(0, at).replace(/\r$/, ''); pending = pending.slice(at + 1); }
    if (chunk.done) { done = true; break; }
  } if (pending) yield pending;
  } finally { if (!done) await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  let event = 'message', data: string[] = [];
  for await (const line of lines(body)) {
    if (line === '') { if (data.length) yield { event, data: data.join('\n') }; event = 'message'; data = []; }
    else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
}
