import { Texture } from 'pixi.js';
import type { AnimatedImageMetadata, StageObject } from '@galcraft/contracts';

type DecodedFrame = { image: CanvasImageSource & { close(): void } };
type Decoder = { tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(options: { frameIndex: number; completeFramesOnly: boolean }): Promise<DecodedFrame>; close(): void };
type DecoderConstructor = new (options: { data: ArrayBuffer; type: string; preferAnimation: boolean }) => Decoder;
export type AnimatedImage = { textures: Texture[]; dispose(): void };

export async function decodeAnimatedImage(url: string, metadata: AnimatedImageMetadata): Promise<AnimatedImage> {
  const ImageDecoder = (globalThis as unknown as { ImageDecoder?: DecoderConstructor }).ImageDecoder;
  if (!ImageDecoder) throw new Error('IMAGE_DECODER_UNAVAILABLE: This Player requires an animated image decoder');
  const response = await fetch(url); if (!response.ok) throw new Error(`IMAGE_DECODE_FAILED: HTTP ${response.status}`);
  const decoder = new ImageDecoder({ data: await response.arrayBuffer(), type: `image/${metadata.format}`, preferAnimation: true });
  const textures: Texture[] = [];
  try {
    await decoder.tracks.ready;
    if (decoder.tracks.selectedTrack?.frameCount !== metadata.frameDurationsMs.length) throw new Error('IMAGE_FRAME_COUNT: Locked frame metadata does not match the decoded image');
    for (let index = 0; index < metadata.frameDurationsMs.length; index++) {
      const frame = await decoder.decode({ frameIndex: index, completeFramesOnly: true });
      try {
        const image = frame.image as CanvasImageSource & { displayWidth: number; displayHeight: number };
        const canvas = document.createElement('canvas'); canvas.width = image.displayWidth; canvas.height = image.displayHeight;
        const context = canvas.getContext('2d'); if (!context) throw new Error('IMAGE_CANVAS: Could not create an animated image surface');
        context.drawImage(image, 0, 0); textures.push(Texture.from(canvas));
      } finally { frame.image.close(); }
    }
    return { textures, dispose: () => { for (const texture of textures) texture.destroy(true); textures.length = 0; } };
  } catch (error) { for (const texture of textures) texture.destroy(true); throw error; }
  finally { decoder.close(); }
}

export function animatedImageFrame(playback: NonNullable<StageObject['imagePlayback']>): number {
  const duration = playback.frameDurationsMs.reduce((sum, value) => sum + value, 0);
  if (playback.completed) return playback.frameDurationsMs.length - 1;
  let time = playback.mode === 'loop' ? playback.elapsedMs % duration : Math.min(playback.elapsedMs, duration);
  for (let index = 0; index < playback.frameDurationsMs.length; index++) {
    if (time < playback.frameDurationsMs[index]!) return index;
    time -= playback.frameDurationsMs[index]!;
  }
  return playback.frameDurationsMs.length - 1;
}
export function advanceImagePlayback(playback: NonNullable<StageObject['imagePlayback']>, deltaMs: number) {
  const next = structuredClone(playback), duration = next.frameDurationsMs.reduce((sum, value) => sum + value, 0);
  if (next.completed) return { playback: next, completed: false };
  next.elapsedMs += Math.max(0, deltaMs);
  if (next.mode === 'loop') next.elapsedMs %= duration;
  else if (next.elapsedMs >= duration) { next.elapsedMs = duration; next.completed = true; }
  return { playback: next, completed: next.completed };
}
