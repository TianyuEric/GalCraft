import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const media = join(root, 'apps/studio/resources/practice');
const rate = 48000;
function random(seed) { let state = seed >>> 0; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }; }
function wave(channels) {
  const frames = channels[0].length, bytes = Buffer.alloc(44 + frames * 4);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 4, 28); bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 4, 40);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < 2; channel++) bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[channel][frame])) * 32767), 44 + frame * 4 + channel * 2);
  return bytes;
}
function rms(channels) { let sum = 0, peak = 0; for (const channel of channels) for (const sample of channel) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); } return { rms: Math.sqrt(sum / (channels.length * channels[0].length)), peak }; }
function loopNoise(seconds, seed, kind) {
  const frames = seconds * rate, rng = random(seed), source = new Float64Array(frames);
  for (let i = 0; i < frames; i++) source[i] = rng() * 2 - 1;
  const channels = [new Float32Array(frames), new Float32Array(frames)];
  for (let channel = 0; channel < 2; channel++) {
    let slow = 0, fast = 0;
    const offset = channel ? Math.round(rate * .173) : 0;
    // Three periodic passes settle both filters against the same periodic source.
    for (let i = 0; i < frames * 3; i++) {
      const index = i % frames, input = source[(index + offset) % frames];
      slow += (input - slow) * (kind === 'wind' ? .0018 : .025);
      fast += (input - fast) * (kind === 'wind' ? .018 : .42);
      if (i >= frames * 2) {
        const t = index / rate;
        const envelope = kind === 'wind' ? .7 + .17 * Math.sin(2 * Math.PI * t / seconds) + .1 * Math.sin(2 * Math.PI * 3 * t / seconds + .8) : .85 + .08 * Math.sin(2 * Math.PI * 2 * t / seconds);
        channels[channel][index] = (kind === 'wind' ? slow * 1.9 + fast * .2 : fast * .13 + slow * .52) * envelope;
      }
    }
  }
  if (kind === 'rain') {
    // Independent, low level roof/pavement droplets are wrapped into the same
    // period, including their decay, so there is no unrendered tail at the join.
    for (let event = 0; event < seconds * 29; event++) {
      const start = Math.floor(rng() * frames), frequency = 1100 + rng() * 4300, amplitude = .012 + rng() * .025, pan = rng();
      for (let n = 0; n < rate * .055; n++) {
        const t = n / rate, sample = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 110) * Math.min(1, t * 2500) * amplitude;
        channels[0][(start + n) % frames] += sample * (1 - pan * .65); channels[1][(start + n) % frames] += sample * (.35 + pan * .65);
      }
    }
  }
  return channels;
}
function bell() {
  const seconds = 7.2, frames = Math.round(seconds * rate), channels = [new Float32Array(frames), new Float32Array(frames)];
  // Three original struck partial clusters, followed by an audible natural tail.
  for (const [strike, base, pan] of [[0, 659.255, .35], [.72, 830.609, .64], [1.44, 987.767, .48]]) {
    for (let i = Math.round(strike * rate); i < frames; i++) {
      const t = i / rate - strike, endFade = Math.min(1, (seconds - i / rate) / .5);
      let sample = 0;
      for (const [ratio, gain, decay] of [[1,.12,.55],[2.01,.047,.82],[2.76,.03,1.2],[4.07,.016,1.7]]) sample += Math.sin(2 * Math.PI * base * ratio * t) * gain * Math.exp(-t * decay);
      sample *= Math.min(1, t / .003) * endFade;
      channels[0][i] += sample * Math.sqrt(1 - pan); channels[1][i] += sample * Math.sqrt(pan);
    }
  }
  return channels;
}

const results = [];
await mkdir(join(media, 'audio'), { recursive: true }); await mkdir(join(media, 'sources/audio'), { recursive: true });
for (const spec of [{ key: 'spring-rain-loop', kind: 'rain', seconds: 12, seed: 2026102001 }, { key: 'spring-wind-loop', kind: 'wind', seconds: 16, seed: 2026102002 }, { key: 'spring-projector-bell', kind: 'bell', seconds: 7.2, seed: null }]) {
  const channels = spec.kind === 'bell' ? bell() : loopNoise(spec.seconds, spec.seed, spec.kind);
  const metrics = rms(channels), filename = `audio/${spec.key}.wav`;
  await writeFile(join(media, filename), wave(channels));
  const record = { ...spec, file: filename, source: 'GalCraft original procedural audio; no third party recordings or samples', author: 'GalCraft sample media', distribution: 'Retained under the repository copyright and sample distribution terms; no external media license dependency', script: 'tools/artwork/synthesize-practice-effects.mjs', method: spec.kind === 'bell' ? 'Three struck sine partial clusters, exponential decays, equal-power stereo pan, final 0.5 s fade' : 'Seeded xorshift noise, periodic settled low-pass filters and periodic amplitude motion; rain includes wrapped synthetic resonant droplets', sampleRate: rate, channels: 2, format: 'PCM signed 16-bit WAV', loop: spec.kind === 'bell' ? null : { startSeconds: 0, endSeconds: spec.seconds }, recommendedVolume: spec.kind === 'bell' ? .5 : spec.kind === 'rain' ? .15 : .22, metrics, boundaryDelta: spec.kind === 'bell' ? null : channels.map(channel => channel[0] - channel.at(-1)), listeningStatus: 'requires human listening; waveform analysis does not assert perceived quality' };
  await writeFile(join(media, `sources/audio/${spec.key}.json`), JSON.stringify(record, null, 2) + '\n'); results.push(record);
}
console.log(JSON.stringify(results, null, 2));
