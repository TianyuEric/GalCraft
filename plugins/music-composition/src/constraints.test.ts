import { expect, it } from 'vitest';
import { musicConstraintConflicts, musicConstraintViolations, parseMusicConstraints, scoreDurations } from './constraints.js';
import { createMusicScore } from './score.js';
import { assembleMusicWritingInput } from './prompts.js';
import type { MusicInstrument } from './catalog.js';
const piano: MusicInstrument = { id: 'melodic:0:0:0', name: 'Piano', bankMSB:0,bankLSB:0,program:0,drum:false,minPitch:0,maxPitch:127,controllers:[1,7,10,11,64,91,93] };
it('writes custom music without turning reference duration, tempo or instrumentation into requirements', () => {
  const score = createMusicScore(), custom = assembleMusicWritingInput(score, [piano], undefined, 'A new cue');
  expect(custom.system).not.toContain('Write restrained'); expect(custom.messages[0]!.text).not.toContain('Target duration');
  expect(custom.messages[0]!.text).toContain('reference material, not requirements');
  expect(() => assembleMusicWritingInput(score, [piano], 'MusDra', 'Cue')).toThrow(/presetId.*MusDra.*ambient, dramatic, pop/);
  expect(assembleMusicWritingInput(undefined, [piano], '', 'Cue', {}, score.soundbank).messages[0]!.text).toContain('No initial score');
});
it('validates every tempo point, exact meter, real body bars, loop bounds and actual sounding instruments', () => {
  const score = createMusicScore(); score.tempo = [{tick:0,bpm:120},{tick:1920,bpm:60}];
  expect(musicConstraintViolations(score, {fixedBpm:120})).toEqual([expect.stringContaining('fixedBpm')]);
  score.tempo = [{tick:0,bpm:120}]; score.meter = {beats:3,unit:8}; score.durationTicks = 8*480*3/2;
  score.loop = {startTick:0,endTick:score.durationTicks};
  expect(musicConstraintViolations(score, {fixedBpm:120,meter:{beats:3,unit:8},bars:8,bodySeconds:6,loop:{enabled:true},requiredInstruments:[piano.id]})).toEqual([]);
  score.tracks[0]!.notes=[];
  expect(musicConstraintViolations(score,{requiredInstruments:[piano.id]})).toEqual([expect.stringContaining('requiredInstruments')]);
  expect(musicConstraintViolations(score,{loop:{enabled:true,startTick:480,endTick:960}})).toEqual([expect.stringContaining('loop')]);
  expect(musicConstraintViolations(score,{excludedInstruments:[piano.id]})).toEqual([expect.stringContaining('excludedInstruments')]);
});
it('computes body, complete file and inner loop lengths using the renderer rules and explicit tolerance', () => {
  const score = createMusicScore(); score.tempo=[{tick:0,bpm:120},{tick:1920,bpm:60}]; score.loop={startTick:1920,endTick:3840};
  expect(scoreDurations(score)).toEqual({bodySeconds:14,totalSeconds:14,loopSeconds:4});
  score.loop=null; expect(scoreDurations(score)).toEqual({bodySeconds:14,totalSeconds:16,loopSeconds:null});
  expect(musicConstraintViolations(score,{bodySeconds:14,totalSeconds:16})).toEqual([]);
  expect(musicConstraintViolations(score,{bodySeconds:14.1})).toEqual([expect.stringContaining('bodySeconds')]);
  expect(musicConstraintViolations(score,{bodySeconds:14.1,toleranceSeconds:.2})).toEqual([]);
});
it('rejects conflicting constraints before a model request and locates unknown real instrument identities', () => {
  const render = createMusicScore().render;
  expect(musicConstraintConflicts({requiredInstruments:[piano.id],excludedInstruments:[piano.id],allowedInstruments:[]},[piano],render).join('\n')).toMatch(/also excluded[\s\S]*outside allowedInstruments/);
  expect(musicConstraintConflicts({requiredInstruments:['invented']},[piano],render)[0]).toContain('soundbankInfo');
  expect(musicConstraintConflicts({fixedBpm:120,meter:{beats:3,unit:8},bars:8,bodySeconds:30},[piano],render)[0]).toContain('bodySeconds');
  expect(musicConstraintConflicts({bodySeconds:30,totalSeconds:30,loop:{enabled:false}},[piano],render)[0]).toContain('totalSeconds');
  expect(musicConstraintConflicts({bodySeconds:30,totalSeconds:20},[piano],render)[0]).toContain('totalSeconds');
  expect(musicConstraintConflicts({bodySeconds:30,totalSeconds:30},[piano],render)).toEqual([]);
  expect(musicConstraintConflicts({bodySeconds:30,totalSeconds:32},[piano],render)).toEqual([]);
  expect(musicConstraintConflicts({loop:{enabled:false,startTick:0,endTick:960}},[piano],render)[0]).toContain('loop');
  expect(() => parseMusicConstraints({fixedBpm:301})).toThrow('musicConstraints');
});
