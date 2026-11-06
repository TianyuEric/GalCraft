import { createId, type DocumentView, type Id } from '@galcraft/contracts';
import { FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { StageCommandService, type StageResourcePort, type VisualResource } from '@galcraft/stage';
import type { Project, Scene } from '../../../studio-r0/model.js';
import { createStageBridge, design } from '../../../studio-r0/views/stage-bridge.js';
import { fail, ok } from '../application/services.js';
import type { CandidateAppearancePart } from '../workfaces/psd-import-model.js';
import { createCandidateCompositionCompositor, readAppearanceResources, type CandidateSceneCast } from './appearance-composition.js';

export type CandidateStageScene = Omit<Scene, 'cast'> & { cast: Record<string, CandidateSceneCast> };
type PreparedComposition = { key: string; resource: VisualResource };

export function createCandidateCompositionStage() {
  const legacy = createStageBridge();
  const compose = createCandidateCompositionCompositor();
  let byCharacter = new Map<string, PreparedComposition>();
  let byAsset = new Map<Id, VisualResource>();

  const resources: StageResourcePort = {
    async resolve(assetId, variantId) {
      const composed = byAsset.get(assetId);
      return composed?.asset.variantId === variantId ? ok(composed) : legacy.resources.resolve(assetId, variantId);
    },
  };

  async function prepare(project: Project, scene: CandidateStageScene, lineId: string, expressions: Record<string, string>, documents: readonly DocumentView[]) {
    const legacyScene = { ...scene, cast: Object.fromEntries(Object.entries(scene.cast).filter(([, cast]) => !cast.composition)) };
    // Older casts can fall back to teaching parts. Candidate layers enter through the scene snapshot.
    const legacyProject = { ...project, characters: project.characters.map(character => ({ ...character,
      parts: character.parts.filter((part: CandidateAppearancePart) => !part.compositionFrame && !part.compositionAxisId && !part.source.startsWith('asset:')),
    })) };
    const prepared = await legacy.prepare(legacyProject, legacyScene, lineId, expressions);
    if (!Object.values(scene.cast).some(cast => cast.visible && cast.composition)) {
      byCharacter.clear();
      byAsset.clear();
      return prepared;
    }

    const appearanceResources = readAppearanceResources(documents);
    const nextByCharacter = new Map<string, PreparedComposition>();
    const nextByAsset = new Map<Id, VisualResource>();
    const stage = new StageCommandService({
      asset(assetId, variantId) {
        const resource = nextByAsset.get(assetId);
        return resource && (!variantId || resource.asset.variantId === variantId)
          ? ok({ variantId: resource.asset.variantId, kind: resource.asset.kind, provider: null, providerVersion: null })
          : fail('舞台组合素材无法读取。', 'CANDIDATE_COMPOSITION_MISSING');
      },
    });
    let state = { ...FixtureRuntimeState, presentation: prepared.presentation };
    let z = 0;
    for (const character of project.characters) {
      const cast = scene.cast[character.id];
      if (!cast?.visible) continue;
      const objectId = legacy.objectId(character.id);
      if (!cast.composition) {
        const object = state.presentation.objects.find(item => item.id === objectId);
        if (object) {
          object.current.z = object.defaults.z = z;
          z += 100;
        }
        continue;
      }
      const image = await compose(cast.composition, appearanceResources);
      if (!image) continue;

      const previous = byCharacter.get(character.id);
      const assetId = previous?.resource.asset.assetId ?? createId();
      const resource: VisualResource = previous?.key === image.key ? previous.resource : {
        asset: { ...FixtureSnapshot.assets[0]!, assetId, variantId: createId(), metadata: { width: image.width, height: image.height, hasAlpha: true } },
        url: image.url,
        anchor: { x: .5, y: 1 },
      };
      nextByCharacter.set(character.id, { key: image.key, resource });
      nextByAsset.set(assetId, resource);
      const result = await stage.prepare({ state, token: prepared.owner, opcode: 'changeFigure', args: {
        op: 'show', objectId, characterId: character.id, assetId, variantId: resource.asset.variantId, z, station: 'center',
        framing: { mode: 'full', scale: cast.scale, offsetX: cast.x - design.width / 2, offsetY: cast.y - design.height, crop: null },
      } });
      if (!result.ok) throw new Error(result.error.message);
      state = result.value.state;
      z += 100;
    }
    byCharacter = nextByCharacter;
    byAsset = nextByAsset;
    return { owner: prepared.owner, presentation: state.presentation };
  }

  return { resources, prepare, objectId: legacy.objectId };
}
