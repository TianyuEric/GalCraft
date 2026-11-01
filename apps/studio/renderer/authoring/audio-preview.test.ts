import { describe, expect, it } from 'vitest';
import { configureAudioPreview } from './audio-preview.js';

class AudioEvents extends EventTarget {
  currentTime = 0;
  paused = false;
  plays = 0;
  async play(): Promise<void> { this.plays++; this.paused = false; }
}

describe('M01 audio asset preview', () => {
  it('seeks to the processed variant loop start at the end of its configured interval', () => {
    const audio = new AudioEvents();
    configureAudioPreview(audio as unknown as HTMLAudioElement, { loopStartSec: 0.25, loopEndSec: 0.75 });
    audio.currentTime = 0.7; audio.dispatchEvent(new Event('timeupdate'));
    expect(audio.currentTime).toBe(0.7);
    audio.currentTime = 0.76; audio.dispatchEvent(new Event('timeupdate'));
    expect(audio.currentTime).toBe(0.25);
  });

  it('does not start paused audio while seeking and resumes a loop when media ends', async () => {
    const audio = new AudioEvents(); audio.paused = true;
    configureAudioPreview(audio as unknown as HTMLAudioElement, { loopStartSec: 0.1, loopEndSec: 0.4 });
    audio.currentTime = 0.5; audio.dispatchEvent(new Event('timeupdate'));
    expect(audio.plays).toBe(0);
    audio.dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(audio.currentTime).toBe(0.1);
    expect(audio.plays).toBe(1);
  });

  it('leaves playback without loop points unchanged', () => {
    const audio = new AudioEvents();
    configureAudioPreview(audio as unknown as HTMLAudioElement, { loopStartSec: null, loopEndSec: null });
    audio.currentTime = 3; audio.dispatchEvent(new Event('ended'));
    expect(audio.currentTime).toBe(3);
    expect(audio.plays).toBe(0);
  });
});
