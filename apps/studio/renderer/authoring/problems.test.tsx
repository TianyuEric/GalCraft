// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Problems, type ProblemsState, type WorkbenchProblem } from './problems.js';

afterEach(cleanup);

const problem = (id: string, severity: 'error' | 'warning' | 'info', group: string, object: string): WorkbenchProblem => ({
  id, group,
  issue: { code: 'PROBLEM_TEST', message: `${object} needs attention.`, severity, owner: 'M01', related: [], actions: [], messageParams: { object } },
});
const initial: ProblemsState = { query: '', severity: 'all', selected: null, scrollTop: 0 };

it('keeps the current filter, focused input, selection, scroll and disclosure across result updates', () => {
  const entries = [problem('warning', 'warning', 'Opening scene', 'Mira'), problem('info', 'info', 'Closing scene', 'Eli')];
  let latest = initial;
  function Harness({ problems }: { problems: WorkbenchProblem[] }) {
    const [state, setState] = useState(initial);
    return <Problems problems={problems} locale="en" state={state} onStateChange={next => { latest = next; setState(next); }} />;
  }
  const view = render(<Harness problems={entries} />);
  const search = within(view.container).getByRole('searchbox', { name: 'Search problems' });
  fireEvent.change(search, { target: { value: 'Mira' } });
  expect(view.container.querySelectorAll('[data-problem-id]')).toHaveLength(1);
  const row = view.container.querySelector<HTMLElement>('[data-problem-id="warning"]')!;
  fireEvent.click(within(row).getByRole('button', { name: /Diagnostic details:/ }));
  expect(row.querySelector('pre')?.hidden).toBe(false);
  const list = view.container.querySelector<HTMLElement>('.gc-problems-list')!;
  fireEvent.scroll(list, { target: { scrollTop: 64 } });
  search.focus();
  view.rerender(<Harness problems={[...entries, problem('new', 'error', 'New scene', 'New object')]} />);
  expect(document.activeElement).toBe(search);
  expect((search as HTMLInputElement).value).toBe('Mira');
  expect(latest).toEqual({ query: 'Mira', severity: 'all', selected: 'warning', scrollTop: 64, expanded: 'warning' });
  expect(list.scrollTop).toBe(64);
  expect(row.querySelector('pre')?.hidden).toBe(false);
  expect(within(row).getByRole('button', { pressed: true })).toBeTruthy();
});

it('orders errors first and exposes only an action supplied by the result owner', () => {
  const run = vi.fn();
  const warning = problem('warning', 'warning', 'Opening scene', 'Mira');
  const error = { ...problem('error', 'error', 'Opening scene', 'Mira'), action: { label: 'Open scene', run } };
  const view = render(<Problems problems={[warning, error]} locale="en" state={initial} onStateChange={() => {}} />);
  expect([...view.container.querySelectorAll('[data-problem-id]')].map(row => row.getAttribute('data-problem-id'))).toEqual(['error', 'warning']);
  fireEvent.click(within(view.container).getByRole('button', { name: 'Open scene' }));
  expect(run).toHaveBeenCalledOnce();
  expect(within(view.container).queryByRole('button', { name: /ignore|recheck/i })).toBeNull();
});

it('distinguishes an incomplete check, no current problems, and an empty filtered result', () => {
  const props = { locale: 'en', state: initial, onStateChange: () => {} };
  const view = render(<Problems {...props} problems={[]} pending />);
  expect(within(view.container).getByRole('status').textContent).toBe('Check incomplete. Previous results are kept.');
  expect(within(view.container).queryByText('No current problems.')).toBeNull();
  view.rerender(<Problems {...props} problems={[]} />);
  expect(within(view.container).getByRole('status').textContent).toBe('No current problems.');
  view.rerender(<Problems {...props} problems={[problem('info', 'info', 'Opening scene', 'Mira')]} state={{ ...initial, severity: 'error' }} />);
  expect(within(view.container).getByRole('status').textContent).toBe('No problems match these filters.');
});

it('delegates ignoring an operation attempt without changing the owner receipt or running recovery or checks', () => {
  const run = vi.fn(), onToggleIgnore = vi.fn(), onRecheck = vi.fn();
  const entry: WorkbenchProblem = { ...problem('save', 'error', 'Save', 'Opening scene'), attemptKeys: ['save:scene:1'], action: { label: 'View save source', run } };
  const receipt = structuredClone(entry.issue);
  const view = render(<Problems problems={[entry]} locale="en" state={initial} onStateChange={() => {}}
    onToggleIgnore={onToggleIgnore} onRecheck={onRecheck} />);
  fireEvent.click(within(view.container).getByRole('button', { name: 'Ignore this attempt' }));
  expect(onToggleIgnore).toHaveBeenCalledExactlyOnceWith(entry);
  expect(entry.issue).toEqual(receipt);
  expect(entry.ignored).toBeUndefined();
  expect(run).not.toHaveBeenCalled();
  expect(onRecheck).not.toHaveBeenCalled();
  expect(view.container.querySelector('[data-problem-id="save"]')).not.toBeNull();
  view.rerender(<Problems problems={[{ ...entry, ignored: true }]} locale="en" state={initial} onStateChange={() => {}}
    onToggleIgnore={onToggleIgnore} onRecheck={onRecheck} />);
  expect(view.container.querySelector('[data-problem-id="save"]')).toBeNull();
  expect(within(view.container).getByRole('status').textContent).toBe('No pending problems. 1 ignored.');
  expect(within(view.container).queryByText('No current problems.')).toBeNull();
});

it('keeps search, selection, scroll, original details and owner actions when ignoring and bringing an attempt back', () => {
  const run = vi.fn();
  const entry = { ...problem('save', 'error', 'Save', 'Mira'), attemptKeys: ['save:1'], action: { label: 'View save source', run } };
  const alreadyIgnored = { ...problem('import', 'warning', 'Import', 'Mira image'), attemptKeys: ['import:1'], ignored: true };
  let latest = initial;
  function Harness() {
    const [state, setState] = useState(initial), [entries, setEntries] = useState<WorkbenchProblem[]>([entry, alreadyIgnored]);
    return <Problems problems={entries} locale="en" state={state} onStateChange={next => { latest = next; setState(next); }}
      onToggleIgnore={target => setEntries(current => current.map(item => item.id === target.id ? { ...item, ignored: !item.ignored } : item))} />;
  }
  const view = render(<Harness />);
  const search = within(view.container).getByRole('searchbox', { name: 'Search problems' });
  fireEvent.change(search, { target: { value: 'Mira' } });
  const originalRow = view.container.querySelector<HTMLElement>('[data-problem-id="save"]')!;
  fireEvent.click(within(originalRow).getByRole('button', { name: /Diagnostic details:/ }));
  const details = originalRow.querySelector('pre')!.textContent;
  const list = view.container.querySelector<HTMLElement>('.gc-problems-list')!;
  fireEvent.scroll(list, { target: { scrollTop: 64 } });
  fireEvent.click(within(originalRow).getByRole('button', { name: 'Ignore this attempt' }));
  expect(run).not.toHaveBeenCalled();
  fireEvent.click(within(view.container).getByRole('button', { name: 'Ignored (2)' }));
  const ignoredRow = view.container.querySelector<HTMLElement>('[data-problem-id="save"]')!;
  expect(ignoredRow.querySelector('pre')?.hidden).toBe(false);
  expect(ignoredRow.querySelector('pre')?.textContent).toBe(details);
  expect(within(ignoredRow).getByText('Ignored this attempt')).toBeTruthy();
  expect(within(ignoredRow).getByText('Mira needs attention.')).toBeTruthy();
  expect(within(ignoredRow).getByRole('button', { pressed: true })).toBeTruthy();
  fireEvent.click(within(ignoredRow).getByRole('button', { name: 'View save source' }));
  expect(run).toHaveBeenCalledOnce();
  expect(latest).toEqual({ query: 'Mira', severity: 'all', selected: 'save', scrollTop: 64, showIgnored: true, expanded: 'save' });
  expect(list.scrollTop).toBe(64);
  fireEvent.click(within(ignoredRow).getByRole('button', { name: 'Bring back' }));
  fireEvent.click(within(view.container).getByRole('button', { name: 'Ignored (1)' }));
  const restoredRow = view.container.querySelector<HTMLElement>('[data-problem-id="save"]')!;
  expect((search as HTMLInputElement).value).toBe('Mira');
  expect(restoredRow.querySelector('pre')?.hidden).toBe(false);
  expect(restoredRow.querySelector('pre')?.textContent).toBe(details);
  expect(within(restoredRow).getByRole('button', { pressed: true })).toBeTruthy();
  expect(latest).toEqual({ query: 'Mira', severity: 'all', selected: 'save', scrollTop: 64, showIgnored: false, expanded: 'save' });
  expect(list.scrollTop).toBe(64);
});

it('never offers ignoring content diagnostics and only lists ignored attempts in the ignored view', () => {
  const content = { ...problem('compile', 'error', 'Scene', 'Missing target'), ignored: true };
  const operation = { ...problem('save', 'warning', 'Save', 'Opening scene'), attemptKeys: ['save:1'], ignored: true };
  const props = { problems: [content, operation], locale: 'en', onStateChange: () => {}, onToggleIgnore: vi.fn() };
  const view = render(<Problems {...props} state={initial} />);
  expect([...view.container.querySelectorAll('[data-problem-id]')].map(row => row.getAttribute('data-problem-id'))).toEqual(['compile']);
  expect(within(view.container).queryByRole('button', { name: 'Ignore this attempt' })).toBeNull();
  view.rerender(<Problems {...props} state={{ ...initial, showIgnored: true }} />);
  expect([...view.container.querySelectorAll('[data-problem-id]')].map(row => row.getAttribute('data-problem-id'))).toEqual(['save']);
  view.rerender(<Problems {...props} state={{ ...initial, showIgnored: true, query: 'Missing target' }} />);
  expect(within(view.container).getByRole('status').textContent).toBe('No problems match these filters.');
});

it('keeps a return to pending problems after bringing back the last ignored attempt', () => {
  const entry = { ...problem('save', 'error', 'Save', 'Opening scene'), attemptKeys: ['save:1'] };
  const props = { locale: 'en', state: { ...initial, showIgnored: true }, onStateChange: vi.fn(), onToggleIgnore: vi.fn() };
  const view = render(<Problems {...props} problems={[{ ...entry, ignored: true }]} />);
  view.rerender(<Problems {...props} problems={[entry]} />);
  expect(within(view.container).getByRole('status').textContent).toBe('No ignored problems.');
  fireEvent.click(within(view.container).getByRole('button', { name: 'Ignored (0)' }));
  expect(props.onStateChange).toHaveBeenCalledWith({ ...initial, showIgnored: false });
});

it('keeps keyboard focus on recheck while busy and guards repeat activation without losing results', () => {
  const onRecheck = vi.fn();
  const props = { problems: [problem('compile', 'error', 'Scene', 'Missing target')], locale: 'en', state: initial, onStateChange: () => {}, onRecheck };
  const view = render(<Problems {...props} />);
  const recheck = within(view.container).getByRole<HTMLButtonElement>('button', { name: 'Recheck' });
  recheck.focus();
  fireEvent.click(recheck);
  expect(onRecheck).toHaveBeenCalledOnce();
  view.rerender(<Problems {...props} checking pending />);
  expect(document.activeElement).toBe(recheck);
  expect(recheck.disabled).toBe(false);
  expect(recheck.getAttribute('aria-disabled')).toBe('true');
  expect(recheck.getAttribute('aria-busy')).toBe('true');
  expect(recheck.querySelector('.gc-problems-checking-icon')).not.toBeNull();
  fireEvent.click(recheck);
  fireEvent.click(recheck);
  expect(onRecheck).toHaveBeenCalledOnce();
  expect(view.container.querySelector('[data-problem-id="compile"]')).not.toBeNull();
  expect(within(view.container).getByRole('status').textContent).toBe('Check incomplete. Previous results are kept.');
  view.rerender(<Problems {...props} />);
  expect(document.activeElement).toBe(recheck);
  fireEvent.click(recheck);
  expect(onRecheck).toHaveBeenCalledTimes(2);
});

it('keeps incomplete-check validity when every known operation problem is ignored', () => {
  const entry = { ...problem('save', 'error', 'Save', 'Opening scene'), attemptKeys: ['save:1'], ignored: true };
  const view = render(<Problems problems={[entry]} locale="en" state={initial} onStateChange={() => {}} pending />);
  expect(within(view.container).getAllByRole('status')).toHaveLength(1);
  expect(within(view.container).getByRole('status').textContent).toBe('Check incomplete. Previous results are kept.');
  expect(within(view.container).queryByText(/No pending problems|No current problems/)).toBeNull();
});

it.each([
  ['zh-CN', '忽略本次', '重新检查', '已忽略本次', '重新关注', '已忽略 (1)'],
  ['ja-JP', '今回のみ無視', '再確認', '今回のみ無視', '再び表示', '無視した問題 (1)'],
])('localizes attempt controls in %s', (locale, ignore, recheck, badge, restore, toggle) => {
  const entry = { ...problem('save', 'error', 'Save', 'Opening scene'), attemptKeys: ['save:1'] };
  const props = { locale, onStateChange: () => {}, onToggleIgnore: () => {}, onRecheck: () => {} };
  const view = render(<Problems {...props} problems={[entry]} state={initial} />);
  expect(within(view.container).getByRole('button', { name: ignore })).toBeTruthy();
  expect(within(view.container).getByRole('button', { name: recheck })).toBeTruthy();
  view.rerender(<Problems {...props} problems={[{ ...entry, ignored: true }]} state={{ ...initial, showIgnored: true }} />);
  expect(within(view.container).getByText(badge)).toBeTruthy();
  expect(within(view.container).getByRole('button', { name: restore })).toBeTruthy();
  expect(within(view.container).getByRole('button', { name: toggle, pressed: true })).toBeTruthy();
});

it('shows an owner summary while retaining the original operation cause and technical details', () => {
  const entry = { ...problem('import', 'error', 'Import', 'forest.png'), attemptKeys: ['import:1'], summary: '3 items were not imported' };
  function Harness() {
    const [state, setState] = useState({ ...initial, query: '3 items' });
    return <Problems problems={[entry]} locale="en" state={state} onStateChange={setState} />;
  }
  const view = render(<Harness />);
  const row = view.container.querySelector<HTMLElement>('[data-problem-id="import"]')!;
  expect(row.querySelector('.gc-problem-reason')?.textContent).toBe('3 items were not imported');
  expect(row.querySelector('.gc-problem-cause')?.textContent).toBe('forest.png needs attention.');
  fireEvent.click(within(row).getByRole('button', { name: 'Diagnostic details: 3 items were not imported' }));
  expect(row.querySelector('pre')?.textContent).toContain('PROBLEM_TEST');
  expect(row.querySelector('pre')?.textContent).toContain('forest.png needs attention.');
});

it('restores expanded details and scroll after the retained source arrives', () => {
  const state = { ...initial, expanded: 'import', selected: 'import', scrollTop: 64 };
  const props = { locale: 'en', state, onStateChange: () => {} };
  const view = render(<Problems {...props} problems={[]} />);
  const list = view.container.querySelector<HTMLElement>('.gc-problems-list')!;
  list.scrollTop = 0; // An empty browser list clamps the requested position while its source loads.
  view.rerender(<Problems {...props} problems={[problem('import', 'error', 'Import', 'forest.png')]} />);
  expect(list.scrollTop).toBe(64);
  expect(view.container.querySelector('pre')?.hidden).toBe(false);
  expect(view.container.querySelector('pre')?.textContent).toContain('forest.png');
});
