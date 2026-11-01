import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerHost, Snapshot } from '@galcraft/contracts';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { createVideoBufferLoader, upcomingPlaybackAssets } from './playback-resources.js';
import { PlayerView } from './view.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('holds the mounted reading frame and timers silently until all resource preparation finishes', () => {
  const content = { inert: false, textContent: 'Current reading frame' }, portal = { inert: false };
  const view = Object.assign(Object.create(PlayerView.prototype), { content, portal, resourcePreparations: 0,
    deferredResourceRender: false, startup: { active: false }, transition: { busy: false }, navigation: { page: 'story' },
    disposed: false, options: { data: { current: () => null } } }) as PlayerView;
  const render = vi.spyOn(view, 'render');
  const releaseFirst = view.holdResourcePreparation(), releaseSecond = view.holdResourcePreparation();
  view.render();
  expect(view.storyActive).toBe(false); expect(view.playTimeActive).toBe(false);
  expect(content).toEqual({ inert: true, textContent: 'Current reading frame' });
  releaseFirst(); expect(content.inert).toBe(true); expect(render).toHaveBeenCalledTimes(1);
  releaseSecond(); expect(content.inert).toBe(false); expect(render).toHaveBeenCalledTimes(2);
  releaseSecond(); expect(render).toHaveBeenCalledTimes(2);
});

describe('bounded authored resource lookahead', () => {
  function snapshot() {
    const value: Snapshot = structuredClone(FixtureSnapshot);
    const instruction = value.scenes[0]!.instructions[0]!;
    const next = (id: string, opcode: string, args: object, condition: unknown = null) =>
      ({ ...instruction, statementId: id, opcode, args, condition }) as typeof instruction;
    value.project.languages.voiceDefault = 'ja';
    value.assets = ['image', 'audio', 'video', 'audio', 'audio'].map((kind, index) =>
      ({ ...value.assets[0]!, kind, assetId: ['ImageA', 'VoiceA', 'MovieA', 'VoiceB', 'VoiceC'][index]! })) as Snapshot['assets'];
    value.scenes[0]!.instructions = [next('NowAAA', 'say', { text: 'Now' }),
      next('NextAA', 'changeBg', { assetId: 'ImageA' }),
      next('SayAAA', 'say', { voiceByLocale: { en: 'VoiceB', ja: 'VoiceA' }, voice: 'VoiceC' }),
      next('MovieAA', 'video', { assetId: 'MovieA' }), next('LaterAA', 'say', { voice: 'VoiceC' })];
    return { value, next };
  }

  it('prepares the selected voice and nearest movie without changing the snapshot', () => {
    const { value } = snapshot(), before = structuredClone(value);
    expect(upcomingPlaybackAssets(value, 'NowAAA', 'en')).toEqual(['ImageA', 'VoiceB', 'MovieA']);
    expect(upcomingPlaybackAssets(value, 'NowAAA', 'zh-CN')).toEqual(['ImageA', 'VoiceA', 'MovieA']);
    expect(upcomingPlaybackAssets(value, 'NowAAA', 'en', false, 3, false)).toEqual(['ImageA', 'MovieA']);
    expect(value).toEqual(before);
  });

  it('stops before conditional instructions and user choices', () => {
    const { value, next } = snapshot();
    value.scenes[0]!.instructions.splice(2, 0, next('ChoiceA', 'choose', { options: [] }));
    expect(upcomingPlaybackAssets(value, 'NowAAA', 'en')).toEqual(['ImageA']);
    value.scenes[0]!.instructions[1]!.condition = { kind: 'literal', value: true };
    expect(upcomingPlaybackAssets(value, 'NowAAA', 'en')).toEqual([]);
  });

  it('follows only a bounded unconditional jump and includes the opening position', () => {
    const { value, next } = snapshot();
    value.scenes[0]!.instructions = [next('JumpAAA', 'jump', { target: { sceneId: 'SceneBB', labelId: 'LabelBB' } })];
    value.scenes.push({ ...value.scenes[0]!, scene: { ...value.scenes[0]!.scene, id: 'SceneBB' }, labels: { LabelBB: 'SayBBBB' },
      instructions: [next('SkipAAA', 'video', { assetId: 'MovieA' }), next('SayBBBB', 'say', { voice: 'VoiceA' }),
        next('LoopAAA', 'jump', { target: { sceneId: 'SceneBB', labelId: 'LabelBB' } })] });
    expect(upcomingPlaybackAssets(value, 'JumpAAA', 'en', true, 1)).toEqual(['VoiceA']);
    expect(upcomingPlaybackAssets(value, 'JumpAAA', 'en', true, 100)).toEqual(['VoiceA']);
  });
});

describe('complete movie preparation', () => {
  function setup() {
    const release = vi.fn(), create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:movie-${create.mock.calls.length}`);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const resolve = vi.fn(async (assetId: string) => ({ ok: true, value: { uri: `https://example.test/${assetId}`, mime: 'video/mp4', release } }));
    const fetcher = vi.fn(async () => new Response(new Blob(['movie'], { type: 'video/mp4' })));
    vi.stubGlobal('fetch', fetcher);
    return { loader: createVideoBufferLoader({ resolve } as unknown as PlayerHost['resources']), release, resolve, create, revoke, fetcher };
  }

  it('waits for the full body, shares preparation with playback and preserves an active clip', async () => {
    const { loader, fetcher, create, release, revoke } = setup();
    let finish!: (blob: Blob) => void;
    fetcher.mockResolvedValueOnce({ ok: true, blob: () => new Promise<Blob>(resolve => { finish = resolve; }) } as Response);
    const pending = loader.warm('MovieAA', 'VariantA');
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(create).not.toHaveBeenCalled(); expect(loader.ready('MovieAA', 'VariantA')).toBe(false);
    const playing = loader.load('MovieAA', 'VariantA');
    finish(new Blob(['complete movie'], { type: 'video/mp4' }));
    await pending; const location = await playing;
    expect(location.uri).toBe('blob:movie-1'); expect(fetcher).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
    await loader.warm('MovieBB', 'VariantA'); await loader.warm('MovieCC', 'VariantA');
    expect(revoke).not.toHaveBeenCalledWith(location.uri);
    expect(loader.ready('MovieBB', 'VariantA')).toBe(false);
    location.release(); location.release(); loader.clear();
    expect(revoke.mock.calls.filter(([uri]) => uri === location.uri)).toHaveLength(1);
  });

  it('releases a failed request and allows the existing retry action to try again', async () => {
    const { loader, fetcher, release } = setup();
    fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(loader.load('MovieAA', 'VariantA')).rejects.toThrow('HTTP 503');
    expect(loader.ready('MovieAA', 'VariantA')).toBe(false);
    const location = await loader.load('MovieAA', 'VariantA');
    expect(fetcher).toHaveBeenCalledTimes(2); expect(release).toHaveBeenCalledTimes(2);
    location.release(); loader.clear();
  });

  it('aborts pending preparation when the Player closes', async () => {
    const { loader, fetcher, release } = setup();
    let signal!: AbortSignal;
    fetcher.mockImplementationOnce(async (_input?: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init!.signal!; signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const pending = loader.warm('MovieAA', 'VariantA');
    const failure = expect(pending).rejects.toThrow('aborted');
    await vi.waitFor(() => expect(signal).toBeDefined()); loader.clear(); await failure;
    expect(signal.aborted).toBe(true); expect(release).toHaveBeenCalledTimes(1);
  });
});
