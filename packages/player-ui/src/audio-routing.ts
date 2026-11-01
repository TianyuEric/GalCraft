import type { AudioState, ExecutionToken, Id, PresentationDelta, RuntimeState } from '@galcraft/contracts';
import type { AudioMixer } from '@galcraft/stage';

type Bus = 'bgm' | 'ambience' | 'sfx' | 'ui';
type Playback = Pick<AudioMixer, 'play' | 'stop' | 'silence'>;

export class PlayerAudioRouter {
  private readonly playing = new Map<string, Id>();
  private readonly requests = new Map<string, number>();

  constructor(private readonly audio: Playback, private readonly activeSession: () => Id | null) {}

  applyDialogue(input: { sessionId: Id; token: ExecutionToken; state: RuntimeState; delta: PresentationDelta | null }) {
    const voice = input.state.presentation.voice;
    if (input.delta?.voiceBinding && voice) {
      void this.audio.play({ sessionId: input.sessionId, bus: 'voice', token: input.token,
        binding: input.delta.voiceBinding, state: { assetId: voice.assetId, variantId: voice.variantId,
          stopped: false, volume: voice.volume, startSec: 0, loop: false, loopStartSec: 0,
          loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 } });
    } else if (input.state.wait?.kind === 'say' && !voice) this.audio.silence(input.sessionId);
    // Text completion commits the same dialogue without a new binding. Its voice keeps playing.
  }

  applyStage(sessionId: Id, item: { bus: 'bgm' | 'sfx' | 'ui'; id: Id | null; state: AudioState }) {
    const bus = item.bus === 'sfx' && item.state.loop ? 'ambience' : item.bus;
    return this.apply(sessionId, bus, item.id, item.state);
  }

  async apply(sessionId: Id, bus: Bus, id: Id | null, state: AudioState): Promise<Id|null> {
    if (state.stopped) { this.stop(sessionId, bus, id, state.fadeOutMs); return null; }
    const key = `${sessionId}/${bus}/${id}`;
    const request = (this.requests.get(key) ?? 0) + 1;
    this.requests.set(key, request);
    const result = await this.audio.play({ sessionId, bus, state });
    {
      if (!result.ok) return null;
      if (this.requests.get(key) !== request || this.activeSession() !== sessionId) {
        this.audio.stop(result.value); return null;
      }
      const old = this.playing.get(key); if (old) this.audio.stop(old);
      this.playing.set(key, result.value); return result.value;
    }
  }

  private stop(sessionId: Id, bus: Bus, id: Id | null, fadeOutMs: number) {
    const prefix = `${sessionId}/${bus}/`;
    const matches = (key: string) => key.startsWith(prefix) && (bus === 'bgm' || key === `${prefix}${id}`);
    for (const key of this.requests.keys()) if (matches(key)) this.requests.set(key, this.requests.get(key)! + 1);
    for (const [key, sourceId] of this.playing) if (matches(key)) {
      this.audio.stop(sourceId, fadeOutMs); this.playing.delete(key);
    }
  }

  clearSession(sessionId: Id) {
    for (const key of this.requests.keys()) if (key.startsWith(`${sessionId}/`)) this.requests.delete(key);
    for (const key of this.playing.keys()) if (key.startsWith(`${sessionId}/`)) this.playing.delete(key);
  }

  clear() { this.requests.clear(); this.playing.clear(); }
  bgmInstance(sessionId: Id) { return this.playing.get(`${sessionId}/bgm/null`) ?? null; }
}
