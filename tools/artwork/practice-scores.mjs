import { TicksClass } from '../../plugins/music-composition/node_modules/tone/build/esm/core/type/Ticks.js';
import { parseMusicScore, tickToSeconds } from '../../plugins/music-composition/dist/score.js';

// Original, deterministic note material. Motifs are performed as MIDI events by the
// public composition provider; no rendered audio excerpt is repeated or spliced.
const pieces = [
  { key: 'spring-01', title: '灯火的第一行', purpose: '标题与街道序幕', tonic: 62, mode: 'major', bpm: 86, bars: 32, lead: 0, alternate: 73, accompaniment: 46,
    chords: [0, 4, 5, 3, 1, 4, 3, 4], sections: [4, 8, 8, 8, 4], names: ['街灯引子', '第一行旋律', '风里的回声', '灯火展开', '回到街口'],
    phrases: [[0,2,4,6,4,2,1,2],[4,5,4,2,1,0,1,4],[5,7,6,4,3,4,2,1],[2,4,3,1,0,1,2,4],[7,6,4,2,4,5,4,2],[3,4,5,7,6,4,3,1],[2,1,0,-1,0,2,1,0],[1,3,4,2,1,-1,0,0]] },
  { key: 'spring-02', title: '把椅子排成春天', purpose: '日常筹备', tonic: 67, mode: 'major', bpm: 96, bars: 36, lead: 71, alternate: 11, accompaniment: 24,
    chords: [0, 5, 1, 4, 2, 5, 3, 4], sections: [4, 8, 8, 8, 8], names: ['开门', '排好椅子', '小小的插曲', '大家来帮忙', '准备妥当'],
    phrases: [[2,4,2,0,1,2,4,5],[4,2,1,2,0,-1,0,2],[1,3,5,4,3,1,2,3],[4,6,5,4,2,1,0,1],[5,4,2,0,2,4,5,7],[6,4,3,4,2,0,1,2],[3,5,4,3,1,0,-1,1],[2,1,4,2,1,-1,0,0]] },
  { key: 'spring-03', title: '把未说完的话留住', purpose: '角色路线对白', tonic: 69, mode: 'minor', bpm: 84, bars: 32, lead: 42, alternate: 73, accompaniment: 0,
    chords: [0, 5, 2, 6, 3, 0, 1, 4], sections: [4, 8, 8, 8, 4], names: ['窗边', '未说完的话', '心事的另一面', '向你靠近', '留住此刻'],
    phrases: [[0,2,4,3,2,0,-1,0],[2,4,5,4,2,1,0,-1],[2,4,6,5,4,2,3,4],[3,2,1,0,-1,1,2,1],[5,7,6,4,5,4,2,0],[3,5,4,2,1,0,1,2],[1,3,2,0,-1,0,1,3],[4,3,2,1,0,-1,0,0]] },
  { key: 'spring-04', title: '银幕亮起的那一秒', purpose: '共同放映高潮', tonic: 65, mode: 'major', bpm: 108, bars: 40, lead: 73, alternate: 0, accompaniment: 46,
    chords: [0, 4, 5, 3, 0, 2, 3, 4], sections: [8, 8, 8, 8, 8], names: ['放映机启动', '银幕亮起', '故事汇合', '满街灯火', '向下一幕'],
    phrases: [[0,4,7,6,4,2,4,5],[4,6,8,7,6,4,2,4],[5,7,9,8,7,5,4,2],[3,5,7,6,5,3,2,4],[7,6,4,2,4,7,8,7],[4,6,5,4,2,4,5,6],[3,5,6,7,5,3,2,1],[4,2,1,-1,0,2,4,0]] },
  { key: 'spring-05', title: '明天仍有一盏灯', purpose: '告别结局与后日谈', tonic: 63, mode: 'major', bpm: 86, bars: 32, lead: 68, alternate: 42, accompaniment: 0,
    chords: [0, 2, 5, 3, 1, 4, 3, 4], sections: [4, 8, 8, 8, 4], names: ['车站晚风', '告别的话', '回望灯火', '明天的约定', '温柔地继续'],
    phrases: [[4,2,1,0,2,4,5,4],[2,1,0,-1,0,2,1,2],[5,4,2,0,1,2,4,2],[3,2,1,0,-1,0,1,3],[4,5,7,6,4,2,1,0],[2,4,5,4,2,1,0,2],[3,5,4,2,1,0,1,2],[4,2,1,-1,0,1,2,0]] },
];

export function createPracticeScores() {
  return pieces.map((piece, pieceIndex) => {
    const score = { schemaVersion: 1, id: `spring-score-${pieceIndex + 1}-20261020`, title: piece.title, ppq: 480,
      tempo: [{ tick: 0, bpm: piece.bpm }], meter: { beats: 4, unit: 4 }, durationTicks: 0, loop: null, segments: [],
      soundbank: { id: 'musescore-general-hq', version: '0.1.0' }, tracks: [],
      render: { sampleRate: 48000, channels: 2, gain: .92, reverb: true, chorus: false, tailSeconds: 3, loopTail: 'wrap' }, origin: { kind: 'manual' } };
    const context = { transport: { PPQ: score.ppq, bpm: { value: piece.bpm }, timeSignature: 4 } };
    const unit = notation => new TicksClass(context, notation).toTicks();
    const bar = unit('1m'), eighth = unit('8n'), beat = unit('4n');
    score.durationTicks = piece.bars * bar; score.loop = { startTick: 0, endTick: score.durationTicks };
    let start = 0;
    piece.sections.forEach((bars, index) => { score.segments.push({ id: `${piece.key}-segment-${index + 1}`, name: piece.names[index], startTick: start * bar, endTick: (start + bars) * bar }); start += bars; });
    const addTrack = (name, program, volume, pan, drum = false) => { const track = { id: `${piece.key}-track-${score.tracks.length + 1}`, name, instrumentId: `${drum ? 'drum' : 'melodic'}:0:0:${program}`, volume: Math.min(127, Math.round(volume * 1.25)), pan, notes: [], controls: [] }; score.tracks.push(track); return track; };
    const lead = addTrack('主题 · ' + ['钢琴', '单簧管', '大提琴', '长笛', '双簧管'][pieceIndex], piece.lead, 83, 57);
    const answer = addTrack('应答声部', piece.alternate, 69, 77);
    const arpeggio = addTrack('和声与分解', piece.accompaniment, 65, 44);
    const strings = addTrack('弦乐长音', 48, 49, 79);
    const bass = addTrack('低音支点', 32, 67, 64);
    const sparkle = addTrack('星光点缀', 8, 44, 90);
    const drums = [1, 3].includes(pieceIndex) ? addTrack('轻节奏', 40, 43, 64, true) : null;
    const scale = piece.mode === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const pitch = degree => piece.tonic + 12 * Math.floor(degree / 7) + scale[((degree % 7) + 7) % 7];
    const note = (track, value, tick, length, velocity) => { const startTick = Math.round(tick), durationTicks = Math.min(score.durationTicks - startTick, Math.max(1, Math.round(length))); if (durationTicks > 0) track.notes.push({ id: `${track.id}-n${track.notes.length + 1}`, pitch: value, startTick, durationTicks, velocity: Math.max(1, Math.min(127, Math.round(velocity * 1.18))) }); };
    const sectionAt = b => score.segments.findIndex(segment => b * bar >= segment.startTick && b * bar < segment.endTick);
    for (let b = 0; b < piece.bars; b++) {
      const section = sectionAt(b), chord = piece.chords[b % 8], tick = b * bar;
      const intro = section === 0, middle = section === 2, climax = section === 3;
      const chordNotes = [pitch(chord) - 12, pitch(chord + 2) - 12, pitch(chord + 4) - 12];
      const phrase = piece.phrases[b % 8];
      // Four contrasting phrase rhythms, with held cadence notes and small gaps
      // for the dialogue. The middle section changes register and lead instrument.
      const rhythms = pieceIndex === 1 ? [[0,.5],[.75,.25],[1,.5],[1.5,.5],[2,.75],[3,.25],[3.25,.25],[3.5,.4]]
        : pieceIndex === 2 || pieceIndex === 4 ? [[0,.8],[1,.8],[2,1.5],[3.5,.35]]
          : b % 4 === 3 ? [[0,1],[1.25,.5],[2,1],[3.25,.55]] : [[0,.8],[1,.4],[1.5,.4],[2,.8],[3,.4],[3.5,.4]];
      if (!intro || b % 2 === 0) rhythms.forEach(([position, length], n) => {
        const degree = phrase[(n + (middle ? 2 : 0)) % phrase.length] + (climax && pieceIndex === 3 ? 7 : 0);
        let sounding = pitch(degree) + (pieceIndex === 2 ? -12 : 0);
        const destination = middle ? answer : lead;
        if (middle && pieceIndex === 2) sounding += 12;
        if (middle && pieceIndex === 4) sounding -= 12;
        note(destination, sounding, tick + position * beat, length * beat, (intro ? 60 : climax ? 76 : 67) + (n % 3) * 3);
      });
      // Voicings move independently from the tune, while rhythm, orchestration
      // and register change at actual section boundaries.
      const pattern = pieceIndex === 1 ? [0, 2, 1, 2, 0, 1, 2, 1] : middle ? [0, 1, 2, 1] : [0, 2, 1, 2, 0, 2, 1, 2];
      pattern.forEach((index, n) => note(arpeggio, chordNotes[index] + (n % 4 === 3 ? 12 : 0), tick + n * bar / pattern.length, bar / pattern.length * .86, 44 + (n % 3) * 4 + (climax ? 6 : 0)));
      note(bass, pitch(chord) - 24, tick, (pieceIndex === 1 ? 1.7 : 3.6) * beat, intro ? 45 : 54);
      if (pieceIndex === 1) note(bass, pitch(chord + 4) - 24, tick + 2 * beat, 1.6 * beat, 47);
      if (!intro && (b % 2 === 0 || climax)) chordNotes.forEach((value, n) => note(strings, value + (climax ? 12 : 0), tick + n * 12, (climax ? 3.6 : 7.5) * beat, middle ? 36 : 42));
      if (b % 4 === 3) [4, 2, 1].forEach((degree, n) => note(answer, pitch(chord + degree) + (piece.alternate === 42 ? -12 : 0), tick + (2 + n * .5) * beat, .42 * beat, 45 + n * 2));
      if ((climax || middle) && b % 2 === 1) [0, 2, 4].forEach((degree, n) => note(sparkle, pitch(chord + degree) + 12, tick + (1.5 + n * .75) * beat, .65 * beat, 38 + n * 3));
      if (drums && !intro) {
        [0, 2].forEach(position => note(drums, 36, tick + position * beat, .12 * beat, climax ? 46 : 37));
        [1, 3].forEach(position => note(drums, 38, tick + position * beat, .12 * beat, climax ? 40 : 30));
        Array.from({ length: climax ? 8 : 4 }, (_, n) => note(drums, 42, tick + n * (climax ? eighth : beat), .1 * beat, 24 + n % 3 * 3));
        if (climax && b % 8 === 0) note(drums, 49, tick, 2 * beat, 34);
      }
    }
    for (const track of score.tracks) {
      // A gentle dynamic arch and short boundary softening are source events,
      // so preview and offline rendering perform the same expression changes.
      track.controls.push({ tick: 0, controller: 11, value: 78 }, { tick: beat, controller: 11, value: 100 });
      for (const segment of score.segments.slice(1)) track.controls.push({ tick: segment.startTick, controller: 11, value: segment === score.segments[3] ? 106 : 94 });
      track.controls.push({ tick: score.durationTicks - beat, controller: 11, value: 90 }, { tick: score.durationTicks - 60, controller: 11, value: 78 });
      track.controls.sort((a, b) => a.tick - b.tick);
      track.notes.sort((a, b) => a.startTick - b.startTick);
    }
    const parsed = parseMusicScore(score); if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    return { key: piece.key, purpose: piece.purpose, score, production: { composer: 'GalCraft sample project original composition', method: 'manually authored original motifs and section arrangement; Tone.js 15.1.22 TicksClass musical duration calculation; public MusicScore schema v1; rendered by exact M10 SpessaSynth provider', durationSeconds: tickToSeconds(score, score.durationTicks), bars: piece.bars, beatsPerMinute: piece.bpm, loop: { startSeconds: 0, endSeconds: tickToSeconds(score, score.durationTicks), tail: 'wrap' }, fade: { source: 'CC11 expression', inBeats: 1, boundaryLevel: 78, projectPlaybackFadeInMs: 600, projectPlaybackFadeOutMs: 800 } } };
  });
}
