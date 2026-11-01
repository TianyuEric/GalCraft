import { describe, expect, it } from 'vitest';
import { FixtureIds, FixtureRuntimeState } from '@galcraft/contracts/fixtures';
import { RuntimeStateSchema } from '@galcraft/contracts';
import type { Result } from '@galcraft/contracts';
import { advanceImagePlayback, animatedImageFrame } from './animated-image.js';
import { StageCommandService } from './commands.js';
import { advancePresentationTime } from './presentation-time.js';

const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };
const token = { sessionId: FixtureIds.session, occurrence: 1, statementId: FixtureIds.statements[0]! };
const service = new StageCommandService({ asset: () => ({ ok: true, value: { variantId: FixtureIds.variant, kind: 'image', provider: null, providerVersion: null,
  imageAnimation: { format: 'gif', frameDurationsMs: [40, 120, 70], sourceLoopCount: 0 } }, warnings: [] }) });
const show = async (playback?: { mode: string; wait: boolean }) => unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'changeIllustration',
  args: { objectId: FixtureIds.an, assetId: FixtureIds.background, ...(playback ? { playback } : {}) } })).state;

describe('saved animated images and public visual time', () => {
  it('loops by exact frame durations, serializes and resumes without restarting', async () => {
    const state = await show(); let playback = state.presentation.objects[0]!.imagePlayback!;
    expect(animatedImageFrame(playback)).toBe(0);
    playback = advanceImagePlayback(playback, 45).playback; expect(animatedImageFrame(playback)).toBe(1);
    state.presentation.objects[0]!.imagePlayback = playback;
    const restored = RuntimeStateSchema.parse(JSON.parse(JSON.stringify(state)));
    playback = advanceImagePlayback(restored.presentation.objects[0]!.imagePlayback!, 120).playback;
    expect(animatedImageFrame(playback)).toBe(2);
    playback = advanceImagePlayback(playback, 70).playback; expect(animatedImageFrame(playback)).toBe(0); expect(playback.elapsedMs).toBe(5);
  });
  it('completes a finite wait once and rejects infinite completion waits', async () => {
    const state = await show({ mode: 'once', wait: true }), playback = state.presentation.objects[0]!.imagePlayback!;
    const finished = advanceImagePlayback(playback, 999); expect(finished.completed).toBe(true); expect(animatedImageFrame(finished.playback)).toBe(2);
    expect(advanceImagePlayback(finished.playback, 999).completed).toBe(false);
    const skipped = unwrap(await service.prepare({ state, token, opcode: '$finishAnimationWait', args: {} }));
    expect(skipped.state.presentation.objects[0]!.imagePlayback).toMatchObject({ completed: true, elapsedMs: 230, owner: token });
    await expect(show({ mode: 'loop', wait: true })).rejects.toMatchObject({ code: 'IMAGE_INFINITE_WAIT' });
  });
  it('advances text and film through saved intermediate values to their final state', async () => {
    let state = unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'setTextbox', args: { visible: false, durationMs: 100 } })).state;
    state = unwrap(await service.prepare({ state, token, opcode: 'filmMode', args: { enabled: true, top: .2, bottom: .1, durationMs: 100 } })).state;
    state.presentation = advancePresentationTime(state.presentation, 50);
    expect(state.presentation.text.textboxOpacity).toBe(.5); expect(state.presentation.film.top).toBe(.1);
    state = RuntimeStateSchema.parse(JSON.parse(JSON.stringify(state)));
    state.presentation = advancePresentationTime(state.presentation, 50);
    expect(state.presentation.text.textboxVisible).toBe(false); expect(state.presentation.text.textboxOpacity).toBe(0);
    expect(state.presentation.film).toEqual({ enabled: true, top: .2, bottom: .1 });
  });
});
