import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { inspectFile } from './import.js';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });

describe('real animated image metadata', () => {
  it.each(['gif', 'webp'] as const)('decodes %s bytes and preserves unequal frame durations', async format => {
    const directory = await mkdtemp(join(tmpdir(), 'galcraft-animated-image-')); directories.push(directory);
    const pixels = Buffer.alloc(4 * 12 * 4);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 4; x++) { const offset = (y * 4 + x) * 4;
      pixels[offset + Math.floor(y / 4)] = 255; pixels[offset + 3] = 255; }
    const image = sharp(pixels, { raw: { width: 4, height: 12, channels: 4, pageHeight: 4 } });
    const bytes = format === 'gif' ? await image.gif({ delay: [40, 120, 70], loop: 0 }).toBuffer() : await image.webp({ delay: [40, 120, 70], loop: 0, lossless: true }).toBuffer();
    const path = join(directory, `fixture.${format}`); await writeFile(path, bytes);
    const inspected = await inspectFile(path, '');
    expect(inspected.ok).toBe(true); if (!inspected.ok) throw inspected.error;
    expect(inspected.value.metadata).toMatchObject({ width: 4, height: 4, durationSec: .23,
      imageAnimation: { format, frameDurationsMs: [40, 120, 70], sourceLoopCount: 0 } });
    await writeFile(path, 'invalid bytes');
    expect((await inspectFile(path, '')).ok).toBe(false);
  });
});
