import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { shapeType } from './definition.js';
import { command, fail, id, ok, stageObject, type Shape } from './model.js';
export function createPlugin(): GalCraftPlugin { return { activate: async () => ({ ...emptyContributions(),
  commands: [{ spec: command, execute: async input => { const object = stageObject(input.args as Parameters<typeof stageObject>[0]); return ok({ progress: input.state, longTermDelta: null, presentation: { objects: [{ op: 'show', id: object.id, value: object }], effects: [], audio: [] }, wait: null, result: null }); } }],
  stages: [{ key: id + '/canvas', resourceProviderKey: id + '/parser', create: async resource => {
    if (!resource.typeData || resource.typeData.provider.id !== id || resource.typeData.provider.version !== '0.1.0' || resource.typeData.typeVersion !== 1) return fail('The exact shape data provider is unavailable');
    const checked = shapeType.validate!(resource.typeData.value); if (!checked.ok) return checked;
    const shape = checked.value as Shape, canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
    const context = canvas.getContext('2d'); if (!context) return fail('Canvas 2D is unavailable');
    context.beginPath(); shape.vertices.forEach((vertex, index) => index ? context.lineTo(vertex.x, vertex.y) : context.moveTo(vertex.x, vertex.y)); context.closePath(); context.fillStyle = shape.color; context.fill();
    return ok({ update() {}, set: () => ok(undefined), capture: () => ok({}), pause() {}, renderSurface: () => canvas, dispose: () => { canvas.width = 0; canvas.height = 0; canvas.remove(); } });
  } }],
}), deactivate: async () => {} }; }
