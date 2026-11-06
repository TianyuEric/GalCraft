import { AnimationGenerationRequestSchema, animationChanges, createId, resolveAnimationGeneration, type AnimationGenerationRequest, type AnimationTrack, type Json, type NativeAnimation } from '@galcraft/contracts';
import type { Candidate, Task, TaskItem } from '@galcraft/authoring/production';
import type { CandidateOutput } from './task-adoption.js';
import { taskTime } from './task-model.js';

const images = [
  { sky: '#263354', glow: '#fec88b', silhouette: '#212947', foreground: '#1a2534', center: 720 },
  { sky: '#2c4352', glow: '#f5e6b8', silhouette: '#263946', foreground: '#1e3036', center: 1220 },
];
function reviewImage(variant: number, width: number, height: number) {
  const colors = images[variant % images.length]!;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1920 1080">
  <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${colors.sky}"/><stop offset="1" stop-color="${colors.glow}"/></linearGradient><radialGradient id="light"><stop stop-color="${colors.glow}"/><stop offset="1" stop-color="${colors.glow}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1920" height="1080" fill="url(#sky)"/><circle cx="${colors.center}" cy="485" r="280" fill="url(#light)"/><circle cx="${colors.center}" cy="485" r="59" fill="${colors.glow}"/>
  <path fill="${colors.silhouette}" d="M0 790 240 500l250 230 238-95 180 133 270-272 240 260 180-106 322 116v314H0z"/>
  <path fill="${colors.foreground}" d="M0 895l200-70 182 8 288 72 250-80 254 36 212-55 232 65 302-51v260H0z"/>
  <path fill="none" stroke="${colors.glow}" stroke-width="4" opacity=".45" d="m630 968 213-15m-312 48 352-19m100-56 136-10m-281 101 493-29"/></svg>`);
}
function reviewBitmap(variant: number, width: number, height: number) {
  if (typeof document === 'undefined')
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMk8AAAAASUVORK5CYII=';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const palette = images[variant % images.length]!;
  context.scale(width / 1920, height / 1080);
  const sky = context.createLinearGradient(0, 0, 0, 980);
  sky.addColorStop(0, palette.sky);
  sky.addColorStop(1, palette.glow);
  context.fillStyle = sky;
  context.fillRect(0, 0, 1920, 1080);
  context.fillStyle = palette.glow;
  context.beginPath();
  context.arc(palette.center, 485, 59, 0, 2 * Math.PI);
  context.fill();
  const ridge = (color: string, points: [number, number][]) => {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, 1080);
    for (const [x, y] of points) context.lineTo(x, y);
    context.lineTo(1920, 1080);
    context.fill();
  };
  ridge(palette.silhouette, [[0, 790], [240, 500], [490, 730], [728, 635], [908, 768], [1178, 496], [1418, 756], [1598, 650], [1920, 766]]);
  ridge(palette.foreground, [[0, 895], [200, 825], [382, 833], [670, 905], [920, 825], [1174, 861], [1386, 806], [1618, 871], [1920, 820]]);
  return canvas.toDataURL('image/png');
}
function reviewAudio(variant: number, speech: boolean) {
  const rate = 8000, samples = speech ? 8000 : 12000, wave = new Uint8Array(44 + samples * 2), header = new DataView(wave.buffer);
  const tag = (offset: number, name: string) => { for (let index = 0; index < name.length; index++) wave[offset + index] = name.charCodeAt(index); };
  tag(0, 'RIFF'); header.setUint32(4, wave.length - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, rate, true); header.setUint32(28, rate * 2, true); header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  tag(36, 'data'); header.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) {
    const seconds = index / rate, fade = Math.min(1, index / 500, (samples - index) / 700);
    const tone = Math.sin(Math.PI * 2 * seconds * (variant % 2 ? 330 : 261.6));
    header.setInt16(44 + index * 2, Math.round(4100 * tone * fade * (speech ? Math.sin(16 * seconds) ** 2 : 1)), true);
  }
  let binary = '';
  for (const value of wave) binary += String.fromCharCode(value);
  return 'data:audio/wav;base64,' + btoa(binary);
}
const inputFields = (value: Json) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function resolveReviewAnimation(raw: unknown, request: AnimationGenerationRequest) {
  const animation = resolveAnimationGeneration(raw, request);
  const text = JSON.stringify(animation, null, 2) + '\n';
  const mime = 'application/json';
  return {
    output: { text, media: [{ mime, uri: 'data:application/json;charset=utf-8,' + encodeURIComponent(text) }] },
    bytes: new TextEncoder().encode(text).length,
    metadata: { originalAnimation: request.currentAnimation, animationChanges: animationChanges(request.currentAnimation, animation) },
  };
}

function reviewAnimation(request: AnimationGenerationRequest, index: number) {
  const original = request.currentAnimation;
  const durationMs = original?.durationMs ?? (index === 0 ? 700 : 1000);
  const range = request.mode === 'patch' ? request.range : null;
  const times = [...new Set([range?.startMs ?? 0, range?.endMs ?? durationMs])];
  const paths: AnimationTrack['path'][] = request.mode === 'patch' ? [...new Set(request.paths)] : original?.tracks.map(track => track.path) ?? ['/x'];
  const tracks = paths.map((path): AnimationTrack => {
    const previous = original?.tracks.find(track => track.path === path);
    const value = previous?.keyframes[0]?.value;
    const keyframes = times.map((timeMs, frame): AnimationTrack['keyframes'][number] => ({
      timeMs,
      value: path === '/station' ? index === 0 ? 'leftThird' : 'rightThird'
        : path === '/blend' ? index === 0 ? 'multiply' : 'screen'
        : path === '/circle/invert' || path.startsWith('/filters/') ? (frame + index) % 2 === 1
        : path === '/opacity' ? index === 0 ? 0.6 : 0.9
        : (typeof value === 'number' ? value : 0) + (frame + 1) * (index === 0 ? 5 : -5),
      easing: { family: 'linear', direction: 'in' },
    }));
    return { path, mode: previous?.mode ?? (path === '/x' && !original ? 'add' : 'absolute'), keyframes };
  });
  const proposed: NativeAnimation = { type: 'galcraft.animation', version: 1, durationMs, tracks };
  return resolveReviewAnimation(proposed, request);
}

export function reviewCandidates(task: Task, item: TaskItem) {
  const fields = inputFields(item.input);
  const size = (value: Json | undefined, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(4096, Math.max(1, value))) : fallback;
  const imagesWanted = typeof fields.count === 'number' && Number.isFinite(fields.count) ? Math.round(Math.min(8, Math.max(1, fields.count))) : 1;
  const count = item.purpose === 'image' || item.purpose === 'difference' ? imagesWanted : 2;
  return Array.from({ length: count }, (_, index) => {
    const id = createId(task), operation = item.operation;
    const textMessages = Array.isArray(fields.messages) ? fields.messages.map(inputFields) : [];
    const lastRequest = textMessages.filter(message => message.role === 'user').at(-1)?.text;
    const requestText = typeof lastRequest === 'string' ? lastRequest.trim().split('\n\n').at(-1) : undefined;
    const instruction = String(fields.instruction || fields.positive || fields.prompt || fields.text || requestText || '灯影倒映在街面上。');
    const say = (text: string, speaker: Json) => 'say ' + JSON.stringify({ speaker, text }) + ' @' + createId() + ';';
    let output: CandidateOutput = { text: '', media: [] };
    let kind: Candidate['artifacts'][number]['kind'] = 'text', mime = 'text/plain', extension = 'txt';
    let animation: ReturnType<typeof reviewAnimation> | undefined;
    if (item.operationSnapshot?.definition.outputs.some(value => value.type === 'animation' && value.typeVersion === 1)) {
      animation = reviewAnimation(AnimationGenerationRequestSchema.parse(fields.fields), index);
      output = animation.output; kind = 'animation'; mime = 'application/json'; extension = 'gca';
    } else if (operation === 'script') {
      const speaker = { kind: 'narrator' };
      output.text = [say(index === 0 ? instruction : '灯影落在石阶上。' + instruction, speaker),
        'wait {"durationMs":420} @' + createId() + ';',
        say(index === 0 ? '灯影在水面轻轻晃动。' : '人群沿着长街散开。', speaker)].join('\n');
      extension = 'gal';
    } else if (operation === 'performance') {
      output.text = 'wait {"durationMs":' + (index === 0 ? 420 : 760) + '} @' + createId() + ';';
      extension = 'gal';
    } else if (operation === 'svg') {
      kind = 'image'; mime = 'image/svg+xml'; extension = 'svg';
      output.media = [{ mime, uri: reviewImage(index, size(fields.width, 1920), size(fields.height, 1080)) }];
    } else if (item.purpose === 'image' || item.purpose === 'difference') {
      kind = 'image'; mime = 'image/png'; extension = 'png';
      output.media = [{ mime, uri: reviewBitmap(index, size(fields.width, 1920), size(fields.height, 1080)) }];
    } else if (item.purpose === 'speech' || item.purpose === 'music') {
      kind = 'audio'; mime = 'audio/wav'; extension = 'wav';
      output.media = [{ mime, uri: reviewAudio(index, item.purpose === 'speech') }];
    } else if (operation === 'imagePrompt' || operation === 'differencePrompt' || operation === 'speechText' || operation === 'musicPrompt') {
      const variantText = index === 0 ? instruction : instruction + ' · 轻柔';
      const spokenText = typeof lastRequest === 'string' ? /朗读文本：([^\n]*)/.exec(lastRequest)?.[1] : undefined;
      const prepared = operation === 'imagePrompt' ? { kind: operation, format: 'natural', positive: variantText, negative: null }
        : operation === 'differencePrompt' ? { kind: operation, instruction: variantText, negative: null }
        : operation === 'speechText' ? { kind: operation, spokenText: spokenText || instruction, pronunciationNotes: '', emotion: index === 0 ? null : '轻柔' }
        : { kind: operation, prompt: variantText, lyrics: null };
      output.text = JSON.stringify(prepared, null, 2);
    } else {
      output.text = index === 0 ? instruction : '春夜灯会 · ' + instruction;
    }
    const candidate: Candidate = {
      schemaVersion: 1, id, taskId: task.id, itemId: item.id, operation, operationSnapshot: item.operationSnapshot, createdAt: taskTime(), partial: false,
      parentCandidateIds: item.conversation ? [item.conversation.parentCandidateId] : [], input: item.input,
      artifacts: [{ kind, localPath: 'review-' + id + '.' + extension, mime, bytes: animation?.bytes ?? output.media[0]?.uri.length ?? new TextEncoder().encode(output.text).length,
        metadata: animation?.metadata ?? {}, groupId: id, port: animation ? 'animation' : 'result', role: 'primary', background: null,
        ...(animation ? { typeVersion: 1 } : {}) }],
      backgroundPreview: item.backgroundPreview, provenance: { connectionName: item.configSnapshot?.name ?? '候选审核宿主', protocol: item.configSnapshot?.protocol ?? null,
        model: item.configSnapshot?.model ?? null, workflowVersion: item.workflowSnapshot ? String(item.workflowSnapshot.revision) : null,
        seed: index + 1, usage: null, serviceRequestId: item.attempts.at(-1)?.id ?? null },
      sourceVersions: structuredClone(item.sourceVersions), editedText: null, recipeSnapshot: item.recipeSnapshot, uiCompositionId: null, checks: [], adoption: [],
    };
    return { candidate, output };
  });
}
