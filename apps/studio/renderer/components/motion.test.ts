import { afterEach, describe, expect, it, vi } from 'vitest';
import { exitDialog } from './motion.js';

afterEach(() => vi.unstubAllGlobals());

function popup(sheet = false) {
  let finishPopup!: () => void, finishBackdrop!: () => void;
  const animatePopup = vi.fn(() => ({ finished: new Promise<void>(resolve => { finishPopup = resolve; }) }));
  const animateBackdrop = vi.fn(() => ({ finished: new Promise<void>(resolve => { finishBackdrop = resolve; }) }));
  const element = { classList: { contains: (name: string) => sheet && name === 'gc-sheet' }, animate: animatePopup,
    parentElement: { querySelector: () => ({ animate: animateBackdrop }) } } as unknown as HTMLElement;
  return { element, animatePopup, animateBackdrop, finishPopup: () => finishPopup(), finishBackdrop: () => finishBackdrop() };
}
function motionPreference(matches: boolean) {
  vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches })) });
}

describe('dialog exit lifecycle', () => {
  it('slides a sheet to the right and waits for both popup and backdrop before completion', async () => {
    motionPreference(false);
    const sheet = popup(true), completed = vi.fn();
    const exiting = exitDialog(sheet.element).then(completed);
    expect(sheet.animatePopup.mock.calls[0]).toEqual([[{ translate: '0 0' }, { translate: 'calc(100% + 12px) 0' }], expect.objectContaining({ duration: 200 })]);
    expect(completed).not.toHaveBeenCalled();
    sheet.finishPopup(); await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    sheet.finishBackdrop(); await exiting;
    expect(completed).toHaveBeenCalledOnce();
  });
  it('keeps the ordinary dialog exit and completes when its animations finish', async () => {
    motionPreference(false);
    const dialog = popup(), exiting = exitDialog(dialog.element);
    expect(dialog.animatePopup.mock.calls[0]).toEqual([[{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.98' }], expect.objectContaining({ duration: 140 })]);
    dialog.finishPopup(); dialog.finishBackdrop(); await exiting;
  });
  it('closes without animation when reduced motion is requested', async () => {
    motionPreference(true);
    const sheet = popup(true);
    await exitDialog(sheet.element);
    expect(sheet.animatePopup).not.toHaveBeenCalled();
    expect(sheet.animateBackdrop).not.toHaveBeenCalled();
    await exitDialog(null);
  });
});
