import type { Id } from '@galcraft/contracts';

type Drop = Id | null;

/** Map a visible gap onto the list left after lifting the moved statements. */
export function commandMoveTarget(order: readonly Id[], moved: readonly Id[], gap: Drop): Drop | undefined {
  const moving = new Set(moved);
  const at = gap === null ? order.length : order.indexOf(gap);
  if (at < 0) return undefined;
  const beforeId = order.slice(at).find(id => !moving.has(id)) ?? null;
  const remaining = order.filter(id => !moving.has(id));
  const insertAt = beforeId === null ? remaining.length : remaining.indexOf(beforeId);
  const block = order.filter(id => moving.has(id));
  const result = [...remaining.slice(0, insertAt), ...block, ...remaining.slice(insertAt)];
  return result.some((id, index) => id !== order[index]) ? beforeId : undefined;
}

type Reorder = {
  list: HTMLElement;
  handle: HTMLElement;
  event: PointerEvent;
  order: readonly Id[];
  moved: readonly Id[];
  drop(beforeId: Drop): void;
};

/** Own pointer capture, edge scrolling, and transient markers for one gesture. */
export function startCommandReorder({ list, handle, event, order, moved, drop }: Reorder) {
  const document = list.ownerDocument, view = document.defaultView!;
  const pointerId = event.pointerId, startX = event.clientX, startY = event.clientY;
  const gaps = new Map(Array.from(list.querySelectorAll<HTMLElement>('[data-command-gap]'), element =>
    [element.dataset.commandGap || null, element] as const));
  const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-command-row]'));
  const moving = new Set(moved);
  const lifted = rows.filter(row => moving.has(row.dataset.commandRow!));
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  let x = startX, y = startY, frame = 0, dragging = false;
  let previousGap: Drop | undefined, target: Drop | undefined, marker: HTMLElement | undefined;

  function locate(bounds: DOMRect) {
    let position: Drop | undefined;
    if (x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom) {
      const hit = document.elementFromPoint(x, y);
      const gap = hit?.closest<HTMLElement>('[data-command-gap]');
      const row = hit?.closest<HTMLElement>('[data-command-row]');
      if (gap && list.contains(gap)) position = gap.dataset.commandGap || null;
      else if (row?.dataset.commandRow && list.contains(row)) {
        const rect = row.getBoundingClientRect();
        const id = row.dataset.commandRow;
        position = y < rect.top + rect.height / 2 ? id : order[order.indexOf(id) + 1] ?? null;
      } else if (hit && list.contains(hit)) position = null;
    }
    if (position === previousGap) return;
    previousGap = position;
    target = position === undefined ? undefined : commandMoveTarget(order, moved, position);
    const next = target === undefined ? undefined : gaps.get(target);
    if (marker === next) return;
    marker?.removeAttribute('data-drop-target');
    marker = next;
    marker?.setAttribute('data-drop-target', '');
  }

  function tick() {
    const bounds = list.getBoundingClientRect();
    if (!list.isConnected || !bounds.width || !bounds.height) { cancel(); return; }
    if (x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom) {
      const edge = Math.min(36, bounds.height / 3);
      const distance = Math.min(y - bounds.top, bounds.bottom - y);
      if (distance < edge) {
        const speed = Math.ceil(12 * (1 - distance / edge));
        list.scrollTop += y < bounds.top + edge ? -speed : speed;
      }
    }
    locate(bounds);
    frame = view.requestAnimationFrame(tick);
  }

  function cancel() {
    controller.abort();
    view.cancelAnimationFrame(frame);
    marker?.removeAttribute('data-drop-target');
    list.removeAttribute('data-reordering');
    lifted.forEach(row => row.removeAttribute('data-command-lifted'));
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  }

  handle.setPointerCapture(pointerId);
  view.addEventListener('pointermove', next => {
    if (next.pointerId !== pointerId) return;
    x = next.clientX; y = next.clientY;
    if (dragging || Math.hypot(x - startX, y - startY) < 4) return;
    dragging = true;
    list.setAttribute('data-reordering', '');
    lifted.forEach(row => row.setAttribute('data-command-lifted', ''));
    tick();
  }, options);
  view.addEventListener('pointerup', next => {
    if (next.pointerId !== pointerId) return;
    x = next.clientX; y = next.clientY;
    if (dragging) locate(list.getBoundingClientRect());
    cancel();
    if (dragging && target !== undefined) drop(target);
  }, options);
  const cancelPointer = (next: PointerEvent) => { if (next.pointerId === pointerId) cancel(); };
  view.addEventListener('pointercancel', cancelPointer, options);
  handle.addEventListener('lostpointercapture', cancelPointer, options);
  view.addEventListener('blur', cancel, options);
  view.addEventListener('keydown', next => {
    if (next.key !== 'Escape') return;
    next.preventDefault();
    next.stopPropagation();
    cancel();
  }, options);
  return cancel;
}
