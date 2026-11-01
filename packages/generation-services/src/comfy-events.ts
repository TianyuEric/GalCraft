import type { GenerationProgress, ProviderExecutionError, WorkflowBinding } from '@galcraft/contracts';

export type ComfyMessage = { type: string; data: Record<string, any> };
/** One client identity per attempt; reconnecting or losing events never submits work. */
export class ComfyEvents {
  private messages: ComfyMessage[] = [];
  private wake: (() => void) | null = null;
  private socket: WebSocket | null = null;
  private closed = false;
  private activePrompt: string | null = null;
  private completed = new Set<string>();
  private cached = new Set<string>();
  private currentNode: string | null = null;
  private started = Date.now();
  async connect(base: string, clientId: string, factory: ((url: string) => WebSocket) | null, signal: AbortSignal): Promise<void> {
    if (!factory || signal.aborted) return;
    const url = new URL(base.replace(/\/+$/, '') + '/ws');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('clientId', clientId);
    try {
      const socket = this.socket = factory(url.href);
      socket.addEventListener('message', this.onMessage);
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); socket.removeEventListener('open', done); socket.removeEventListener('error', done); socket.removeEventListener('close', done); signal.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, 2000);
        socket.addEventListener('open', done); socket.addEventListener('error', done); socket.addEventListener('close', done); signal.addEventListener('abort', done, { once: true });
        if (socket.readyState === 1 || signal.aborted) done();
      });
      if (socket.readyState !== 1) this.close();
    } catch { this.close(); }
  }
  private onMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string' || this.closed) return;
    try {
      const value = JSON.parse(event.data);
      if (typeof value.type !== 'string' || !value.data || typeof value.data !== 'object') return;
      if (this.messages.length >= 256) { const index = this.messages.findIndex(message => message.type === 'progress'); this.messages.splice(index < 0 ? 0 : index, 1); }
      this.messages.push(value); this.wake?.();
    } catch { /* Binary previews and unrelated messages carry no task progress. */ }
  };
  drain(promptId: string): ComfyMessage[] {
    return this.messages.splice(0).filter(message => {
      if (message.data.prompt_id) {
        if (message.data.prompt_id !== promptId) return false;
        if (message.type === 'executing' || message.type === 'execution_start') this.activePrompt = promptId;
        return true;
      }
      // Older nodes omit prompt_id on progress; their preceding executing event binds this client.
      return message.type === 'progress' && this.activePrompt === promptId;
    });
  }
  progress(message: ComfyMessage, workflow: WorkflowBinding): GenerationProgress | null {
    const data = message.data;
    if (!['executing', 'executed', 'execution_cached', 'progress', 'execution_start', 'execution_success'].includes(message.type)) return null;
    if (message.type === 'executing') this.currentNode = data.node == null ? null : String(data.node);
    if (message.type === 'executed' && data.node != null) this.completed.add(String(data.node));
    if (message.type === 'execution_cached' && Array.isArray(data.nodes)) for (const node of data.nodes) { this.completed.add(String(node)); this.cached.add(String(node)); }
    const nodeId = data.node != null ? String(data.node) : this.currentNode;
    const node = nodeId ? workflow.apiGraph[nodeId] : undefined;
    const sampling = message.type === 'progress' && typeof data.value === 'number' && Number.isFinite(data.value) && typeof data.max === 'number' && Number.isFinite(data.max) && data.max > 0;
    return { phase: message.type === 'execution_cached' ? 'cached' : message.type === 'execution_start' ? 'running' : message.type === 'execution_success' || message.type === 'executing' && data.node == null ? 'fetching' : 'executing',
      scope: sampling ? 'sampling' : 'nodes', completed: sampling ? data.value : this.completed.size, total: sampling ? data.max : null,
      ...(nodeId ? { nodeId } : {}), ...(node ? { nodeType: node.class_type, nodeName: node._meta?.title ?? node.class_type } : {}),
      elapsedMs: Date.now() - this.started, updatedAt: new Date().toISOString(), cachedNodes: [...this.cached] };
  }
  error(message: ComfyMessage, promptId: string): ProviderExecutionError {
    const data = message.data;
    return { promptId, nodeId: data.node_id == null ? null : String(data.node_id), nodeType: typeof data.node_type === 'string' ? data.node_type : null,
      exceptionType: typeof data.exception_type === 'string' ? data.exception_type : null, message: String(data.exception_message ?? message.type).slice(0, 4000),
      traceback: Array.isArray(data.traceback) ? data.traceback.slice(0, 20).map((line: unknown) => String(line).slice(0, 1000)) : [], observedAt: new Date().toISOString() };
  }
  async wait(ms: number, signal: AbortSignal): Promise<void> {
    if (this.messages.length || signal.aborted) return;
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); if (this.wake === done) this.wake = null; resolve(); };
      const timer = setTimeout(done, ms); this.wake = done; signal.addEventListener('abort', done, { once: true });
    });
  }
  close(): void { this.closed = true; this.wake?.(); if (this.socket) { this.socket.removeEventListener('message', this.onMessage); this.socket.close(); } }
}
