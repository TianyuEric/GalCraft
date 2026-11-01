import { BasicMIDI, MIDIBuilder } from 'spessasynth_core';
import type { MusicScore } from './score.js';
import { tickToSeconds } from './score.js';
import type { MusicInstrument } from './catalog.js';
import { validateScoreInstruments } from './catalog.js';
export function compileMusicScore(score: MusicScore, instruments: readonly MusicInstrument[]) {
  const diagnostics = validateScoreInstruments(score, instruments); if (diagnostics.length) throw new Error(diagnostics.join('\n'));
  const midi = new MIDIBuilder({ timeDivision: score.ppq, initialTempo: score.tempo[0]!.bpm, format: 1, name: score.title });
  for (const event of score.tempo) midi.setTempo(event.tick, event.bpm);
  midi.addEvent(0, 0, 0x58, [score.meter.beats, Math.log2(score.meter.unit), 24, 8]);
  let melodic = 0;
  const events: { tick: number; channel: number; kind: string; values: number[] }[] = [];
  for (const [index, track] of score.tracks.entries()) {
    const selected = instruments.find(item => item.id === track.instrumentId)!;
    const channel = selected.drum ? 9 : melodic >= 9 ? ++melodic : melodic++;
    midi.addTrack(track.name); const n = index + 1;
    midi.controllerChange(0, n, channel, 0, selected.drum ? 0 : selected.bankMSB);
    midi.controllerChange(0, n, channel, 32, selected.bankLSB);
    midi.programChange(0, n, channel, selected.program);
    midi.controllerChange(0, n, channel, 7, track.volume); midi.controllerChange(0, n, channel, 10, track.pan);
    midi.controllerChange(0, n, channel, 91, score.render.reverb ? 40 : 0); midi.controllerChange(0, n, channel, 93, score.render.chorus ? 30 : 0);
    for (const event of track.controls) {
      midi.controllerChange(event.tick, n, channel, event.controller, event.value);
      events.push({ tick: event.tick, channel, kind: 'control', values: [event.controller, event.value] });
    }
    for (const note of track.notes) {
      midi.noteOn(note.startTick, n, channel, note.pitch, note.velocity);
      midi.noteOff(note.startTick + note.durationTicks, n, channel, note.pitch);
      events.push({ tick: note.startTick, channel, kind: 'noteOn', values: [note.pitch, note.velocity] }, { tick: note.startTick + note.durationTicks, channel, kind: 'noteOff', values: [note.pitch] });
    }
    midi.controllerChange(score.durationTicks, n, channel, 64, 0);
    midi.addEvent(score.durationTicks, n, 0x2f, []);
  }
  midi.flush();
  const durationSeconds = tickToSeconds(score, score.durationTicks);
  const loop = score.loop ? { startSec: tickToSeconds(score, score.loop.startTick), endSec: tickToSeconds(score, score.loop.endTick), tail: score.render.loopTail } : null;
  // MIDIBuilder owns a TextEncoder; the public BasicMIDI value crosses the AudioWorklet boundary.
  return { midi: BasicMIDI.fromArrayBuffer(midi.writeMIDI()), durationSeconds, loop, events: events.sort((a, b) => a.tick - b.tick || (a.kind === 'noteOff' ? -1 : 1)) };
}
