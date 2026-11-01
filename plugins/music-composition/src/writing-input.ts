import type { GenerationInput, Json } from '@galcraft/contracts';
import type { PluginContext } from '@galcraft/plugins/contracts';
import { createMusicScore, parseMusicScore, type MusicScore } from './score.js';
import { parseMusicInstruments, readSoundBank, soundBankKeys, validateScoreInstruments } from './catalog.js';
import { musicConstraintConflicts, parseMusicConstraints } from './constraints.js';
import { assembleMusicWritingInput } from './prompts.js';

export async function resolveMusicWritingInput(context: Pick<PluginContext, 'runtimeDependencies' | 'soundbanks'>, input: GenerationInput, read: (url: string) => Promise<ArrayBuffer>) {
  if (!('fields' in input)) throw new Error('Score-writing fields are missing.');
  const fields = input.fields;
  let score: MusicScore | undefined;
  if (fields.score != null) { const parsed = parseMusicScore(fields.score); if (!parsed.ok) throw new Error(parsed.error.message); score = parsed.value; }
  const soundbank = (fields.soundbank ?? score?.soundbank) as MusicScore['soundbank'] | undefined;
  if (!soundbank || typeof soundbank.id !== 'string' || !soundbank.id.trim() || soundbank.version !== '0.1.0') throw new Error('soundbank: choose an installed soundbank identity and exact version through soundbankInfo; no soundbank is selected.');
  const resolved = context.soundbanks ? await context.soundbanks.resolve(soundbank) : soundBankKeys[soundbank.id] ? await context.runtimeDependencies?.resolve(soundBankKeys[soundbank.id]!) : undefined;
  if (!resolved?.ok) throw new Error(resolved && !resolved.ok ? resolved.error.message : `soundbank: ${soundbank.id}@${soundbank.version} is not installed or readable. Choose a real soundbank in Studio or query soundbankInfo.`);
  const descriptor = resolved.value.expected as { id?: string; version?: string };
  if (descriptor.id !== soundbank.id || descriptor.version !== soundbank.version) throw new Error('soundbank: the resolved soundbank differs from the selected exact identity.');
  const actual = (await readSoundBank(await read(resolved.value.url))).instruments;
  const supplied = fields.instruments === undefined ? undefined : parseMusicInstruments(fields.instruments);
  for (const instrument of supplied ?? []) {
    const found = actual.find(value => value.id === instrument.id);
    if (!found || (['bankMSB', 'bankLSB', 'program', 'drum', 'minPitch', 'maxPitch'] as const).some(key => found[key] !== instrument[key]) || instrument.controllers.some(cc => !found.controllers.includes(cc))) throw new Error(`instruments: ${instrument.id} does not match the selected exact soundbank. Query soundbankInfo again.`);
  }
  const instruments = supplied?.length ? supplied : actual;
  if (!instruments.length) throw new Error('soundbank: no playable instruments were found.');
  if (score) { const problems = validateScoreInstruments(score, actual); if (problems.length) throw new Error(problems.join('; ')); }
  const constraints = parseMusicConstraints(fields.musicConstraints), render = (fields.render ?? score?.render ?? createMusicScore().render) as MusicScore['render'];
  const conflicts = musicConstraintConflicts(constraints, instruments, render, score?.ppq ?? 480);
  if (conflicts.length) throw new Error(conflicts.join('\n'));
  // Freeze actual host-derived inputs once; later preview, execution and reprocessing share these values.
  fields.soundbank = structuredClone(soundbank); fields.instruments = instruments as unknown as Json; fields.render = structuredClone(render) as unknown as Json;
  assembleMusicWritingInput(score, instruments, fields.presetId as string | undefined, String(fields.description ?? ''), constraints, soundbank, render);
}

export function prepareMusicWritingInput(input: GenerationInput) {
  if (!('fields' in input)) throw new Error('Score-writing fields are missing.');
  const fields = input.fields, parsed = fields.score == null ? undefined : parseMusicScore(fields.score);
  if (parsed && !parsed.ok) throw new Error(parsed.error.message);
  return assembleMusicWritingInput(parsed?.ok ? parsed.value : undefined, parseMusicInstruments(fields.instruments), fields.presetId as string | undefined,
    String(fields.description ?? ''), parseMusicConstraints(fields.musicConstraints), fields.soundbank as MusicScore['soundbank'], fields.render as MusicScore['render']);
}
