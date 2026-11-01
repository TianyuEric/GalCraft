import { describe, expect, it } from 'vitest';
import { musicError, musicText, musicTaskState } from './ui-text.js';
import { createMusicScore, parseGeneratedMusicScore, parseMusicScore } from './score.js';
import { validateScoreInstruments } from './catalog.js';
import { definition } from './definition.js';

describe('music workstation locale', () => {
  it('uses Studio locale families for labels, instructions and counts', () => {
    expect(musicText('zh-CN')('试听')).toBe('试听');
    expect(musicText('en-US')('试听')).toBe('Play');
    expect(musicText('ja-JP')('试听')).toBe('試聴');
    expect(musicText('en')('{tracks} 条音轨 · {seconds} 秒', { tracks: 3, seconds: '9.6' })).toBe('3 tracks · 9.6 s');
    expect(musicText('ja')('钢琴卷帘 · 双击添加，拖动移动，右侧调整长度；Esc 取消拖动')).toContain('Esc');
    const field = definition.documents![0]!.fields![0]!;
    for (const locale of ['zh-CN', 'en', 'ja']) {
      expect(definition.messages![locale]![field.labelKey!]).toBeTruthy();
      expect(definition.messages![locale]![field.descriptionKey!]).toBeTruthy();
    }
  });
  it('localizes plugin JSON and semantic diagnostics with their track and bar positions', () => {
    const invalid = parseGeneratedMusicScore('作者的无效原文');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(musicError('ja', invalid.error.message)).toContain('完全な JSON');
    const score = createMusicScore(); score.tracks[0]!.notes[0]!.pitch = 128;
    const checked = parseMusicScore(score); expect(checked.ok).toBe(false);
    if (!checked.ok) expect(musicError('en', checked.error.message)).toContain('Track track-piano · Bar 1 · tracks[0].notes[0]: Notes need unique identities');
  });
  it('keeps author content and unknown service diagnostics verbatim', () => {
    const score = createMusicScore(); score.tracks[0]!.name = '停止 · 试听 · 私の曲'; score.tracks[0]!.instrumentId = 'melodic:9:9:99';
    const diagnostic = validateScoreInstruments(score, [])[0]!;
    expect(musicError('en', diagnostic)).toBe('Track “停止 · 试听 · 私の曲”: instrument melodic:9:9:99 is missing from the selected soundbank. Remap it explicitly.');
    expect(musicError('ja', 'Provider: 作者からの説明')).toBe('Provider: 作者からの説明');
    expect(score.tracks[0]!.name).toBe('停止 · 试听 · 私の曲');
  });
  it('localizes schema field errors and task states without changing field paths', () => {
    const score = createMusicScore() as unknown as Record<string, unknown>; score.unexpected = '作者内容';
    const checked = parseMusicScore(score); expect(checked.ok).toBe(false);
    if (!checked.ok) {
      expect(musicError('zh-CN', checked.error.message)).toBe('$.unexpected: 未定义的字段');
      expect(musicError('ja', checked.error.message)).toBe('$.unexpected: 未定義のフィールドです');
    }
    expect(musicError('ja', '$.tracks[0].notes[0].pitch: Maximum 127')).toBe('$.tracks[0].notes[0].pitch: 最大値は 127 です');
    expect(musicTaskState('ja', 'running')).toBe('実行中');
    expect(musicError('en', 'Error: 请填写音色名称、来源和许可资料')).toBe('Error: Enter the soundbank name, source and license information');
    expect(musicError('ja', '音色包不可用：Error: 音色文件大小与固定版本不符，请重新安装。请在编曲工位安装指定音色包。')).toContain('音源ファイルのサイズが固定バージョンと一致しません');
  });
  it('provides a translated label for every public production task state', () => {
    const states = ['draft', 'queued', 'blocked', 'submitting', 'running', 'fetching', 'review', 'failed', 'cancelled', 'interrupted'];
    for (const locale of ['zh-CN', 'en', 'ja']) for (const state of states) expect(musicTaskState(locale, state)).not.toBe(state);
    expect(states.slice(2, 6).map(state => musicTaskState('ja', state))).toEqual(['ブロック中', '送信中', '実行中', '取得中']);
  });
});
