import type { DesktopBridge } from '../desktop-bridge.js';
import { studioClientId, studioEntry } from './client-identity.js';

export type LocalFileDialog = { id: number; kind: 'open' | 'save'; title?: string; properties?: string[]; defaultPath?: string; filters?: { name: string; extensions: string[] }[] };
export type LocalDirectory = { directory: string; parent: string | null; roots?: string[]; entries: { name: string; path: string; kind: 'file' | 'directory' }[] };
export type StudioServiceStatus = { pid: number; origin: string; addressChange?:{previous:string;current:string}; state: string; project: { projectId: string; sessionId: string; directory: string } | null };
export type BrowserStudioBridge = DesktopBridge & {
  service: {
    status(): Promise<StudioServiceStatus>;
    stop(): Promise<void>;
    listDirectory(directory: string | null): Promise<LocalDirectory>;
    onDialog(listener: (dialog: LocalFileDialog) => void): () => void;
    answerDialog(id: number, value: { canceled: boolean; filePaths?: string[]; filePath?: string }): Promise<void>;
    dispose(): void;
  };
};

/** Uses the same named handler surface as preload; only the transport differs. */
export async function createBrowserBridge(origin = location.origin): Promise<BrowserStudioBridge> {
  const clientId = studioClientId();
  const post = async (path: string, value: unknown) => {
    const body = JSON.stringify(value);
    const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: path === '/api/dialog' });
    const result: unknown = await response.json();
    if (!response.ok) throw new Error((result as { error?: { message?: string } }).error?.message ?? `Studio returned HTTP ${response.status}`);
    return result;
  };
  const surface = await fetch(`${origin}/api/methods`).then(response => response.json()) as Record<string, string[]>;
  const bridge: Record<string, unknown> = {};
  for (const [group, methods] of Object.entries(surface)) bridge[group] = Object.fromEntries(methods.map(method => [method, (...args: unknown[]) => post('/api/bridge', { group, method, args, clientId, entry: studioEntry() })]));
  const events = new EventSource(`${origin}/api/events?client=${encodeURIComponent(clientId)}`);
  const listen = <T>(event: string, listener: (value: T) => void) => {
    const callback = (message: Event) => listener(JSON.parse((message as MessageEvent<string>).data) as T);
    events.addEventListener(event, callback); return () => events.removeEventListener(event, callback);
  };
  bridge.onCollaborationChanged = (listener: () => void) => listen('studio:collaborationChanged', listener);
  bridge.onCollaborationNavigate = (listener: (value: unknown) => void) => listen('studio:collaborationNavigate', listener);
  (bridge.operations as Record<string, unknown>).subscribe = (listener: (value: unknown) => void) => listen('studio:operationChanged', listener);
  (bridge.assets as Record<string, unknown>).subscribeTargetVerification = (listener: (value: unknown) => void) => listen('studio:assetVerification', listener);
  (bridge.builds as Record<string, unknown>).subscribeToolchainProgress = (listener: (value: unknown) => void) => listen('studio:toolchainProgress', listener);
  bridge.service = {
    status: () => fetch(`${origin}/api/status`).then(response => response.json()),
    stop: async () => { await post('/api/stop', {}); },
    listDirectory: async (directory: string | null) => await post('/api/files/list', { directory }) as LocalDirectory,
    onDialog: (listener: (dialog: LocalFileDialog) => void) => listen('dialog', listener),
    answerDialog: async (id: number, value: unknown) => { await post('/api/dialog', { id, clientId, value }); },
    dispose: () => events.close(),
  };
  return bridge as unknown as BrowserStudioBridge;
}
