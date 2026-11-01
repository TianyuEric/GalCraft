/** Stereo 48 kHz K-weighting and gated 400 ms energy (ITU-R BS.1770 / EBU R128).
 * Shared by the browser preview and Node renderer; no realtime or host clock involved.
 */
export const musicMastering = { targetLufs: -18, peakCeilingDbfs: -2, codec: 'opus', bitrateKbps: 128 } as const;

export function integratedLoudness(channels: readonly Float32Array[], sampleRate: number): number | null {
  if (sampleRate !== 48000 || channels.length !== 2) throw new Error('编曲响度分析使用 48kHz 双声道 PCM');
  const hop = sampleRate / 10, count = Math.floor(channels[0]!.length / hop);
  if (count < 4) return null;
  const energy = new Float64Array(count);
  for (const channel of channels) {
    let x1 = 0, x2 = 0, s1 = 0, s2 = 0, h1 = 0, h2 = 0;
    for (let i = 0; i < count * hop; i++) {
      const x = channel[i]!;
      const shelf = 1.53512485958697 * x - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * s1 - .73248077421585 * s2;
      const filtered = shelf - 2 * s1 + s2 + 1.99004745483398 * h1 - .99007225036621 * h2;
      x2 = x1; x1 = x; s2 = s1; s1 = shelf; h2 = h1; h1 = filtered;
      energy[Math.floor(i / hop)]! += filtered * filtered / hop;
    }
  }
  const blocks: number[] = [], absoluteGate = 10 ** ((-70 + .691) / 10);
  for (let i = 3; i < count; i++) {
    const mean = (energy[i]! + energy[i - 1]! + energy[i - 2]! + energy[i - 3]!) / 4;
    if (mean >= absoluteGate) blocks.push(mean);
  }
  if (!blocks.length) return null;
  const mean = blocks.reduce((sum, value) => sum + value, 0) / blocks.length;
  const gated = blocks.filter(value => value >= mean / 10);
  return -.691 + 10 * Math.log10(gated.reduce((sum, value) => sum + value, 0) / gated.length);
}

/** A single gain preserves musical dynamics, silence and exact loop boundaries. */
export function masterMusic(channels: readonly Float32Array[], sampleRate: number) {
  const inputLufs = integratedLoudness(channels, sampleRate);
  let peak = 0;
  for (const channel of channels) for (const value of channel) {
    if (!Number.isFinite(value)) throw new Error('渲染音频包含无效采样');
    peak = Math.max(peak, Math.abs(value));
  }
  const requested = inputLufs === null ? 1 : 10 ** ((musicMastering.targetLufs - inputLufs) / 20);
  const ceiling = 10 ** (musicMastering.peakCeilingDbfs / 20);
  const gain = peak ? Math.min(requested, ceiling / peak) : 1;
  for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] = channel[i]! * gain;
  return { ...musicMastering, inputLufs, outputLufs: inputLufs === null ? null : inputLufs + 20 * Math.log10(gain),
    gainDb: 20 * Math.log10(gain), peakLimited: gain < requested, peak: peak * gain };
}
