import type { Asset, AssetVariant } from '@galcraft/contracts';
import type { Character, Part } from '../../../studio-r0/model.js';
import { teachingPsdLayers } from './psd-teaching/fixture.js';

export type PsdArtwork = { key: string; uri: string; width: number; height: number; bytes: number };
export type PsdLayer = {
  key: string; path: string; name: string; group?: string; visible: boolean; x: number; y: number; artwork: PsdArtwork;
  effect?: { name: string; targetGroup: string; skipOnlyReason?: string }; mergedArtwork?: PsdArtwork;
};
export type PsdTeachingSource = {
  sourceId: string; fileName: string; revision: 'v1' | 'v2'; width: number; height: number; layers: PsdLayer[];
};
export type PsdAxis = { id: string; name: string; choices: { id: string; name: string }[] };
export type PsdEffectDecision = 'merge' | 'skip' | null;
export type PsdTrackedLayer = {
  path: string; partId: string; assetId: string; variantId: string; sourceX: number; sourceY: number; artworkKey: string;
  axisId?: string; choiceId?: string; ambiguousPath?: true;
};
export type PsdSourceRecord = {
  sourceId: string; fileName: string; revision: PsdTeachingSource['revision']; width: number; height: number;
  effect: NonNullable<PsdEffectDecision>; layers: PsdTrackedLayer[];
};
export type CandidateAppearancePart = Part & {
  compositionAxisId?: string;
  compositionVariantId?: string | null;
  compositionSizedVariantId?: string;
  compositionFrame?: { width: number; height: number; canvasWidth: number; canvasHeight: number };
};
export type CandidateAppearance = Omit<Character, 'parts'> & {
  parts: CandidateAppearancePart[];
  compositionAxes?: PsdAxis[];
  compositionSelection?: Record<string, string>;
  psdSource?: PsdSourceRecord;
};

export type PsdResolution = 'keep' | { path: string; layerKey?: string };
export type PsdImportRow = {
  id: string; path: string; name: string; candidates: PsdLayer[];
  status: 'add' | 'refresh' | 'unchanged' | 'missing' | 'ambiguous' | 'manual' | 'hidden' | 'effect';
  action: 'add' | 'refresh' | 'replace' | 'preserve' | 'skip' | 'merge' | 'none';
  layer?: PsdLayer; previous?: PsdTrackedLayer; axisId?: string; artwork?: PsdArtwork; reason?: string;
};
export type PsdImportPlan = {
  source: PsdTeachingSource; effect: PsdEffectDecision; resolutions: Record<string, PsdResolution>;
  axes: PsdAxis[]; rows: PsdImportRow[]; canConfirm: boolean; changeCount: number;
};

export function teachingPsdSource(revision: PsdTeachingSource['revision']): PsdTeachingSource {
  return { sourceId: 'spring-lantern-psd', fileName: '春灯放映会 · 分层教学.psd', revision,
    width: 480, height: 720, layers: teachingPsdLayers(revision) };
}

export function appearanceAxisSelection(appearance: CandidateAppearance, axis: PsdAxis): string {
  const selection = appearance.compositionSelection?.[axis.id];
  return axis.choices.find(choice => choice.id === selection)?.id ?? axis.choices[0]?.id ?? '';
}

export function visibleAppearanceParts(appearance: CandidateAppearance): CandidateAppearancePart[] {
  const selected = new Map(appearance.compositionAxes?.map(axis => [axis.id, appearanceAxisSelection(appearance, axis)]));
  return appearance.parts.filter(part => part.visible && (part.compositionAxisId
    ? selected.get(part.compositionAxisId) === part.value
    : part.axis === 'shared' || part.value === appearance[part.axis]));
}

const axisId = (source: PsdTeachingSource, group: string) => `${source.sourceId}/${group}`;
const pathGroup = (path: string) => path.includes('/') ? path.split('/')[0] : undefined;
const trackedId = (tracked: PsdTrackedLayer) => `tracked:${tracked.partId}`;
const changed = (row: PsdImportRow) => row.action === 'add' || row.action === 'refresh' || row.action === 'replace';
function chosenLayer(row: PsdImportRow, choice: PsdResolution | undefined) {
  if (!choice || choice === 'keep') return undefined;
  const matches = row.candidates.filter(layer => layer.path === choice.path && (!choice.layerKey || layer.key === choice.layerKey));
  return matches.length === 1 ? matches[0] : undefined;
}

function isOriginalBinding(character: CandidateAppearance, assets: readonly Asset[], tracked: PsdTrackedLayer) {
  const part = character.parts.find(item => item.id === tracked.partId);
  const asset = assets.find(item => item.id === tracked.assetId);
  return part?.source === `asset:${tracked.assetId}` && !part.compositionVariantId && asset?.kind === 'image'
    && asset.activeVariantId === tracked.variantId && asset.variants.some(variant => variant.id === tracked.variantId);
}

export function planPsdImport({ character, assets, source, effect, resolutions = {} }: {
  character: CandidateAppearance; assets: readonly Asset[]; source: PsdTeachingSource; effect: PsdEffectDecision;
  resolutions?: Record<string, PsdResolution>;
}): PsdImportPlan {
  const record = character.psdSource;
  const sourceMatches = !record || record.sourceId === source.sourceId;
  const tracked = sourceMatches ? record?.layers ?? [] : [];
  const paths = new Map<string, PsdLayer[]>();
  for (const layer of source.layers) {
    if (!layer.effect) paths.set(layer.path, [...(paths.get(layer.path) ?? []), layer]);
  }
  const visible = source.layers.filter(layer => layer.visible && !layer.effect);
  const unique = visible.filter(layer => paths.get(layer.path)?.length === 1);
  const trackedPaths = new Set(tracked.map(layer => layer.path));
  const previousAxes = character.compositionAxes ?? [];
  const effects = source.layers.filter(layer => layer.visible && layer.effect && !layer.effect.skipOnlyReason);
  const artwork = (layer: PsdLayer) => effect === 'merge' && effects.some(item => item.effect?.targetGroup === layer.group)
    ? layer.mergedArtwork : layer.artwork;
  const sameArtwork = (layer: PsdLayer, previous: PsdTrackedLayer) => artwork(layer)?.key === previous.artworkKey
    && layer.x === previous.sourceX && layer.y === previous.sourceY && record?.width === source.width && record.height === source.height;
  const write = (row: PsdImportRow, layer: PsdLayer, action: 'add' | 'refresh' | 'replace'): PsdImportRow => ({
    ...row, layer, action, artwork: artwork(layer),
  });

  const existing = tracked.map((previous): PsdImportRow => {
    const samePath = unique.find(layer => layer.path === previous.path);
    const status = (paths.get(previous.path)?.length ?? 0) > 1 || previous.ambiguousPath && !!samePath ? 'ambiguous' : !samePath ? 'missing'
      : !isOriginalBinding(character, assets, previous) ? 'manual' : 'refresh';
    const row: PsdImportRow = { id: trackedId(previous), path: previous.path, name: previous.path.split('/').at(-1)!, status,
      action: 'preserve', previous, layer: samePath, candidates: [] };
    if (status === 'refresh' && samePath) {
      if (sameArtwork(samePath, previous)) return { ...row, status: 'unchanged', action: 'none' };
      return write(row, samePath, 'refresh');
    }
    const group = pathGroup(previous.path);
    row.candidates = [...visible.filter(layer => layer.path === previous.path),
      ...unique.filter(layer => layer.group === group && !trackedPaths.has(layer.path))];
    return row;
  });

  const claimed = new Map<string, number>();
  const reserved = new Set<string>();
  for (const row of existing) {
    if (row.action !== 'preserve') continue;
    const choice = resolutions[row.id];
    if (choice === 'keep') continue;
    const selected = chosenLayer(row, choice);
    if (selected) claimed.set(selected.path, (claimed.get(selected.path) ?? 0) + 1);
    else row.candidates.forEach(layer => reserved.add(layer.path));
  }
  const resolved = existing.map((row): PsdImportRow => {
    if (row.action !== 'preserve') return row;
    const layer = chosenLayer(row, resolutions[row.id]);
    if (!layer || claimed.get(layer.path) !== 1) return row;
    const original = isOriginalBinding(character, assets, row.previous!);
    const pathIsAmbiguous = (paths.get(layer.path)?.length ?? 0) > 1;
    if (original && row.previous!.path === layer.path && !!row.previous!.ambiguousPath === pathIsAmbiguous && sameArtwork(layer, row.previous!))
      return { ...row, layer, action: 'none' };
    return write(row, layer, original ? 'refresh' : 'replace');
  });
  const fresh = source.layers.flatMap((layer): PsdImportRow[] => {
    const row = { id: `source:${layer.key}`, path: layer.path, name: layer.name, layer, candidates: [] };
    if (!layer.visible) return [{ ...row, status: 'hidden', action: 'skip', reason: '原稿隐藏，导入时排除。' }];
    if (layer.effect?.skipOnlyReason) return [{ ...row, status: 'effect', action: 'skip', reason: layer.effect.skipOnlyReason }];
    if (layer.effect) return [{ ...row, status: 'effect', action: effect ?? 'preserve' }];
    if (trackedPaths.has(layer.path) || claimed.has(layer.path)) return [];
    if ((paths.get(layer.path)?.length ?? 0) > 1) {
      const candidates = visible.filter(candidate => candidate.path === layer.path);
      if (candidates[0] !== layer) return [];
      const ambiguous = { ...row, status: 'ambiguous', action: 'preserve', candidates } satisfies PsdImportRow;
      const chosen = chosenLayer(ambiguous, resolutions[row.id]);
      return [chosen && sourceMatches ? write(ambiguous, chosen, 'add') : ambiguous];
    }
    if (reserved.has(layer.path) || !sourceMatches) return [{ ...row, status: 'add', action: 'preserve',
      reason: sourceMatches ? '此图层可以接回原绑定，等待作者确认。' : '此版本来自另一个 PSD 来源。' }];
    return [write({ ...row, status: 'add', action: 'add' }, layer, 'add')];
  });
  const newGroups = new Map<string, number>();
  for (const row of fresh) {
    const group = row.layer?.group;
    if (row.action === 'add' && group) newGroups.set(group, (newGroups.get(group) ?? 0) + 1);
  }
  const rows = [...resolved, ...fresh].map(row => {
    const group = row.layer?.group;
    if (!group) return row;
    const id = axisId(source, group);
    return previousAxes.some(axis => axis.id === id) || (newGroups.get(group) ?? 0) >= 2 ? { ...row, axisId: id } : row;
  });
  const axes = previousAxes.map(axis => ({ ...axis, choices: [...axis.choices] }));
  for (const row of rows) {
    if (row.action !== 'add' || !row.axisId || !row.layer?.group) continue;
    let axis = axes.find(item => item.id === row.axisId);
    if (!axis) { axis = { id: row.axisId, name: row.layer.group, choices: [] }; axes.push(axis); }
    if (!axis.choices.some(choice => choice.id === row.layer!.path)) axis.choices.push({ id: row.layer.path, name: row.layer.name });
  }
  const changes = rows.filter(changed);
  return { source, effect, resolutions, axes, rows, changeCount: changes.length,
    canConfirm: sourceMatches && (!effects.length || effect !== null) && changes.length > 0 && changes.every(row => !!row.artwork) };
}

export function preparePsdImport({ character, assets, locations, plan, allocateId, now }: {
  character: CandidateAppearance; assets: readonly Asset[]; locations: Readonly<Record<string, string>>;
  plan: PsdImportPlan; allocateId: () => string; now: string;
}) {
  const current = planPsdImport({ character, assets, source: plan.source, effect: plan.effect, resolutions: plan.resolutions });
  if (!current.canConfirm || JSON.stringify(current.rows.filter(changed)) !== JSON.stringify(plan.rows.filter(changed)))
    throw new Error('PSD 导入预览已经失效，请重新检查图层和素材版本。');
  const { source, axes, rows } = current;
  const nextAssets = [...assets], nextLocations = { ...locations }, parts = [...character.parts];
  const tracked = [...(character.psdSource?.layers ?? [])];
  const stack = new Map(source.layers.map((layer, index) => [layer.path, index]));
  const updates = rows.filter(changed).sort((a, b) => stack.get(a.layer!.path)! - stack.get(b.layer!.path)!);
  for (const row of updates) {
    const layer = row.layer!, artwork = row.artwork!, prior = row.previous;
    const oldPart = parts.find(part => part.id === prior?.partId);
    const oldAsset = nextAssets.find(asset => asset.id === prior?.assetId && asset.kind === 'image');
    const assetId = oldAsset?.id ?? allocateId(), variantId = allocateId(), partId = prior?.partId ?? allocateId();
    const variant: AssetVariant = { id: variantId, parentId: oldAsset?.activeVariantId ?? null, role: 'original',
      entry: 'layer.png', files: [{ path: 'layer.png', bytes: artwork.bytes, mime: 'image/png', role: 'primary' }],
      metadata: { width: artwork.width, height: artwork.height, hasAlpha: true, hasTransparency: true },
      canvas: { width: source.width, height: source.height, offsetX: layer.x, offsetY: layer.y },
      processing: null, targets: { web: 'direct' }, groupCapabilities: null };
    if (oldAsset) nextAssets[nextAssets.indexOf(oldAsset)] = { ...oldAsset, revision: oldAsset.revision + 1,
      activeVariantId: variantId, variants: [...oldAsset.variants, variant], modifiedAt: now };
    else nextAssets.push({ id: assetId, revision: 1, name: `${layer.name}.png`, kind: 'image',
      folder: ['PSD', source.fileName], tags: ['PSD 教学'], locales: [], characterId: character.id, sceneIds: [], groupId: null,
      originalVariantId: variantId, activeVariantId: variantId, variants: [variant], sourceName: source.fileName,
      source: { kind: 'import', description: `${source.fileName} · ${layer.path}`, usage: 'localReview' }, createdAt: now, modifiedAt: now });
    nextLocations[`${assetId}/${variantId}`] = artwork.uri;

    const restoredAxis = prior?.axisId ?? row.axisId;
    const part: CandidateAppearancePart = {
      ...(oldPart ?? { id: partId, name: layer.name, axis: 'shared', visible: true,
        value: restoredAxis ? prior?.choiceId ?? layer.path : partId, ...(restoredAxis ? { compositionAxisId: restoredAxis } : {}) }),
      source: `asset:${assetId}`, image: artwork.uri, compositionVariantId: null, compositionSizedVariantId: variantId,
      x: layer.x + (oldPart && prior ? oldPart.x - prior.sourceX : 0), y: layer.y + (oldPart && prior ? oldPart.y - prior.sourceY : 0),
      compositionFrame: { width: artwork.width, height: artwork.height, canvasWidth: source.width, canvasHeight: source.height },
    };
    if (oldPart) parts[parts.indexOf(oldPart)] = part;
    else {
      const sourceOrder = stack.get(layer.path)!;
      const above = parts.findIndex(item => {
        const bound = tracked.find(entry => entry.partId === item.id);
        return !!bound && (stack.get(bound.path) ?? -1) > sourceOrder;
      });
      if (above === -1) parts.push(part); else parts.splice(above, 0, part);
    }
    const next: PsdTrackedLayer = { path: layer.path, partId, assetId, variantId, artworkKey: artwork.key, sourceX: layer.x, sourceY: layer.y,
      ...(part.compositionAxisId ? { axisId: part.compositionAxisId, choiceId: part.value } : {}),
      ...(source.layers.filter(item => !item.effect && item.path === layer.path).length > 1 ? { ambiguousPath: true } : {}) };
    if (prior) tracked[tracked.findIndex(item => item.partId === partId)] = next;
    else tracked.push(next);
  }
  const compositionSelection = { ...character.compositionSelection,
    ...Object.fromEntries(axes.map(axis => [axis.id, appearanceAxisSelection(character, axis)])) };
  const psdSource: PsdSourceRecord = { sourceId: source.sourceId, fileName: source.fileName, revision: source.revision,
    width: source.width, height: source.height, effect: current.effect ?? 'skip', layers: tracked };
  return { character: { ...character, parts, compositionAxes: axes, compositionSelection, psdSource } satisfies CandidateAppearance,
    assets: nextAssets, locations: nextLocations };
}
