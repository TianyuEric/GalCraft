import { ProjectSchema } from '@galcraft/contracts';
import { currentOrdinarySaveRefinementFixture } from './current-ordinary-save-refinement-fixture.js';

export async function settingsRefinementFixture(theme: 'light' | 'dark', changed: (metrics: Record<string, string>) => void) {
  const metrics: Record<string, string> = {};
  const emit = (next: Record<string, string>) => { Object.assign(metrics, next); changed({ ...metrics }); };
  const fixture = await currentOrdinarySaveRefinementFixture(theme, ordinary => emit({
    plans: String(ordinary.plans), saves: String(ordinary.saves), members: ordinary.members.join(','),
    projectDocument: ordinary.projectDocument, projectDirty: String(ordinary.projectDirty),
  }));
  const { documents } = fixture.services.bridge;
  const observeSavedProject = async () => {
    const listed = await documents.list();
    if (!listed.ok) throw new Error(listed.error.message);
    const raw = listed.value.find(document => 'project.json' in document.savedFiles)?.savedFiles['project.json'];
    if (!raw) throw new Error('Fixture project.json is unavailable');
    const saved = ProjectSchema.parse(JSON.parse(raw).data);
    emit({
      savedLanguage: saved.languages.textDefault,
      savedName: saved.player.name?.defaultName ?? '',
      savedClipHold: String(saved.display.startupSequence?.clips[0]?.holdMs ?? ''),
      savedReveal: String(saved.display.startupSequence?.revealMs ?? ''),
      savedHomeMusic: saved.display.titleMusic ?? '',
    });
  };
  await observeSavedProject();
  const save = documents.save.bind(documents);
  documents.save = async planId => {
    const result = await save(planId);
    if (result.ok) await observeSavedProject();
    return result;
  };
  return fixture;
}
