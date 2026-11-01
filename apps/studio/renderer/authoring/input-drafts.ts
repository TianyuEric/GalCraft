import type { Json } from '@galcraft/contracts';
import type { AuthoringServices } from './controller.js';
import { studioClientId, studioEntry } from '../client-identity.js';

/** M01 keeps input values; restoration never invokes a domain edit or save. */
export class InputDraftStore {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: { projectId: string; content: Json } | null = null;
  private tail: Promise<void> = Promise.resolve();
  constructor(private api: AuthoringServices['bridge']['authoringPreferences'], private failed: (message: string) => void) {}
  async read(projectId: string): Promise<Json | null> {
    const result = await this.api.readInputDraft?.({ projectId, entry: studioEntry(), clientId: studioClientId() });
    if (!result) return null;
    if (!result.ok) { this.failed(result.error.message); return null; }
    return result.value?.content ?? null;
  }
  schedule(projectId: string, content: Json) {
    // Freeze content now: the user may change project before this write starts.
    const next = { projectId, content: structuredClone(content) };
    if (this.pending?.projectId !== projectId) void this.flush().catch(() => {});
    this.pending = next;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush().catch(() => {}); }, 180);
  }
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    const pending = this.pending; this.pending = null;
    if (pending && this.api.writeInputDraft) {
      const write = this.tail.catch(() => {}).then(async () => {
        const result = await this.api.writeInputDraft!({ schemaVersion: 1, projectId: pending.projectId, entry: studioEntry(), clientId: studioClientId(), updatedAt: new Date().toISOString(), content: pending.content });
        if (!result.ok) throw new Error(result.error.message);
      });
      this.tail = write.catch(reason => { this.failed(String(reason instanceof Error ? reason.message : reason)); throw reason; });
    }
    await this.tail;
  }
}

export type FieldInputDraft = { label: string; type: string; value: string; checked?: boolean };
/** This fallback retains fields from extension editors that expose no draft adapter. */
export function captureFieldInputs(node: HTMLElement): FieldInputDraft[] {
  return [...node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')].filter(input => input.type !== 'password' && input.type !== 'file').map((input, index) => ({
    label: input.getAttribute('aria-label') ?? input.closest('label')?.textContent?.trim() ?? input.closest('.gc-field')?.querySelector(':scope > span')?.textContent ?? `Field ${index + 1}`,
    type: input.type, value: input.value, ...(input instanceof HTMLInputElement && ['checkbox', 'radio'].includes(input.type) ? { checked: input.checked } : {}),
  }));
}
