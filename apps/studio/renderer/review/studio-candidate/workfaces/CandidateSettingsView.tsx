import { useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { ProjectSchema, type Project, type StudioPreferences } from '@galcraft/contracts';
import type { StartupAssetField, StartupPreviewKind } from '../../../authoring/startup-editor.js';
import { openPlayerPreview } from '../../../authoring/player-preview.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateInput, CandidateSection, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { useDocumentVisibility } from './document-visibility.js';
import { CandidateProjectFields } from './settings-project.js';
import { CandidateLanguageFields } from './settings-languages.js';
import { CandidateNameFields } from './settings-player-name.js';
import { CandidateStartupFields } from './settings-startup.js';
import { pickWorkfaceAsset, resultValue, useFormalSource, useWorkfaceAssets, type CandidateWorkfaceProps } from './workface-helpers.js';
import '../styles/document-workfaces.css';
import '../styles/settings-editor.css';

const sections = { project: '作品资料', languages: '作品语言', 'player-name': '主角姓名', startup: '启动与主页' } as const;
type Section = keyof typeof sections;
type Display = Project['display'];
const displayAssetFields = ['splash', 'titleBackground', 'titleMusic', 'titleVideo'] as const;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function CandidateSettingsView({ onNavigate, personal }: CandidateWorkfaceProps & { personal?: boolean }) {
  return personal ? <CandidatePreferencesView/> : <CandidateProjectSettingsView onNavigate={onNavigate}/>;
}

function CandidatePreferencesView() {
  const store = useCandidate();
  useCandidateState();
  return <CandidatePreferenceFields value={store.controller.preferences} onChange={change => void store.updatePreferences(change)}/>;
}

export function CandidatePreferenceFields({ value, onChange }: { value: StudioPreferences; onChange(change: (preferences: StudioPreferences) => void): void }) {
  const editor = value.editor;
  const [fontSize, setFontSize] = useState<string>();
  const size = Number(fontSize);
  const invalidSize = fontSize !== undefined && (!Number.isInteger(size) || size < 10 || size > 36);
  return <section className="candidate-preference-fields" aria-label="工作台外观">
    <CandidateSection title="工作台主题">
      <CandidateToolbar label="工作台主题">
        <CandidateButton variant="outline" aria-pressed={value.theme === 'light'} onClick={() => onChange(next => { next.theme = 'light'; })}><Sun size={14}/>浅色</CandidateButton>
        <CandidateButton variant="outline" aria-pressed={value.theme === 'dark'} onClick={() => onChange(next => { next.theme = 'dark'; })}><Moon size={14}/>深色</CandidateButton>
      </CandidateToolbar>
    </CandidateSection>
    <CandidateSection title="编辑器">
      <CandidateField label="字号" unit="px" layout="row" className="candidate-settings-number" error={invalidSize ? '请输入 10～36 的整数。' : undefined}>
        <CandidateInput type="number" min={10} max={36} step={1} value={fontSize ?? String(editor.fontSize)} onChange={event => {
          const input = event.target.value, number = Number(input);
          setFontSize(input);
          if (Number.isInteger(number) && number >= 10 && number <= 36) onChange(next => { next.editor.fontSize = number; });
        }} onBlur={() => { if (!invalidSize) setFontSize(undefined); }}/>
      </CandidateField>
      <CandidateField label="字族" layout="row"><CandidateInput value={editor.fontFamily} onChange={event => onChange(next => { next.editor.fontFamily = event.target.value; })}/></CandidateField>
      <CandidateField label="自动换行" layout="row"><CandidateCheckbox checked={editor.wordWrap} onChange={event => onChange(next => { next.editor.wordWrap = event.target.checked; })}/></CandidateField>
      <p className="candidate-settings-hint">个人偏好立即保存，并应用到已打开的作品。默认文稿字号为 14 px。</p>
    </CandidateSection>
  </section>;
}

function CandidateProjectSettingsView({ onNavigate }: CandidateWorkfaceProps) {
  const { store, source, error } = useFormalSource();
  const { projectActive, activeView } = useCandidateState();
  const { assets, error: assetError } = useWorkfaceAssets(store.services, source?.assetIndexRevision);
  const root = useRef<HTMLElement>(null);
  const visible = useDocumentVisibility(root, projectActive && !!source);
  const [section, setSection] = useState<Section>(() => store.viewState<Section>('settings:section') ?? 'project');
  const sectionRequest = store.viewState<{ section: Section; serial: number }>('settings:sectionRequest');
  useEffect(() => { if (sectionRequest) setSection(sectionRequest.section); }, [sectionRequest?.serial]);
  useEffect(() => store.rememberViewState('settings:section', section), [store, section]);
  const documentId = source?.projectDocumentId;
  useEffect(() => {
    if (activeView === 'settings' && documentId && store.getSnapshot().commandTarget !== documentId) store.target(documentId);
  }, [activeView, documentId, store]);

  if (!source || !documentId) return <CandidateState kind={error ? 'error' : 'loading'} title={error || '正在读取作品设置…'}/>;
  const locale = store.controller.preferences.locale;
  const choose = (field: StartupAssetField, currentAssetId: string | null, preferredKind?: 'image' | 'video') => pickWorkfaceAsset(store.services, root.current, {
    projectId: source.project.projectId, locale, currentAssetId,
    allowedKinds: preferredKind ? [preferredKind] : field === 'splash' ? ['image', 'video'] : field === 'titleBackground' ? ['image'] : field === 'titleMusic' ? ['audio'] : ['video'],
  });
  const setDisplay = async (input: Display, baseline: Display): Promise<Display> => {
    const latest = resultValue(await store.services.read());
    const previous = latest.project.display;
    const next = { ...previous };
    for (const key of Object.keys(ProjectSchema.shape.display.shape) as (keyof Display)[]) {
      if (same(input[key], baseline[key])) continue;
      if (!same(previous[key], baseline[key]) && !same(previous[key], input[key])) throw new Error('启动或主页的同一项设置已变更。请还原输入后查看当前值。');
      Object.assign(next, { [key]: input[key] });
    }
    if (same(next, previous)) return previous;
    const picked = displayAssetFields.flatMap(key => next[key] && next[key] !== previous[key] ? [next[key]!] : []);
    resultValue(await store.applyEdit({ label: '修改启动与主页', origin: 'field', expected: [{ ref: { kind: 'document', id: latest.projectDocumentId }, revision: latest.projectRevision }],
      patches: [{ kind: 'json', documentId: latest.projectDocumentId, changes: [{ path: '/data/display', before: previous, after: next, op: 'set' }] }],
      preparedAssets: [], requiredRefs: picked.map(id => ({ kind: 'asset', id })) }));
    store.refreshFromHost();
    return next;
  };
  const preview = async (kind: StartupPreviewKind, host: HTMLElement, display: Display) => {
    if (!store.services.compilePreview) throw new Error('预览编译服务不可用。');
    const compiled = resultValue(await store.services.compilePreview());
    const sourceSnapshot = compiled.snapshot ?? compiled.lastValid;
    if (!sourceSnapshot) throw new Error('尚无有效预览快照。');
    const snapshot = structuredClone(sourceSnapshot); snapshot.project.display = structuredClone(display);
    const player = await openPlayerPreview(host, store.services, snapshot, 'sample', Object.assign({}, ...store.host.list().map(document => document.files)));
    const release = () => { player.view.stopStartupPreview(); player.dispose(); };
    try { await player.view.previewStartup(kind, display); return release; }
    catch (reason) { release(); throw reason; }
  };
  return <section ref={root} className="candidate-workface candidate-document-workface candidate-settings-workface" aria-label="作品设置">
    <CandidateToolbar className="candidate-settings-toolbar" label="作品设置分区">
      {(Object.keys(sections) as Section[]).map(id => <CandidateButton key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{sections[id]}</CandidateButton>)}
    </CandidateToolbar>
    {(error || assetError) && <p role="alert" className="candidate-workface-message">{error || assetError}</p>}
    {section === 'project' && <CandidateProjectFields store={store} source={source} assets={assets}/>}
    {section === 'languages' && <CandidateLanguageFields store={store} value={source.project.languages}/>}
    {section === 'player-name' && <CandidateNameFields store={store} source={source} openCharacters={() => onNavigate?.('character-directory')}/>}
    <div className="candidate-startup-slot" hidden={section !== 'startup'}>
      <CandidateStartupFields store={store} project={source.project} documentId={documentId} assets={assets} active={section === 'startup' && visible}
        chooseAsset={choose} commit={setDisplay} preview={preview}/>
    </div>
  </section>;
}
