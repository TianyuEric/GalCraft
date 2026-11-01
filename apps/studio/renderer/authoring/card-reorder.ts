import type { Id } from '@galcraft/contracts';

export function attachCardReorder(card: HTMLElement, list: HTMLElement, statementId: Id,
  move: (beforeId: Id | null) => void, disabled: boolean): void {
  if (disabled) return;
  let suppressClick = false;
  card.addEventListener('click', event => {
    if (!suppressClick) return;
    event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
  }, true);
  card.addEventListener('pointerdown', event => {
    const target=event.target as Element;
    const grip=target.closest('.authoring-grip');
    if (event.button !== 0 || event.pointerType==='touch' && !grip ||
      !grip && !target.closest('.authoring-direction-preview') && target.closest('button,input,textarea,select,a,[contenteditable=true]')) return;
    // Own this gesture before Chromium starts an image drag or text selection.
    event.preventDefault();
    const pointerId = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    let location = start;
    let armed = false;
    let marker: HTMLElement | null = null;
    let beforeId: Id | null | undefined;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (armed) return;
      armed = true; clearTimeout(timer);
      card.setPointerCapture(pointerId);
      card.classList.remove('drag-holding'); card.classList.add('drag-armed'); tick();
    };
    const rows = () => [...list.querySelectorAll<HTMLElement>('.authoring-card[data-statement-id]')];
    const locate = () => {
      marker?.removeAttribute('data-drop-edge'); marker = null; beforeId = undefined;
      const bounds = list.getBoundingClientRect();
      if (location.x < bounds.left || location.x > bounds.right ||
        location.y < bounds.top || location.y > bounds.bottom) return;
      const items = rows();
      const found = items.find(item => location.y < item.getBoundingClientRect().bottom);
      const target = found ?? items.at(-1); if (!target) return;
      const middle = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
      const before = found !== undefined && location.y < middle;
      const index = items.indexOf(target);
      beforeId = before ? target.dataset.statementId as Id :
        items[index + 1]?.dataset.statementId as Id | undefined ?? null;
      marker = target; marker.dataset.dropEdge = before ? 'before' : 'after';
    };
    const tick = () => {
      if (!armed) return;
      const bounds = list.parentElement!.getBoundingClientRect();
      if (location.y < bounds.top + 42) list.parentElement!.scrollTop -= 9;
      else if (location.y > bounds.bottom - 42) list.parentElement!.scrollTop += 9;
      locate(); frame = requestAnimationFrame(tick);
    };
    const cleanup = () => {
      clearTimeout(timer); cancelAnimationFrame(frame);
      marker?.removeAttribute('data-drop-edge');
      card.classList.remove('drag-holding', 'drag-armed');
      if (card.hasPointerCapture(pointerId)) card.releasePointerCapture(pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', cleanup);
      card.removeEventListener('pointercancel', cleanup);
    };
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      location = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (!armed && Math.hypot(location.x - start.x, location.y - start.y) > 5) {
        if (event.pointerType === 'touch') cleanup(); else arm();
      }
      if (armed) moveEvent.preventDefault();
    };
    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      location = { x: upEvent.clientX, y: upEvent.clientY };
      if (armed) locate();
      const target = beforeId;
      suppressClick = armed;
      cleanup();
      if (armed) setTimeout(() => { suppressClick = false; }, 0);
      if (armed && target !== undefined && target !== statementId) move(target);
    };
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault(); cleanup();
    };
    if (event.pointerType === 'touch') {
      card.classList.add('drag-holding'); timer = setTimeout(arm, 380);
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', cleanup);
    card.addEventListener('pointercancel', cleanup);
  });
}
