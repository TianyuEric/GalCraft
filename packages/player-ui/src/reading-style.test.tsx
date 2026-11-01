import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DialoguePart } from '@galcraft/contracts';
import { dialogueRuns, nvlRuns, sliceDialogueRuns } from '@galcraft/runtime';
import { readingRuns } from './reading-style.js';
import { DialogueText } from './dialogue-text.js';

const parts: DialoguePart[] = [
  { statementId: 'OldSay', speakerKind: 'character', characterId: 'Role01', speakerName: '澜汐', body: '旧段', locale: 'zh-CN' },
  { statementId: 'NewSay', speakerKind: 'narrator', characterId: null, body: '星空继续', locale: 'zh-CN',
    segments: [{ text: '星空', ruby: 'ほしぞら', color: '#abcdef', bold: false, italic: true, fontSize: 36 }, { text: '继续' }] },
];
test('ADV and NVL retain canonical text and resolve each statement independently', () => {
  const styles = { read: { color: '#756b61', fontId: 'Font01', fontSize: 24, bold: true }, unread: { color: '#ffffff', italic: false } };
  for (const nvl of [false, true]) {
    const runs = readingRuns(parts, styles, ['OldSay'], nvl, { color: '#eecc99', bold: true });
    expect(runs.map(run => run.text).join('')).toBe((nvl ? nvlRuns(parts) : dialogueRuns(parts)).map(run => run.text).join(''));
    expect(runs.find(run => run.text === '旧段')).toMatchObject(styles.read);
    expect(runs.find(run => run.text === '星空')).toMatchObject({ color: '#abcdef', fontSize: 36, bold: false, italic: true, ruby: 'ほしぞら' });
    expect(runs.find(run => run.text === '继续')).toMatchObject(styles.unread);
    if (nvl) expect(runs.find(run => run.text === '澜汐：')).toEqual({ text: '澜汐：', color: '#eecc99', bold: true });
  }
});
test('inline styles win over state defaults and actual font/scale survive partial reveal', () => {
  const runs = readingRuns(parts, { unread: { fontId: 'Font02', fontSize: 30, bold: true } }, [], false, {}, 32);
  const html = renderToStaticMarkup(<DialogueText runs={sliceDialogueRuns(runs, 4)} scale={1.5}/>);
  expect(html).toContain('--gc-font-Font02'); expect(html).toContain('font-size:54px');
  expect(html).toContain('font-weight:400'); expect(html).toContain('<ruby>');
  expect(runs.find(run => run.text === '继续')?.fontSize).toBe(32);
  expect(readingRuns(parts, undefined, [], false).find(run => run.text === '旧段')).toEqual({ text: '旧段' });
});
