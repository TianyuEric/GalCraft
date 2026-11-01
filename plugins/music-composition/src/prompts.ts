import type { MusicInstrument } from './catalog.js';
import type { MusicScore } from './score.js';
import { createMusicScore, musicScoreSchema } from './score.js';
import type { MusicConstraints } from './constraints.js';
export const musicWritingPresets = [
  { id: 'ambient', name: 'Quiet narrative', instruction: 'Write restrained music with room for narrative reading. Use clear themes, harmony and bass; avoid sudden dense passages.' },
  { id: 'dramatic', name: 'Emotional development', instruction: 'Develop emotion through motifs and changing instrumentation, with recognizable repetition and a clear ending.' },
  { id: 'pop', name: 'Light everyday music', instruction: 'Write light instrumental music for everyday scenes. Use melody, harmony, bass and rhythm as needed; drums are optional.' },
] as const;
export function assembleMusicWritingInput(score: MusicScore | undefined, instruments: readonly MusicInstrument[], presetId: string | undefined, description: string, constraints: MusicConstraints = {}, soundbank = score?.soundbank, render = score?.render ?? createMusicScore().render) {
  const preset = musicWritingPresets.find(item => item.id === presetId);
  if (presetId && !preset) throw new Error(`presetId: received ${JSON.stringify(presetId)}; allowed values: ambient, dramatic, pop, or omit for custom writing. Initial score scheme identities (for example MusDra) are not writing style IDs.`);
  if (!soundbank) throw new Error('soundbank: choose a real installed soundbank identity from soundbankInfo.');
  const system = `Compose instrumental music for a visual novel. Return one complete MusicScore v1 JSON object without explanations or executable scripts.${preset ? `\n${preset.instruction}` : ''}\nFollow this JSON schema. Use stable string IDs and integer ticks; tempo starts at tick 0, and notes stay within duration. Use sections and enough tracks for the requested arrangement. Preserve the exact selected soundbank and rendering settings. Perform no network actions.\n${JSON.stringify(musicScoreSchema)}\nAvailable instruments (use only these actual identities, pitch ranges and controllers):\n${JSON.stringify(instruments.map(({ id, name, minPitch, maxPitch, controllers }) => ({ id, name, minPitch, maxPitch, controllers })))}`;
  const text = `Creative description: ${description.trim()}\nSelected soundbank: ${JSON.stringify(soundbank)}\nTimebase: ${score?.ppq ?? 480} PPQ. Rendering settings: ${JSON.stringify(render)}\nExplicit musical constraints (only these are hard requirements; bodySeconds excludes tail, totalSeconds includes the retained non-loop tail; toleranceSeconds is caller-specified):\n${JSON.stringify(constraints)}${score ? `\nCreative reference score. Its tempo, duration, loop and instrumentation are reference material, not requirements unless separately listed above. Preserve its source identity and timebase; sections, notes, tempo and arrangement may change:\n${JSON.stringify(score)}` : '\nNo initial score. Choose musical tempo, meter, duration, sections and arrangement from the creative description and explicit constraints. Do not infer requirements from example scores.'}`;
  return { purpose: 'text' as const, system, messages: [{ role: 'user' as const, text, attachments: [] }], maxOutputTokens: 16000, temperature: 0.7, seed: null };
}
