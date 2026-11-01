import type { Json } from '@galcraft/contracts';
import { createMusicScore } from './score.js';

export const compositionPresets = [
  { id: 'MusAmb', name: 'Editable score · Quiet narrative', description: 'A four-bar piano loop at 96 BPM for dialogue and quiet narration.', bpm: 96, instrument: null },
  { id: 'MusDra', name: 'Editable score · Emotional progression', description: 'A piano and strings loop at 76 BPM; edit its sections and dynamics.', bpm: 76, instrument: { name: '弦乐', id: 'melodic:0:0:48', pitches: [48, 53, 55, 48] } },
  { id: 'MusPop', name: 'Editable score · Everyday motion', description: 'A piano and acoustic bass loop at 120 BPM for everyday scenes.', bpm: 120, instrument: { name: '原声贝斯', id: 'melodic:0:0:32', pitches: [36, 41, 43, 36] } },
].map(preset => {
  const score = createMusicScore(); score.title = preset.name.replace('Editable score · ', ''); score.tempo[0]!.bpm = preset.bpm;
  if (preset.instrument) score.tracks.push({ id: 'track-accompaniment', name: preset.instrument.name, instrumentId: preset.instrument.id,
    volume: 76, pan: 64, controls: [], notes: preset.instrument.pitches.map((pitch, index) => ({
      id: `accompaniment-${index}`, pitch, startTick: index * 1920, durationTicks: 1680, velocity: 72,
    })) });
  return { id: preset.id, name: preset.name, description: preset.description, defaults: { score: score as unknown as Json } };
});
