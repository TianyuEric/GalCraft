import { createId, type AuthoringInputDraft, type DocumentView, type Json, type SavePlan, type StudioBridge } from '@galcraft/contracts';
import { FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import { characterDraft, characterEdit } from '../authoring/characters/model.js';
import type { mountAuthoring } from '../authoring/view.js';
import { figureId, productSnapshot } from './product-fixture.js';
import { ok, studioFixture } from './studio-fixture.js';

export type CharacterReviewMetrics = { plans: number; saves: number; planned: string[]; saved: string[]; pending: string[] };
export const characterA = FixtureIds.an;
export const characterB = FixtureIds.friend;
export const legacyDescriptionA = '旧人物草稿：林舟一直保留着那封未署名的信。';
export const legacyDescriptionB = '旧人物草稿：友人在书店等待归来的旅人。';
export const legacyNewCharacter = fixtureId(0xfa30);
export const legacyNewName = '未寄出的访客';
export const legacyNewDescription = '旧新增人物草稿：访客在末班车离站后留下信封，约好雨停时回来取走。';
export const sampleDescription = '林舟在雨后的站台值守，替旅人保管未能寄出的信。他记得每班末车的时间，却始终没有寄出自己的那一封。';
export const sampleAppearance = '深色短发，灰蓝外套。值夜时将袖口挽起，外套口袋露出一角旧信封；说话前常先看向站台时钟。';

/** Real renderer and edit transactions; only persistence and recovery use memory. */
export async function characterRefinementFixture(theme: 'light' | 'dark', legacy: boolean, changed: (metrics: CharacterReviewMetrics) => void, profileSample = false) {
  const base = studioFixture('normal', 'zh-CN', theme);
  const services: Parameters<typeof mountAuthoring>[1] = base.services;
  const bridge = services.bridge.documents;
  if (profileSample) {
    const source = await services.read(), documents = await bridge.list();
    if (!source.ok) throw new Error(source.error.message);
    if (!documents.ok) throw new Error(documents.error.message);
    const draft = characterDraft(source.value.characters.find(character => character.id === characterA)!);
    const edit = characterEdit(source.value, documents.value, [{ ...draft, description: sampleDescription,
      appearance: { notes: sampleAppearance, referenceAssets: [figureId] } }]);
    const planned = await bridge.planEdit(edit);
    if (!planned.ok) throw new Error(planned.error.message);
    const applied = await bridge.applyEdit(planned.value.planId, edit.expected);
    if (!applied.ok) throw new Error(applied.error.message);
    const savePlan = await bridge.planSave({ kind: 'all' });
    if (!savePlan.ok) throw new Error(savePlan.error.message);
    const persisted = await bridge.save(savePlan.value.planId);
    if (!persisted.ok) throw new Error(persisted.error.message);
  }
  const originalList = bridge.list.bind(bridge), originalRead = services.read.bind(services);
  const initial = await originalList();
  if (!initial.ok) throw new Error(initial.error.message);
  const saved = new Map(initial.value.map(document => [document.documentId, { files: structuredClone(document.savedFiles), revision: document.savedRevision }]));
  const plans = new Map<string, SavePlan>();
  const metrics: CharacterReviewMetrics = { plans: 0, saves: 0, planned: [], saved: [], pending: [] };
  const emit = () => changed(structuredClone(metrics));
  const projected = (document: DocumentView): DocumentView => {
    const prior = saved.get(document.documentId);
    const savedFiles = prior?.files ?? {};
    return { ...document, savedFiles: structuredClone(savedFiles), savedRevision: prior?.revision ?? 0,
      dirty: JSON.stringify(document.files) !== JSON.stringify(savedFiles) };
  };
  bridge.list = async () => {
    const result = await originalList();
    return result.ok ? ok(result.value.map(projected)) : result;
  };
  services.read = async documents => {
    const result = await originalRead(documents);
    if (!result.ok) return result;
    const listed = await bridge.list();
    if (!listed.ok) return listed;
    const current = listed.value, source = result.value;
    const project = current.find(document => document.documentId === source.projectDocumentId)!;
    return ok({ ...source, projectDirty: project.dirty, projectSavedRevision: project.savedRevision,
      anyDirty: current.some(document => document.dirty),
      documentVersions: current.map(document => ({ documentId: document.documentId, revision: document.revision })),
      characterDocuments: Object.fromEntries(source.characters.map(character => {
        const document = current.find(document => `characters/${character.id}.json` in document.files)!;
        return [character.id, { documentId: document.documentId, dirty: document.dirty }];
      })),
      scenes: source.scenes.map(scene => {
        const document = current.find(document => document.documentId === scene.documentId)!;
        return { ...scene, dirty: document.dirty, savedRevision: document.savedRevision };
      }),
    });
  };
  bridge.planSave = async scope => {
    const listed = await bridge.list();
    if (!listed.ok) return listed;
    const members = listed.value.filter(document => document.dirty && (scope.kind === 'all' || scope.kind === 'current' && scope.documentId === document.documentId
      || scope.kind === 'objects' && scope.objects.some(object => object.documentId === document.documentId)));
    const objects = members.map(document => {
      const path = Object.keys(document.files).find(path => path.startsWith('characters/'));
      const name = path ? JSON.parse(document.files[path]!).data.name as string : document.documentId;
      return { kind: 'document' as const, objectId: null, documentId: document.documentId, key: `document:${document.documentId}`,
        revision: document.revision, name, paths: Object.keys(document.files) };
    });
    const plan: SavePlan = { planId: createId(), members: members.map(document => document.documentId),
      versions: members.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
      files: members.flatMap(document => Object.keys(document.files).map(path => ({ path, documentId: document.documentId, oldExists: path in document.savedFiles, newExists: true }))),
      extraDirtyMembers: [], objects, requestedObjects: objects.map(object => object.key), reasons: [], preview: members };
    plans.set(plan.planId, structuredClone(plan));
    metrics.plans++; metrics.planned = plan.members; emit();
    return ok(plan);
  };
  bridge.save = async planId => {
    const plan = plans.get(planId), listed = await bridge.list();
    if (!listed.ok) return listed;
    if (!plan || plan.versions.some(version => listed.value.find(document => document.documentId === version.ref.id)?.revision !== version.revision)) {
      const error = { code: 'STORY_SAVE_STALE', message: '内存保存范围已变化，请重新审阅。', owner: 'M02' as const, severity: 'error' as const, related: [], actions: [] };
      return { ok: false, error, issues: [error] };
    }
    for (const document of listed.value.filter(document => plan.members.includes(document.documentId))) {
      saved.set(document.documentId, { files: structuredClone(document.files), revision: document.revision });
    }
    plans.delete(planId); metrics.saves++; metrics.saved = plan.members; emit();
    return ok({ transactionId: createId(), saved: plan.versions, remainingDirty: listed.value.filter(document => !plan.members.includes(document.documentId) && document.dirty).map(document => document.documentId) });
  };
  const snapshot = productSnapshot();
  let input: AuthoringInputDraft | null = null;
  if (legacy) {
    const a = characterDraft(snapshot.characters.find(character => character.id === characterA)!);
    const b = characterDraft(snapshot.characters.find(character => character.id === characterB)!);
    const content = {
      version: 1, projectId: snapshot.projectId, unapplied: true, otherUnapplied: true, recoveryReviewed: false,
      versions: initial.value.map(document => ({ documentId: document.documentId, revision: document.revision })),
      scripts: [], writing: [], designer: null, publish: null, resourceProcessor: null, startup: null, language: null, playerName: null, production: null,
      character: { selected: characterA, search: '', section: 'basics', drafts: {
        [characterA]: { ...a, description: legacyDescriptionA }, [characterB]: { ...b, description: legacyDescriptionB },
        [legacyNewCharacter]: { id: legacyNewCharacter, name: legacyNewName, description: legacyNewDescription, narrativeRole: 'supporting' },
      }, bases: { [characterA]: a, [characterB]: b } },
      projectCreate: { name: '', template: 'standard', width: 1920, height: 1080, engineVersion: '' },
      documents: [{ id: 'characters', kind: 'characters', title: '角色与路线' }], active: 'characters', page: 'editor', sceneId: FixtureIds.street, view: 'writing', forms: [], retained: null,
    };
    input = { schemaVersion: 1, projectId: snapshot.projectId, entry: 'browser', updatedAt: '2026-11-17T00:00:00Z', content: JSON.parse(JSON.stringify(content)) as Json };
    metrics.pending = [characterA, characterB, legacyNewCharacter];
  }
  const preferences: StudioBridge['authoringPreferences'] = services.bridge.authoringPreferences;
  preferences.readInputDraft = async () => ok(input ? structuredClone(input) : null);
  preferences.writeInputDraft = async record => {
    input = structuredClone(record);
    const content = record.content as { character?: { drafts?: Record<string, unknown> } };
    metrics.pending = Object.keys(content.character?.drafts ?? {}); emit();
    return ok(undefined);
  };
  emit();
  return { services };
}
