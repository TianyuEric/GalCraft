import { StageController } from '../src/renderer.js';
import type { StageObject } from '@galcraft/contracts';
import { FixtureEffects, FixtureIds, FixtureRuntimeState } from '@galcraft/contracts/fixtures';

const picture = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240"><rect width="160" height="240" fill="#fa487a"/><circle cx="80" cy="75" r="52" fill="#fff"/><rect x="45" y="130" width="70" height="95" fill="#fff"/></svg>');
const stage = await StageController.create(document.getElementById('stage')!, { width: 800, height: 450, color: '#273040' },
  { resolve: async (assetId, variantId) => ({ ok: true, value: { asset: { assetId, variantId, kind: 'image', entry: 'smoke.svg',
    files: [{ path: 'smoke.svg', bytes: 1, mime: 'image/svg+xml' }], metadata: { width: 160, height: 240 }, canvas: null, provider: null },
    url: picture, anchor: { x: 0.5, y: 1 } }, warnings: [] }) });
const state = structuredClone(FixtureRuntimeState.presentation);
const make = (index: number, station: StageObject['station'], z: number): StageObject => ({
  id: `00000000-0000-4000-8000-${(0x1100 + index).toString(16).padStart(12, '0')}`,
  characterId: FixtureIds.an, assetId: FixtureIds.background, variantId: FixtureIds.variant,
  layer: 'figure', entranceOrder: index, backgroundFrame: null, station,
  current: { ...structuredClone(FixtureEffects), z, filters: { ...FixtureEffects.filters, oldFilm: index === 1 }, blur: index === 2 ? 3 : 0 },
  defaults: { ...structuredClone(FixtureEffects), station },
  framing: { mode: 'full', scale: 1, offsetX: 0, offsetY: 0, crop: null },
  transition: { enter: { preset: 'cut', resourceId: null, durationMs: 0, easing: { family: 'linear', direction: 'in' }, direction: 'left' },
    exit: { preset: 'cut', resourceId: null, durationMs: 0, easing: { family: 'linear', direction: 'in' }, direction: 'left' } },
  processes: [], providerState: null, imageFace: null,
});
state.objects = [make(1, 'leftThird', 1), make(2, 'rightThird', 2)];
const prepared = await stage.prepareStage(FixtureIds.session, state);
if (!prepared.ok) throw prepared.error;
const committed = stage.commitStage(prepared.value.id, { sessionId: FixtureIds.session, occurrence: 1, statementId: FixtureIds.statements[0]! });
if (!committed.ok) throw committed.error;
const captured = stage.capture(); if (!captured.ok) throw captured.error;
document.getElementById('status')!.textContent = `ready: ${captured.value.objects.length} objects`;
