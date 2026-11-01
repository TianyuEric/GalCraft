import { mountDomDialog } from './dom-dialog.js';
import { useCallback, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { completeFormHints } from './form-hints.js';
import { layoutNativeDialog } from './native-dialog.js';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export async function exitDialog(element: HTMLElement | null) {
  if (!element || reduced()) return;
  const sheet = element.classList.contains('gc-sheet');
  const duration = sheet ? 200 : 140;
  const frames = sheet ? [{ translate: '0 0' }, { translate: 'calc(100% + 12px) 0' }] : [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.98' }];
  const animations = [element.animate(frames, { duration, easing: 'ease-in', fill: 'forwards' })];
  const backdrop = element.parentElement?.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
  if (backdrop) animations.push(backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' }));
  await Promise.allSettled(animations.map(animation => animation.finished));
}
/** Keep the current modal mounted until its exit has finished, including action-button closes. */
export function useModalState<T>(initial: T) {
  const [value, update] = useState(initial), current = useRef(value), pending = useRef(false);
  current.current = value;
  const setValue = useCallback((next: SetStateAction<T>) => {
    const resolved = typeof next === 'function' ? (next as (value: T) => T)(current.current) : next;
    if (Object.is(resolved, current.current) || pending.current) return;
    const popup = current.current ? [...document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"]:not([data-ending-style])')].at(-1) ?? null : null;
    if (!popup || reduced()) { update(resolved); return; }
    pending.current = true;
    void exitDialog(popup).then(() => { pending.current = false; update(resolved); });
  }, []);
  return [value, setValue] as const;
}
export function prepareNativeDialog(dialog: HTMLDialogElement) {
  const close = dialog.close.bind(dialog);
  let surface: ReturnType<typeof mountDomDialog> | null = null, closing = false;
  dialog.showModal = () => {
    if(surface)return;
    layoutNativeDialog(dialog, document.getElementById('studio-portals')?.lang ?? 'zh-CN');
    completeFormHints(dialog, document.getElementById('studio-portals')?.lang ?? 'zh-CN');
    surface=mountDomDialog(dialog,()=>{close(dialog.returnValue);surface=null;closing=false;});
  };
  dialog.close = (value?: string) => { if(!surface||closing)return;closing=true;dialog.returnValue=value??'';surface.close(); };
  return dialog;
}
