import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlBackBufferSystem, TextureGCSystem } from 'pixi.js';

const require = createRequire(import.meta.url);
const commonJS = require('pixi.js');

afterEach(() => vi.unstubAllGlobals());

// Exercise the installed dependency's presentation and GC hooks. Browser/GPU
// acceptance separately checks the real stage and its rendered pixels.
describe.each([
  ['ES module', GlBackBufferSystem],
  ['CommonJS', commonJS.GlBackBufferSystem],
])('back-buffer final surface (%s)', (_name, BackBuffer) => {
  it.each([
    { name: 'attached screen', present: true, attached: true, frames: 1 },
    { name: 'detached canvas', present: true, attached: false, frames: 0 },
    { name: 'offscreen render texture', present: false, attached: false, frames: 0 },
  ])('preserves the native GC decision for $name', ({ present, attached, frames }) => {
    class Canvas {}
    const canvas = new Canvas();
    vi.stubGlobal('HTMLCanvasElement', Canvas);
    vi.stubGlobal('document', { body: { contains: (resource) => attached && resource === canvas } });
    const screen = { colorTexture: { source: { resource: canvas } } };
    const offscreen = { colorTexture: { source: { resource: {} } } };
    const renderTarget = {
      renderingToScreen: false,
      renderTarget: offscreen,
      // The root of the pass remains the back buffer, even after presentation.
      rootRenderTarget: offscreen,
      finishRenderPass: vi.fn(),
      bind: vi.fn(() => { renderTarget.renderTarget = screen; }),
    };
    const renderer = {
      renderTarget,
      encoder: { draw: vi.fn() },
      texture: { managedTextures: [] },
      get renderingToScreen() { return renderTarget.renderingToScreen; },
    };
    const backBuffer = new BackBuffer(renderer);
    Object.assign(backBuffer, {
      _useBackBufferThisRender: present,
      _targetTexture: {},
      _backBufferTexture: { source: {} },
      _bigTriangleShader: { resources: {} },
    });
    const gc = new TextureGCSystem(renderer);
    gc.init(TextureGCSystem.defaultOptions);
    Reflect.get(backBuffer, 'renderEnd').call(backBuffer);
    Reflect.get(gc, 'postrender').call(gc);
    expect(renderer.encoder.draw).toHaveBeenCalledTimes(present ? 1 : 0);
    expect(renderTarget.renderingToScreen).toBe(attached && present);
    expect(gc.count).toBe(frames);
    expect(gc.checkCount).toBe(frames);
    expect(gc.maxIdle).toBe(3600);
    expect(gc.checkCountMax).toBe(600);
  });
});
