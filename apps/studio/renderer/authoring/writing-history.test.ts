import { expect, test } from 'vitest';
import { WritingHistory } from './writing-history.js';
const state = (value: string, at = value.length) => ({ value, start: at, end: at, direction: 'none' as const });
test('continuous writing undoes as one text operation; a document switch keeps history and ends the group', () => {
  const history = new WritingHistory(); history.record(state('A'), state('Ab'), 'insertText'); history.record(state('Ab'), state('Abc'), 'insertText'); history.boundary();
  history.record(state('Abc'), state('Abcd'), 'insertText'); expect(history.undo()?.value).toBe('Abc'); expect(history.undo()?.value).toBe('A'); expect(history.redo()?.value).toBe('Abc'); expect(history.redo()?.value).toBe('Abcd');
});
test('IME replacements form one local operation and an external document update resets the local branch', () => {
  const history = new WritingHistory(); history.boundary(); history.record(state('原句'), state('原句n'), 'insertCompositionText', true); history.record(state('原句n'), state('原句你好'), 'insertCompositionText', true); history.boundary();
  expect(history.undo()?.value).toBe('原句'); expect(history.redo()?.value).toBe('原句你好'); history.reset(); expect(history.undo()).toBeNull(); expect(history.redo()).toBeNull();
});
