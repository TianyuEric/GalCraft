import { BasicSoundBank, SoundBankLoader } from 'spessasynth_core';
import type { BasicPreset, BasicZone } from 'spessasynth_core';
import type { MusicScore, SoundBankId } from './score.js';
import { validateJsonData } from '@galcraft/contracts';
import type { Json } from '@galcraft/contracts';
export type MusicInstrument = { id: string; name: string; bankMSB: number; bankLSB: number; program: number; drum: boolean;
  minPitch: number; maxPitch: number; controllers: number[] };
export type SoundBankDescriptor = { schemaVersion: 1; id: SoundBankId; version: '0.1.0'; name: string; upstreamVersion: string;
  format: 'sf2' | 'sf3'; bytes: number; sourceUrl: string; license: string; notices: { name: string; text: string }[] };
export type SoundBankStatus = import('@galcraft/contracts').SoundBankStatus;
const midi={type:'integer',minimum:0,maximum:127};
export const musicInstrumentSchema:Json={type:'object',properties:{id:{type:'string'},name:{type:'string'},bankMSB:midi,bankLSB:midi,program:midi,drum:{type:'boolean'},minPitch:midi,maxPitch:midi,controllers:{type:'array',items:midi}},required:['id','name','bankMSB','bankLSB','program','drum','minPitch','maxPitch','controllers'],additionalProperties:false};
export function parseMusicInstruments(input:Json|undefined):MusicInstrument[]{const result=validateJsonData({type:'array',items:musicInstrumentSchema},input??null);if(!result.ok)throw new Error(result.issues.map(issue=>issue.message).join('; '));return input as unknown as MusicInstrument[];}
export const soundBankKeys: Record<string, string> = { 'ms-basic': 'org.galcraft.music-composition/basic', 'musescore-general-hq': 'org.galcraft.music-composition/hq' };
export function presetIdentity(preset: Pick<BasicPreset, 'isGMGSDrum' | 'bankMSB' | 'bankLSB' | 'program'>): string {
  return `${preset.isGMGSDrum ? 'drum' : 'melodic'}:${preset.bankMSB}:${preset.bankLSB}:${preset.program}`;
}
function instrument(preset: BasicPreset): MusicInstrument {
  const controllers = new Set([1, 7, 10, 11, 64, 91, 93]);
  let minPitch = 127, maxPitch = 0;
  const controls = (zone: BasicZone) => { for (const modulator of zone.modulators) for (const source of [modulator.primarySource, modulator.secondarySource])
    if (source.isCC && source.index === 2) controllers.add(2); };
  controls(preset.globalZone);
  for (const zone of preset.zones) {
    controls(zone); controls(zone.instrument.globalZone);
    const presetRange=zone.hasKeyRange?zone.keyRange:preset.globalZone.keyRange;
    for (const child of zone.instrument.zones) {
      const instrumentRange=child.hasKeyRange?child.keyRange:zone.instrument.globalZone.keyRange;
      const low = Math.max(0,presetRange.min,instrumentRange.min), high = Math.min(127,presetRange.max,instrumentRange.max);
      if (low <= high) { minPitch = Math.min(minPitch, low); maxPitch = Math.max(maxPitch, high); }
      controls(child);
    }
  }
  return { id: presetIdentity(preset), name: preset.name, bankMSB: preset.bankMSB, bankLSB: preset.bankLSB, program: preset.program,
    drum: preset.isGMGSDrum, minPitch, maxPitch, controllers: [...controllers].sort((a, b) => a - b) };
}
export async function readSoundBank(buffer: ArrayBuffer) {
  const bank = SoundBankLoader.fromArrayBuffer(buffer); await BasicSoundBank.isSF3DecoderReady;
  return { bank, instruments: bank.presets.map(instrument) };
}
export function validateScoreInstruments(score: MusicScore, instruments: readonly MusicInstrument[]): string[] {
  const issues: string[] = [];
  let drumTracks = 0;
  for (const track of score.tracks) {
    const selected = instruments.find(item => item.id === track.instrumentId);
    if (!selected) { issues.push(`Track "${track.name}" uses instrument ${track.instrumentId}, absent from the selected soundbank. Explicitly remap it.`); continue; }
    if (selected.drum) drumTracks++;
    for (const note of track.notes) if (note.pitch < selected.minPitch || note.pitch > selected.maxPitch)
      issues.push(`Track "${track.name}" note ${note.id} exceeds instrument "${selected.name}" range ${selected.minPitch} through ${selected.maxPitch}`);
    for (const event of track.controls) if (!selected.controllers.includes(event.controller))
      issues.push(`Track "${track.name}" instrument "${selected.name}" does not declare CC${event.controller}`);
  }
  if (drumTracks > 1) issues.push('This version uses one GM drum channel. Merge drum notes into one track.');
  if (score.tracks.length - drumTracks > 15) issues.push('This version supports at most 15 melodic tracks and one drum track.');
  return issues;
}
