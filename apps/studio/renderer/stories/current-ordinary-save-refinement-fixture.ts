import { characterRefinementFixture } from './character-refinement-fixture.js';
import { characterDraft, characterEdit } from '../authoring/characters/model.js';

export type OrdinarySaveMetrics = { plans: number; saves: number; applies: number; members: string[]; projectDocument: string;
  projectDirty: boolean; sourceLanguage: string; defaultName: string; splashDuration: number | null; clipHold: number | null; reveal: number | null };

/** Real document planning and edit transactions; saved files remain in memory. */
export async function currentOrdinarySaveRefinementFixture(theme: 'light' | 'dark', changed: (metrics: OrdinarySaveMetrics) => void, noViewpoint = false) {
  const metrics: OrdinarySaveMetrics = { plans: 0, saves: 0, applies: 0, members: [], projectDocument: '', projectDirty: false,
    sourceLanguage: '', defaultName: '', splashDuration: null, clipHold: null, reveal: null };
  const emit = () => changed(structuredClone(metrics));
  let preparing = true, setupPlans = 0, setupSaves = 0;
  const fixture = await characterRefinementFixture(theme, false, totals => {
    if (preparing) { setupPlans = totals.plans; setupSaves = totals.saves; }
    metrics.plans = totals.plans - setupPlans; metrics.saves = totals.saves - setupSaves;
    if (!preparing) metrics.members = metrics.plans ? totals.planned : []; emit();
  });
  const { services } = fixture, documents = services.bridge.documents;
  if (noViewpoint) {
    const source = await services.read(), listed = await documents.list();
    if (!source.ok) throw new Error(source.error.message);
    if (!listed.ok) throw new Error(listed.error.message);
    const drafts = source.value.characters.filter(character => character.narrativeRole === 'viewpoint')
      .map(character => ({ ...characterDraft(character), narrativeRole: 'supporting' as const }));
    const edit = characterEdit(source.value, listed.value, drafts), planned = await documents.planEdit(edit);
    if (!planned.ok) throw new Error(planned.error.message);
    const applied = await documents.applyEdit(planned.value.planId, edit.expected);
    if (!applied.ok) throw new Error(applied.error.message);
    const save = await documents.planSave({ kind: 'all' });
    if (!save.ok) throw new Error(save.error.message);
    const saved = await documents.save(save.value.planId);
    if (!saved.ok) throw new Error(saved.error.message);
  }
  preparing = false;
  const originalApply = documents.applyEdit.bind(documents), originalRead = services.read.bind(services);
  documents.applyEdit = async (...args) => {
    const result = await originalApply(...args);
    if (result.ok) { metrics.applies++; emit(); }
    return result;
  };
  services.read = async documents => {
    const result = await originalRead(documents);
    if (result.ok) {
      const source = result.value;
      metrics.projectDocument = source.projectDocumentId; metrics.projectDirty = source.projectDirty;
      metrics.sourceLanguage = source.project.languages.textDefault; metrics.defaultName = source.project.player.name?.defaultName ?? '';
      metrics.splashDuration = source.project.display.splashPlayback?.durationMs ?? null;
      metrics.clipHold = source.project.display.startupSequence?.clips[0]?.holdMs ?? null;
      metrics.reveal = source.project.display.startupSequence?.revealMs ?? null; emit();
    }
    return result;
  };
  emit();
  return fixture;
}
