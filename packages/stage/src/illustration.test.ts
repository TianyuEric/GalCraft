import { expect, test } from 'vitest';
import { RuntimeStateSchema, type Json, type RuntimeState } from '@galcraft/contracts';
import { FixtureIds, FixtureRuntimeState } from '@galcraft/contracts/fixtures';
import { StageCommandService } from './commands.js';
import { illustrationGeometry } from './geometry.js';
import { dialoguePortrait } from './portrait.js';

const token = { sessionId: FixtureIds.session, occurrence: 1, statementId: FixtureIds.statements[0]! };
const service = new StageCommandService({ asset: assetId => assetId === 'Bad001'
  ? { ok: false, error: { code: 'ASSET_MISSING', severity: 'error', message: 'Missing image', owner: 'M04', related: [], actions: [] }, issues: [] }
  : { ok: true, value: { variantId: FixtureIds.variant, kind: 'image', provider: null, providerVersion: null }, warnings: [] } });
async function run(state: RuntimeState, opcode: string, args: Json) {
  const result = await service.prepare({ state, token, opcode, args });
  if (!result.ok) throw result.error;
  return result.value.state;
}
test('illustrations coexist with figures and never become a speaking portrait', async () => {
  const state = await run(structuredClone(FixtureRuntimeState), 'changeFigure', { objectId: 'Fig001', assetId: FixtureIds.background,
    characterId: FixtureIds.an, portrait: { enabled: true } });
  const next = await run(state, 'changeIllustration', { objectId: 'Ill001', assetId: FixtureIds.background });
  expect(next.presentation.objects).toHaveLength(state.presentation.objects.length + 1);
  expect(next.presentation.objects.find(object => object.id === 'Ill001')).toMatchObject({ purpose: 'illustration', characterId: null,
    illustrationFrame: { widthRatio: .5, heightRatio: .5, fit: 'contain' } });
  const picture = next.presentation.objects.find(object => object.id === 'Ill001')!;
  picture.characterId = FixtureIds.an; picture.portrait = { enabled: true, crop: { x: 0, y: 0, width: 1, height: 1 } };
  expect(dialoguePortrait(next.presentation.objects, next.presentation.text)?.id).toBe('Fig001');
});
test('named differences preserve identity, framing, transitions and animation ownership through serialization', async () => {
  const initial = await run(structuredClone(FixtureRuntimeState), 'changeIllustration', { objectId: 'Ill001', assetId: FixtureIds.background,
    states: [{ name: 'happy', assetId: 'Art002' }], effects: { x: 80, y: -40, rotationDeg: 20, blend: 'screen', z: 3 },
    illustrationFrame: { widthRatio: .8, heightRatio: .4, fit: 'contain' } });
  const before = JSON.parse(JSON.stringify(initial.presentation.objects.find(object => object.id === 'Ill001')!));
  const changed = await run(initial, 'changeIllustrationDiff', { objectId: 'Ill001', stateName: 'happy' });
  const object = RuntimeStateSchema.parse(JSON.parse(JSON.stringify(changed))).presentation.objects.find(object => object.id === 'Ill001')!;
  expect(object).toMatchObject({ ...before, assetId: 'Art002', illustrationState: 'happy' });
  const failed = await service.prepare({ state: changed, token, opcode: 'changeIllustrationDiff', args: { objectId: 'Ill001', assetId: 'Bad001' } });
  expect(failed.ok).toBe(false);
  expect(changed.presentation.objects.find(object => object.id === 'Ill001')!.assetId).toBe('Art002');
  expect((await run(changed, 'changeIllustration', { objectId: 'Ill001', op: 'exit' })).presentation.objects.some(object => object.id === 'Ill001')).toBe(false);
});
test('default 960 by 540 frame contains the complete image canvas and cover crops proportionally', () => {
  const frame = { widthRatio: .5, heightRatio: .5, fit: 'contain' as const };
  expect(illustrationGeometry({ width: 1920, height: 1080 }, { width: 1920, height: 1080 }, frame)).toEqual({ scale: .5, crop: null });
  expect(illustrationGeometry({ width: 400, height: 1000 }, { width: 1920, height: 1080 }, frame).scale).toBe(.54);
  const cover = illustrationGeometry({ width: 400, height: 1000 }, { width: 1920, height: 1080 }, { ...frame, fit: 'cover' });
  expect(cover.scale).toBe(2.4); expect(cover.crop).toMatchObject({ width: 400, height: 225 });
});
