import { createId } from '@galcraft/contracts';
import type { Character as StageCharacter, ExecutionToken, Id, Json, ResolvedAsset, Result, RuntimeState } from '@galcraft/contracts';
import { FixtureCharacters, FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { defaultEffectValues, StageCommandService, type StageResourcePort, type VisualResource } from '@galcraft/stage';
import { expressionNames, type Candidate, type Expression, type Project, type Scene } from '../model.js';
import { createSampleCompositor, sampleLayers } from '../workfaces/sample-composition.js';

export const design = { width: 1920, height: 1080, color: '#182236' };

const missing = (id: string): Result<never> => {
  const error = { code: 'R0_ASSET_MISSING', severity: 'error' as const, owner: 'M01' as const, message: `素材 ${id} 不可用`, related: [], actions: [] };
  return { ok: false, error, issues: [error] };
};
const success = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });

export function createStageBridge() {
  const ids = new Map<string, Id>();
  const assets = new Map<Id, VisualResource>();
  const sessionId = createId();
  const compose = createSampleCompositor();
  function id(key: string) {
    if (!ids.has(key)) ids.set(key, createId());
    return ids.get(key)!;
  }
  function resource(url: string, background = false, key = url) {
    const assetId = id(`asset:${key}`), variantId = id(`variant:${key}`);
    const asset: ResolvedAsset = {
      ...FixtureSnapshot.assets[0]!, assetId, variantId,
      metadata: background ? { width: 1920, height: 1080 } : { width: 1024, height: 1536, hasAlpha: true },
    };
    assets.delete(assetId);
    assets.set(assetId, { asset, url, anchor: { x: .5, y: 1 } });
    if (assets.size > 24) assets.delete(assets.keys().next().value!);
    return { assetId, variantId };
  }
  const resources: StageResourcePort = { resolve: async (assetId, variantId) => {
    const item = assets.get(assetId);
    return item?.asset.variantId === variantId ? success(item) : missing(assetId);
  } };
  let occurrence = 0;

  function token(lineId: string): ExecutionToken {
    return { sessionId, occurrence: ++occurrence, statementId: id(`line:${lineId}`) };
  }

  async function prepare(project: Project, scene: Scene, lineId: string, expressions: Record<string, string>, candidate?: { characterId: string; value: Candidate }) {
    const characters = new Map<Id, StageCharacter>();
    for (const character of project.characters) {
      const cast = scene.cast[character.id];
      if (!cast?.visible) continue;
      const requested = expressions[character.id] ?? cast.expression;
      const expression = Object.hasOwn(expressionNames, requested) ? requested as Expression : cast.expression;
      const override = candidate?.characterId === character.id ? candidate.value.url : undefined;
      const layers = sampleLayers(character, cast.outfit, expression, cast.parts ?? character.parts, override);
      const composite = await compose(layers);
      if (!composite) continue;
      const differenceId = id(`difference:${character.id}:${expression}`);
      const figure = resource(composite.url, false, composite.key);
      characters.set(character.id, { ...FixtureCharacters[0]!, id: id(character.id), name: character.name,
        defaultEffects: defaultEffectValues, differences: [{ id: differenceId, name: expression, figure, avatar: null }], initialDifferenceId: differenceId });
    }
    const byStageId = new Map(Array.from(characters.values(), character => [character.id, character]));
    const service = new StageCommandService({
      asset(assetId, variantId) {
        const item = assets.get(assetId);
        return item && (!variantId || item.asset.variantId === variantId)
          ? success({ variantId: item.asset.variantId, kind: item.asset.kind, provider: null, providerVersion: null }) : missing(assetId);
      },
      character: characterId => byStageId.get(characterId),
    });
    let state: RuntimeState = structuredClone(FixtureRuntimeState);
    const owner = token(lineId);
    const run = async (opcode: string, args: Json) => {
      const result = await service.prepare({ state, token: owner, opcode, args });
      if (!result.ok) throw new Error(result.error.message);
      state = result.value.state;
    };
    const background = project.assets.find(asset => asset.id === scene.background)?.url ?? scene.background;
    if (background) await run('changeBg', { op: 'show', ...resource(background, true) });
    for (const [characterIndex, [characterId, character]] of Array.from(characters).entries()) {
      const cast = scene.cast[characterId]!;
      await run('characterDifference', { characterId: character.id, differenceId: character.initialDifferenceId!, transition: { preset: 'cut', durationMs: 0 } });
      await run('changeFigure', {
        op: 'show', objectId: id(`figure:${characterId}`), characterId: character.id, difference: true,
        z: characterIndex * 100, station: 'center',
        framing: { mode: 'full', scale: cast.scale, offsetX: cast.x - design.width / 2, offsetY: cast.y - design.height, crop: null },
      });
    }
    return { owner, presentation: state.presentation };
  }

  return { resources, prepare, objectId: (characterId: string) => id(`figure:${characterId}`) };
}
