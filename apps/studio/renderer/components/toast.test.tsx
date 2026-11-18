// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StudioToaster, studioToasts } from './toast.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount() {
  render(<><div id="studio-portals"/><input aria-label="Draft"/><StudioToaster locale="en"/></>);
  const input = screen.getByRole('textbox', { name: 'Draft' });
  input.focus();
  return input;
}

it('preserves editing focus, replaces a batch in place, and limits the visible messages to three', () => {
  const input = mount();
  act(() => {
    studioToasts.add({ id: 'batch', type: 'warning', title: 'Two fixture items failed', timeout: 0 });
    studioToasts.add({ type: 'success', title: 'Applied', timeout: 0 });
    studioToasts.add({ type: 'error', title: 'Save failed' });
  });
  expect(document.activeElement).toBe(input);
  const batch = document.querySelector('[data-message-id="batch"]');
  act(() => studioToasts.add({ id: 'batch', type: 'warning', title: 'One fixture item failed', timeout: 0 }));
  expect(screen.queryByText('Two fixture items failed')).toBeNull();
  expect(document.querySelector('[data-message-id="batch"]')).toBe(batch);
  act(() => studioToasts.add({ type: 'info', title: 'Preview updated', timeout: 0 }));
  const messages = document.querySelectorAll('.studio-toast');
  expect(messages).toHaveLength(4);
  expect(document.querySelectorAll('.studio-toast:not([data-limited])')).toHaveLength(3);
  expect([...messages].map(message => message.getAttribute('data-message-type')).sort()).toEqual(['error', 'info', 'success', 'warning']);
  expect(document.activeElement).toBe(input);
});

it('pauses the remaining timeout while hovered or reached with F6, then returns focus to the editor', () => {
  vi.useFakeTimers();
  const input = mount();
  const hoverClosed = vi.fn(), focusClosed = vi.fn();
  act(() => studioToasts.add({ title: 'Timed hover', type: 'info', timeout: 1000, onClose: hoverClosed }));
  const viewport = screen.getByRole('region', { name: 'Notifications (F6)' });
  act(() => vi.advanceTimersByTime(300));
  fireEvent.mouseEnter(viewport);
  act(() => vi.advanceTimersByTime(1500));
  expect(hoverClosed).not.toHaveBeenCalled();
  fireEvent.mouseLeave(viewport);
  act(() => vi.advanceTimersByTime(699));
  expect(hoverClosed).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(hoverClosed).toHaveBeenCalledOnce();

  act(() => studioToasts.add({ title: 'Timed focus', timeout: 1000, onClose: focusClosed }));
  fireEvent.keyDown(window, { key: 'F6' });
  expect(document.activeElement).toBe(viewport);
  act(() => vi.advanceTimersByTime(1500));
  expect(focusClosed).not.toHaveBeenCalled();
  fireEvent.keyDown(viewport, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(input);
  act(() => vi.advanceTimersByTime(1000));
  expect(focusClosed).toHaveBeenCalledOnce();
});

it('retains error and recovery messages, runs the recovery action, and resumes ordinary timing after a status update', () => {
  vi.useFakeTimers();
  const input = mount();
  const errorClosed = vi.fn(), recoveryClosed = vi.fn(), recovered = vi.fn(() => input.focus());
  act(() => {
    studioToasts.add({ id: 'save', type: 'error', title: 'Save failed', onClose: errorClosed });
    studioToasts.add({ id: 'import', type: 'warning', title: 'Batch failed', onClose: recoveryClosed,
      actionProps: { children: 'Open fixture result', onClick: recovered } });
  });
  act(() => vi.advanceTimersByTime(10000));
  expect(errorClosed).not.toHaveBeenCalled();
  expect(recoveryClosed).not.toHaveBeenCalled();
  act(() => {
    studioToasts.add({ id: 'save', title: 'Save still failed' });
    studioToasts.add({ id: 'import', title: 'Batch still failed' });
  });
  act(() => vi.advanceTimersByTime(10000));
  expect(errorClosed).not.toHaveBeenCalled();
  expect(recoveryClosed).not.toHaveBeenCalled();
  const action = screen.getByRole('button', { name: 'Open fixture result' });
  act(() => action.focus());
  fireEvent.click(action);
  expect(recovered).toHaveBeenCalledOnce();
  act(() => studioToasts.update('import', previous => ({ type: 'success', title: `Recovered: ${previous.title}`, actionProps: undefined })));
  expect(screen.getByText('Recovered: Batch still failed')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open fixture result' })).toBeNull();
  act(() => vi.advanceTimersByTime(4500));
  expect(recoveryClosed).toHaveBeenCalledOnce();
  expect(errorClosed).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'F6' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' }).at(-1)!);
  expect(errorClosed).toHaveBeenCalledOnce();
});

it.each(['add', 'update'] as const)('preserves an explicit persistent timeout during same-ID %s', method => {
  vi.useFakeTimers();
  mount();
  const closed = vi.fn();
  act(() => studioToasts.add({ id: 'persistent-info', type: 'info', timeout: 0, title: 'A', onClose: closed }));
  act(() => {
    if (method === 'add') studioToasts.add({ id: 'persistent-info', title: 'B' });
    else studioToasts.update('persistent-info', { title: 'B' });
  });
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByText('B')).toBeTruthy();
  expect(closed).not.toHaveBeenCalled();
  act(() => {
    if (method === 'add') studioToasts.add({ id: 'persistent-info', type: 'info', title: 'C' });
    else studioToasts.update('persistent-info', { type: 'info', title: 'C' });
  });
  act(() => vi.advanceTimersByTime(10000));
  expect(closed).not.toHaveBeenCalled();
});

it.each(['add', 'update'] as const)('preserves a custom error duration during same-ID %s with native timer refresh semantics', method => {
  vi.useFakeTimers();
  mount();
  const closed = vi.fn();
  act(() => studioToasts.add({ id: 'timed-error', type: 'error', timeout: 1000, title: 'A', onClose: closed }));
  act(() => vi.advanceTimersByTime(300));
  act(() => {
    if (method === 'add') studioToasts.add({ id: 'timed-error', type: 'error', title: 'B' });
    else studioToasts.update('timed-error', { type: 'error', title: 'B' });
  });
  act(() => vi.advanceTimersByTime(method === 'add' ? 999 : 699));
  expect(closed).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(closed).toHaveBeenCalledOnce();
});

it('uses a newly supplied timeout before the semantic default', () => {
  vi.useFakeTimers();
  mount();
  const closed = vi.fn();
  act(() => studioToasts.add({ id: 'explicit-transition', type: 'info', timeout: 0, title: 'A', onClose: closed }));
  act(() => studioToasts.add({ id: 'explicit-transition', type: 'error', timeout: 600, title: 'B' }));
  act(() => vi.advanceTimersByTime(599));
  expect(closed).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(closed).toHaveBeenCalledOnce();
});
