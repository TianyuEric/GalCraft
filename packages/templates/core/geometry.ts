import type { Id, VersionRef } from '@galcraft/contracts';
import type { Rect } from './layout.js';
export type AuthoringGeometry = { previewId: Id; layoutSequence: number; status: 'ready' | 'pending'; versions: VersionRef[];
  viewport: Rect; stage: Rect; parts: { componentId: Id; part: 'textBox'|'nameBox'|'toolbar'|'toolbar.trigger'; visible: boolean; rect: Rect | null }[] };
export const intersectRect = (a: Rect, b: Rect): Rect => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y),
  width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
  height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) });
const rect = (element: Element): Rect => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; };
export class PreviewGeometry {
  private value: AuthoringGeometry;
  private frame = 0;
  private disposed = false;
  private animate = false;
  private listeners = new Set<(value: AuthoringGeometry) => void>();
  private resize: ResizeObserver;
  private mutation: MutationObserver;
  constructor(readonly previewId: Id, private root: HTMLElement, private stage: HTMLElement, versions: VersionRef[],
    private offset = { x: 0, y: 0 }) {
    this.value = { previewId, layoutSequence: 0, status: 'pending', versions, viewport: rect(root), stage: rect(stage), parts: [] };
    this.resize = new ResizeObserver(() => this.invalidate()); this.resize.observe(root); this.resize.observe(stage);
    this.mutation = new MutationObserver(() => this.invalidate()); this.mutation.observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
    document.fonts.addEventListener('loadingdone', this.invalidate); this.invalidate();
  }
  read(previewId: Id): AuthoringGeometry { if (previewId !== this.previewId || this.disposed) throw new Error('预览已失效'); return structuredClone(this.value); }
  subscribe(listener: (value: AuthoringGeometry) => void) { this.listeners.add(listener); listener(this.read(this.previewId)); return () => this.listeners.delete(listener); }
  setVersions(versions: VersionRef[]) { this.value.versions = structuredClone(versions); this.invalidate(); }
  trackAnimations(enabled: boolean) { this.animate = enabled; if (enabled) this.invalidate(); }
  invalidate = () => {
    if (this.disposed) return;
    if (this.value.status !== 'pending') { this.value.status = 'pending'; this.publish(); }
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.measure(); });
  };
  private publish() { for (const listener of this.listeners) listener(structuredClone(this.value)); }
  private measure() {
    if (this.disposed) return;
    const viewport = rect(this.root), translate = (value: Rect) => ({ ...value, x: value.x + this.offset.x, y: value.y + this.offset.y });
    const parts: AuthoringGeometry['parts'] = [];
    for (const key of ['textBox', 'nameBox', 'toolbar', 'toolbar.trigger'] as const) {
      const element = this.root.querySelector<HTMLElement>(`[data-gc-part="story.${key}"]`); if (!element) continue;
      let bounds = intersectRect(rect(element), viewport), visible = !element.hidden;
      for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor); visible &&= style.display !== 'none' && style.visibility !== 'hidden';
        if (ancestor !== element && [style.overflow, style.overflowX, style.overflowY].some(value => ['hidden', 'clip', 'scroll', 'auto'].includes(value)))
          bounds = intersectRect(bounds, rect(ancestor));
        if (ancestor === this.root) break;
      }
      visible &&= bounds.width > 0 && bounds.height > 0;
      parts.push({ componentId: element.dataset.gcComponent!, part: key, visible, rect: visible ? translate(bounds) : null });
    }
    this.value = { ...this.value, status: 'ready', layoutSequence: this.value.layoutSequence + 1, viewport: translate(viewport), stage: translate(rect(this.stage)), parts };
    this.publish(); if (this.animate) this.frame = requestAnimationFrame(() => { this.frame = 0; this.measure(); });
  }
  dispose() { this.disposed = true; cancelAnimationFrame(this.frame); this.resize.disconnect(); this.mutation.disconnect();
    document.fonts.removeEventListener('loadingdone', this.invalidate); this.listeners.clear(); }
}
