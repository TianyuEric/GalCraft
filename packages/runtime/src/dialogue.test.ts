import { expect, test } from 'vitest';
import { DialogueContentSchema, RuntimeStateSchema, dialoguePlainText, replaceDialogueText, styleDialogueRange } from '@galcraft/contracts';
import { FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { applyDialogue, dialogueRuns, sliceDialogueRuns } from './voice.js';

test('literal strings and styled text preserve bases, Unicode clusters and ruby through save serialization', () => {
  const literal = '<b>正文</b> & ruby'; expect(dialoguePlainText(DialogueContentSchema.parse(literal))).toBe(literal);
  const content = styleDialogueRange('星空 hello 👩‍🚀', 0, 2, { ruby: 'ほしぞら', color: '#29a', bold: true });
  expect(typeof content !== 'string' && content.segments[1]).toEqual({ text: ' hello 👩‍🚀' });
  expect(replaceDialogueText({ segments: [{ text: '星空', ruby: 'ほしぞら', bold: true }] }, '星海')).toEqual({ segments: [{ text: '星', bold: true }, { text: '海' }] });
  expect(replaceDialogueText(content, '')).toBe('');
  expect(DialogueContentSchema.safeParse({ segments: [{ text: 'x', color: 'url(x)' }] }).success).toBe(false);
  expect(dialoguePlainText(replaceDialogueText(content, '星空 world 👩‍🚀'))).toBe('星空 world 👩‍🚀');
  const state = structuredClone(FixtureRuntimeState), instruction = structuredClone(FixtureSnapshot.scenes[0]!.instructions.find(item => item.opcode === 'say')!);
  instruction.args = { speaker: { kind: 'narrator' }, text: content };
  applyDialogue(state, FixtureSnapshot, instruction, dialoguePlainText(content), null, typeof content === 'string' ? undefined : content.segments);
  const restored = RuntimeStateSchema.parse(JSON.parse(JSON.stringify(state))), runs = dialogueRuns(restored.presentation.text.parts);
  expect(sliceDialogueRuns(runs, 0, 1)[0]).toMatchObject({ text: '星', ruby: 'ほしぞら', bold: true });
  expect(runs.map(run => run.text).join('')).toBe(restored.presentation.text.text);
});
