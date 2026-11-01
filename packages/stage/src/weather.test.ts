import { describe, expect, it } from 'vitest';
import { Sprite, Texture, TextureSource } from 'pixi.js';
import type { EffectInstance } from '@galcraft/contracts';
import { WeatherLayer } from './weather.js';

const id = '00000000-0000-4000-8000-000000000001';
const resourceId = '00000000-0000-4000-8000-000000000002';
const effect = (type: string, columns = 1): EffectInstance => ({ id, type, resourceId, enabled: true,
  target: 'stage', parameters: { columns, density: 20, speed: 100, directionDeg: 90 }, seed: 12345, elapsedMs: 0 });
const positions = (layer: WeatherLayer) => layer.container.children[0]!.children.map(sprite => [sprite.x, sprite.y, sprite.rotation, sprite.scale.x]);

describe('weather image particles', () => {
  it('keeps zero-speed snow motionless', () => {
    const layer = new WeatherLayer(1920, 1080), snow = effect('snow');
    snow.parameters.speed = 0;
    layer.sync([snow]); const before = positions(layer); layer.tick(2000);
    expect(positions(layer)).toEqual(before); layer.dispose();
  });
  it.each([['cherryBlossoms', 1], ['rain', 5], ['snow', 10]] as const)('animates %s textures and restores their captured phase', (type, columns) => {
    const source = new TextureSource({ width: 128 * columns, height: type === 'rain' ? 640 : 128 });
    const texture = new Texture({ source });
    const textures = new Map([[resourceId, texture]]), layer = new WeatherLayer(1920, 1080);
    layer.sync([effect(type, columns)], textures);
    const particles = layer.container.children[0]!.children as Sprite[];
    expect(particles.length).toBeGreaterThan(0);
    if (type === 'snow') expect(particles).toHaveLength(40);
    expect(particles.every(p => p instanceof Sprite && p.texture.width === 128)).toBe(true);
    expect(particles.every(p => Math.abs(p.height) < 140)).toBe(true);
    const initial = positions(layer); layer.tick(1350);
    expect(positions(layer)).not.toEqual(initial);
    const captured = layer.capture(), restored = new WeatherLayer(1920, 1080);
    restored.sync(captured, textures);
    expect(positions(restored)).toEqual(positions(layer));
    const resized = { ...captured[0]!, parameters: { ...captured[0]!.parameters, size: 48 } };
    restored.sync([resized], textures);
    expect((restored.container.children[0]!.children[0] as Sprite).height).not.toBe(particles[0]!.height);
    layer.sync([{ ...captured[0]!, enabled: false }], textures);
    expect(layer.count(id)).toBe(0);
    expect(texture.destroyed).toBe(false);
    layer.dispose(); restored.dispose(); texture.destroy(true);
  });
});
