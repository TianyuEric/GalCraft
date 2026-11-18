import type { AuthoringInputDraft, Json } from '@galcraft/contracts';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { characterDraft, characterEdit } from '../authoring/characters/model.js';
import { characterA, characterB, characterRefinementFixture, legacyDescriptionA, legacyNewCharacter, legacyNewDescription, legacyNewName } from './character-refinement-fixture.js';

export type RecoveryScenario = 'cold' | 'new' | 'other' | 'empty';
export type RecoveryMetrics = { plans: number; saves: number; applies: number; pending: string[]; retained: boolean;
  priorBRevision: number; savedBRevision: number; sourceHasNew: boolean };
export const savedDescriptionB = '已保存的友人：在书店替归来的旅人留了一盏灯。';
export const retainedScript = '来源变化后保留的剧本原文：雨停以后，旅人仍会回到书店。';

/** A fresh real renderer reads a legacy record after B advances in the memory project. */
export async function characterRecoveryRefinementFixture(theme: 'light' | 'dark', scenario: RecoveryScenario, changed: (metrics: RecoveryMetrics) => void) {
  const metrics: RecoveryMetrics = { plans: 0, saves: 0, applies: 0, pending: [], retained: false,
    priorBRevision: 0, savedBRevision: 0, sourceHasNew: false };
  let setup = true, setupPlans = 0, setupSaves = 0;
  const emit = () => changed(structuredClone(metrics));
  const fixture = await characterRefinementFixture(theme, false, totals => {
    if (setup) { setupPlans = totals.plans; setupSaves = totals.saves; }
    metrics.plans = totals.plans - setupPlans; metrics.saves = totals.saves - setupSaves; emit();
  });
  const { services } = fixture, bridge = services.bridge.documents;
  const initial = await bridge.list(), source = await services.read();
  if (!initial.ok) throw new Error(initial.error.message);
  if (!source.ok) throw new Error(source.error.message);
  const a = characterDraft(source.value.characters.find(character => character.id === characterA)!);
  const b = characterDraft(source.value.characters.find(character => character.id === characterB)!);
  const documentB = initial.value.find(document => `characters/${characterB}.json` in document.files)!;
  metrics.priorBRevision = documentB.revision;
  if (scenario === 'cold' || scenario === 'other') {
    const edit = characterEdit(source.value, initial.value, [{ ...b, description: savedDescriptionB }]);
    const planned = await bridge.planEdit(edit);
    if (!planned.ok) throw new Error(planned.error.message);
    const applied = await bridge.applyEdit(planned.value.planId, edit.expected);
    if (!applied.ok) throw new Error(applied.error.message);
    const save = await bridge.planSave({ kind: 'current', documentId: documentB.documentId });
    if (!save.ok) throw new Error(save.error.message);
    const saved = await bridge.save(save.value.planId);
    if (!saved.ok) throw new Error(saved.error.message);
  }
  const current = await bridge.list();
  if (!current.ok) throw new Error(current.error.message);
  metrics.savedBRevision = current.value.find(document => document.documentId === documentB.documentId)!.savedRevision;
  setup = false;
  const originalApply = bridge.applyEdit.bind(bridge);
  bridge.applyEdit = async (...args) => {
    const result = await originalApply(...args);
    if (result.ok) { metrics.applies++; emit(); }
    return result;
  };
  const selected = scenario === 'empty' ? '' : scenario === 'new' ? legacyNewCharacter : characterA;
  const drafts = scenario === 'empty' ? {} : scenario === 'new'
    ? { [legacyNewCharacter]: { id: legacyNewCharacter, name: legacyNewName, description: legacyNewDescription, narrativeRole: 'supporting' } }
    : { [characterA]: { ...a, description: legacyDescriptionA } };
  const content = {
    version: 1, projectId: source.value.project.projectId, unapplied: scenario !== 'empty', otherUnapplied: scenario !== 'empty', recoveryReviewed: false,
    versions: initial.value.map(document => ({ documentId: document.documentId, revision: document.revision })),
    scripts: scenario === 'other' ? [[FixtureIds.street, retainedScript]] : [], writing: [], designer: null,
    publish: null, resourceProcessor: null, startup: null, language: null, playerName: null, production: null,
    character: { selected, search: '', section: 'basics', drafts, bases: scenario === 'cold' || scenario === 'other' ? { [characterA]: a } : {} },
    projectCreate: { name: '', template: 'standard', width: 1920, height: 1080, engineVersion: '' },
    documents: [{ id: 'characters', kind: 'characters', title: '角色与路线' }], active: 'characters',
    page: 'editor', sceneId: FixtureIds.street, view: 'writing', forms: [], retained: null,
  };
  let input: AuthoringInputDraft = { schemaVersion: 1, projectId: source.value.project.projectId, entry: 'browser',
    updatedAt: '2026-11-17T00:00:00Z', content: JSON.parse(JSON.stringify(content)) as Json };
  metrics.pending = Object.keys(drafts);
  services.bridge.authoringPreferences.readInputDraft = async () => ({ ok: true, value: structuredClone(input), warnings: [] });
  services.bridge.authoringPreferences.writeInputDraft = async record => {
    input = structuredClone(record);
    const value = record.content as { character?: { drafts?: Record<string, unknown> }; retained?: Json };
    metrics.pending = Object.keys(value.character?.drafts ?? {}); metrics.retained = value.retained != null; emit();
    return { ok: true, value: undefined, warnings: [] };
  };
  const originalRead = services.read.bind(services);
  services.read = async documents => {
    const result = await originalRead(documents);
    if (result.ok) { metrics.sourceHasNew = result.value.characters.some(character => character.id === legacyNewCharacter); emit(); }
    return result;
  };
  emit();
  return fixture;
}
