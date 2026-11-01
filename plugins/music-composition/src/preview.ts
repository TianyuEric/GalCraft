import { WorkletSynthesizer } from 'spessasynth_lib';
import { compileMusicScore } from './events.js';
import { finishRenderChannels, loopBoundaryScore } from './render-core.js';
import type { MusicInstrument } from './catalog.js';
import type { MusicScore } from './score.js';
export class MusicPreview {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private offlineSynth: WorkletSynthesizer | null = null;
  private generation = 0;
  private started = 0;
  private offset = 0;
  private buffer: AudioBuffer | null = null;
  private loop: { startSec: number; endSec: number } | null = null;
  get currentTime() { if (!this.context || !this.source) return this.offset;
    const seconds = this.offset + this.context.currentTime - this.started;
    return this.loop && seconds >= this.loop.endSec ? this.loop.startSec + (seconds - this.loop.startSec) % (this.loop.endSec - this.loop.startSec) : seconds; }
  get playing() { return this.source !== null; }
  async play(score: MusicScore, soundbank: ArrayBuffer, instruments: readonly MusicInstrument[], workletUrl: string) {
    await this.stop(); const generation = ++this.generation;
    const compiled = compileMusicScore(score, instruments);
    // Only this explicit author action creates and resumes the audible context.
    const audible = this.context = new AudioContext({ sampleRate: score.render.sampleRate }); await audible.resume();
    try {
    const render = async (source: MusicScore) => {
      const sequence = compileMusicScore(source, instruments);
      const offline = new OfflineAudioContext(2, Math.ceil(source.render.sampleRate * (sequence.durationSeconds + source.render.tailSeconds)), source.render.sampleRate);
      await offline.audioWorklet.addModule(workletUrl); if (generation !== this.generation) return;
      const synth = this.offlineSynth = new WorkletSynthesizer(offline); synth.connect(offline.destination);
      try {
        await synth.startOfflineRender({ midiSequence: sequence.midi, loopCount: 0, soundBankList: [{ bankOffset: 0, soundBankBuffer: soundbank.slice(0) }], sequencerOptions: { skipToFirstNoteOn: false } });
        return await offline.startRendering();
      } finally { if (this.offlineSynth === synth) { synth.destroy(); this.offlineSynth = null; } }
    };
      const rendered = await render(score); if (generation !== this.generation || !rendered) return;
      const boundary = loopBoundaryScore(score), tail = boundary ? await render(boundary) : null;
      if (generation !== this.generation) return;
      const finished = finishRenderChannels([rendered.getChannelData(0), rendered.getChannelData(1)], score, compiled.durationSeconds, compiled.loop, tail ? [tail.getChannelData(0), tail.getChannelData(1)] : undefined);
      const buffer = audible.createBuffer(2, finished.channels[0]!.length, score.render.sampleRate);
      finished.channels.forEach((channel, index) => buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, index));
      this.buffer = buffer; this.loop = finished.loop; this.offset = 0; this.start();
    } catch (error) { await this.stop(); throw error; }
  }
  private start() {
    if (!this.context || !this.buffer) return;
    const source = this.context.createBufferSource(); source.buffer = this.buffer;
    source.loop = !!this.loop; if (this.loop) { source.loopStart = this.loop.startSec; source.loopEnd = this.loop.endSec; }
    source.connect(this.context.destination); source.onended = () => { if (this.source === source) this.source = null; };
    this.started = this.context.currentTime; this.source = source; source.start(0, this.offset);
  }
  pause() { if (!this.source) return; this.offset = this.currentTime; const source = this.source; this.source = null; source.stop(); source.disconnect(); }
  async resume() { if (this.source || !this.context || !this.buffer) return; await this.context.resume(); this.start(); }
  seek(seconds: number) { const playing = this.playing; this.pause(); this.offset = Math.max(0, Math.min(seconds, this.buffer?.duration ?? 0)); if (playing) this.start(); }
  async stop() { this.generation++; this.pause(); this.offlineSynth?.destroy(); this.offlineSynth = null; this.buffer = null; this.offset = 0;
    const context = this.context; this.context = null; if (context && context.state !== 'closed') await context.close(); }
}
