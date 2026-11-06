import { useEffect, useMemo, useRef, useState } from 'react';
import { NativeAnimationSchema, type Asset, type DocumentView, type FieldSpec, type Id, type Issue, type Json, type ResourceCapabilities } from '@galcraft/contracts';
import { applyTextEdits, CoreCommandSpecs } from '@galcraft/dsl';
import { prepareAuthoringEdit } from '@galcraft/documents/authoring';
import { initialAnimation } from '../../../authoring/animation-timeline.js';
import { commandName } from '../../../authoring/command-picker.js';
import { enumLabel, extendedFieldLabel } from '../../../authoring/field-help.js';
import { MiniStage } from '../../../authoring/mini-stage.js';
import { applyCommandOperation, candidateCommandFields, commandArgs, commandSource } from '../adapters/command-preview.js';
import { mountCandidateMiniStageControls } from '../components/CandidateMiniStage.js';
import { CandidateButton as Button, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateInput, CandidateSection, CandidateSelect, CandidateSourceStatus, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { CandidateAnimationWorkbench, type CandidateAnimationGuiDraft } from '../components/professional/CandidateAnimationWorkbench.js';
import { CandidateLeasedAudioLoopEditor, type CandidateAudioLoopGuiDraft } from '../components/professional/CandidateAudioLoopEditor.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { useAssetDockVisible, useCandidateAssetIndex } from './asset-workspace.js';
import { resultValue, workfaceError, type CandidateWorkfaceProps } from './workface-helpers.js';
import '../styles/assets.css';
import '../styles/commands.css';

const editFields: Record<string, string[]> = {
  changeBg: ['fit', 'positionX', 'positionY', 'effects', 'transition'],
  changeFigure: ['station', 'framing', 'portrait', 'effects', 'transition', 'model'],
  changeIllustration: ['illustrationFrame', 'effects', 'transition'],
  changeIllustrationDiff: ['transition'], characterDifference: ['transition'],
  pixi: ['type', 'enabled', 'density', 'speed', 'directionDeg', 'resourceId'],
  setTransform: ['effects', 'durationMs', 'easing'], setTransition: ['enter', 'exit'],
  setComplexAnimation: [], setTempAnimation: ['segments'],
  bgm: ['loop', 'volume', 'startSec', 'fadeInMs', 'fadeOutMs'],
  playEffect: ['loop', 'volume', 'startSec', 'fadeInMs', 'fadeOutMs'],
};
export const hasProfessionalCommandEditor = (command: string) => Object.hasOwn(editFields, command);
export const professionalCommandViewId = (sceneId: Id, statementId: Id) => ['professional', sceneId, statementId].join(':');
const locale = 'zh-CN';
type Args = Record<string, Json>;
type Draft = { baseline: number; original: Args; values: Args };
type Change = { field: string; op: 'set' | 'inherit'; value: Json };
type Preview = { documents: DocumentView[]; sequence: number; args: Args };
const emptyArgs: Args = {};
const equals = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function changesFor(original: Args, values: Args): Change[] {
  return [...new Set([...Object.keys(original), ...Object.keys(values)])].flatMap((field): Change[] => {
    if (equals(original[field], values[field])) return [];
    return values[field] === undefined ? [{ field, op: 'inherit', value: null }] : [{ field, op: 'set', value: values[field] }];
  });
}

export function CandidateCommandProfessionalView({ sceneId, statementId, onNavigate }: CandidateWorkfaceProps & { sceneId: Id; statementId: Id }) {
  const session = useCandidate();
  const { projectActive } = useCandidateState();
  const { services } = session;
  const scene = session.graphSceneSource(sceneId);
  const node = useMemo(() => scene && commandSource(scene).cst.find(item => item.id === statementId && item.valid), [scene?.revision, scene?.text, statementId]);
  const spec = CoreCommandSpecs.find(item => item.key === node?.command && hasProfessionalCommandEditor(item.key));
  const currentArgs = useMemo(() => node ? commandArgs(node.object?.value) : emptyArgs, [node]);
  const id = professionalCommandViewId(sceneId, statementId);
  const { byId } = useCandidateAssetIndex(session);
  const assets = useMemo(() => [...byId.values()], [byId]);
  const [draft, setDraft] = useState(() => session.viewState<Draft>(id));
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [buffered, setBuffered] = useState(false);
  const [resetKey, reset] = useState(0);
  const animationMemory = id + ':animation-fields', audioMemory = id + ':audio-fields';
  const captureAnimation = useMemo(() => (draft: CandidateAnimationGuiDraft) => session.rememberViewState(animationMemory, draft), [session, animationMemory]);
  const captureAudio = useMemo(() => (draft: CandidateAudioLoopGuiDraft) => session.rememberViewState(audioMemory, draft), [session, audioMemory]);
  const root = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const visible = useAssetDockVisible(root, projectActive);
  const readOnly = session.sourceReadOnly(sceneId);
  const stale = draft !== undefined && draft.baseline !== scene?.revision;
  const values = draft?.values ?? currentArgs;
  const changes = changesFor(draft?.original ?? currentArgs, values);
  const dirty = changes.length > 0 || invalid.length > 0 || buffered;
  const blocked = busy || readOnly || stale || invalid.length > 0 || buffered;
  const sourceAsset = typeof values.assetId === 'string' ? byId.get(values.assetId) : undefined;
  const [linked, setLinked] = useState<{ id: Id; animation: NonNullable<ReturnType<typeof NativeAnimationSchema.safeParse>['data']> }>();
  const linkedId = spec?.key === 'setComplexAnimation' && typeof values.resourceId === 'string' ? values.resourceId : undefined;
  const linkedAsset = linkedId ? byId.get(linkedId) : undefined;
  const sourceVariant = sourceAsset?.variants.find(item => item.id === sourceAsset.activeVariantId);
  const linkedVariant = linkedAsset?.activeVariantId;
  const animation = useMemo(() => NativeAnimationSchema.safeParse(values.animation).data ?? (linked?.id === linkedVariant ? linked?.animation : undefined) ?? initialAnimation(), [values.animation, linked, linkedVariant]);

  useEffect(() => {
    if (!visible || !linkedId || !linkedVariant || !services.runtimeAssets) return;
    const port = services.runtimeAssets;
    let live = true;
    void (async () => {
      const lease = resultValue(await port.resolveRuntime(linkedId, linkedVariant));
      try {
        const response = await fetch(lease.uri);
        if (!response.ok) throw new Error('无法读取指令引用的动画版本。');
        const animation = NativeAnimationSchema.parse(await response.json());
        if (live) setLinked({ id: linkedVariant, animation });
      } finally { await port.releaseRuntime(lease.leaseId); }
    })().catch(reason => { if (live) setError(workfaceError(reason)); });
    return () => { live = false; };
  }, [visible, linkedId, linkedVariant, services]);
  useEffect(() => { session.rememberViewState(id, draft); }, [session, id, draft]);
  useEffect(() => {
    session.setViewPending(id, dirty);
    return () => session.setViewPending(id, false);
  }, [session, id, dirty]);

  const loop = useMemo(() => ({
    loopStartSec: typeof values.loopStartSec === 'number' ? values.loopStartSec : null,
    loopEndSec: typeof values.loopEndSec === 'number' ? values.loopEndSec : null,
  }), [values.loopStartSec, values.loopEndSec]);

  function change(update: (args: Args) => Args) {
    if (!scene || readOnly || stale) return;
    setDraft(previous => {
      const before = previous ?? { baseline: scene.revision, original: currentArgs, values: currentArgs };
      const next = update(before.values);
      return equals(before.original, next) ? undefined : { ...before, values: next };
    });
    setError(''); setNotice('');
  }

  function documentPreview() {
    if (!scene || blocked) return;
    try {
      let documents = session.host.list();
      if (changes.length) {
        const edit = resultValue(prepareAuthoringEdit(documents.filter(item => !Object.keys(item.files).some(path => path.startsWith('candidate/'))), { op: 'commands.fields', sceneId, ids: [statementId], changes }, []));
        const patch = edit.patches.find(item => item.documentId === scene.documentId && item.kind === 'text');
        if (!patch || patch.kind !== 'text') throw new Error('没有可预览的指令变更。');
        const document = documents.find(item => item.documentId === scene.documentId)!;
        const path = Object.keys(document.files).find(item => item.endsWith('.gal'))!;
        const text = applyTextEdits(document.files[path]!, patch.edits.map(edit => ({ start: edit.start, end: edit.end, text: edit.after, oldText: edit.before })));
        documents = documents.map(item => item.documentId === document.documentId ? { ...item, files: { ...item.files, [path]: text } } : item);
      }
      setPreview(previous => ({ documents, sequence: (previous?.sequence ?? 0) + 1, args: values }));
      scroll.current?.scrollTo(0, 0); setError('');
    } catch (reason) { setError(workfaceError(reason)); }
  }

  async function apply() {
    if (!scene || blocked || !changes.length) return;
    setBusy(true); setError('');
    try {
      resultValue(await applyCommandOperation(session, scene, { op: 'commands.fields', sceneId, ids: [statementId], changes }, []));
      setDraft(undefined); setNotice('已写回原指令。作品历史可撤销或重做。');
    } catch (reason) { setError(workfaceError(reason)); }
    finally { setBusy(false); }
  }

  const selectedFields = spec ? candidateCommandFields(spec.key, spec.fields, sourceAsset?.kind ?? 'image')
    .filter(field => editFields[spec.key]!.includes(field.path)) : [];
  const clear = () => {
    session.rememberViewState(animationMemory, undefined); session.rememberViewState(audioMemory, undefined);
    setDraft(undefined); setBuffered(false); setInvalid([]); setError(''); setPreview(undefined); reset(key => key + 1);
  };
  return <section ref={root} className="candidate-workface candidate-command-professional" aria-label="指令专业编辑" onFocusCapture={() => {
    if (scene && session.getSnapshot().commandTarget !== scene.documentId) session.target(scene.documentId);
  }}>
    <CandidateSourceStatus label="固定指令来源" name={scene && spec ? scene.name + ' · ' + commandName(spec, locale) : '指令已失效'}
      mode={scene && spec ? 'fixed' : 'missing'} diagnostic={readOnly ? '当前场景原文有误。修复后可继续编辑。' : stale ? '指令版本已变化，草稿仍保留。' : undefined}
      locate={scene && onNavigate ? { label: '返回指令', run: () => { session.selectCommand(sceneId, statementId); onNavigate('commands:' + sceneId); } } : undefined}/>
    {!spec && <CandidateState kind="empty" title="原指令不再支持当前专业工作面"/>}
    {spec && <CandidateToolbar label="专业编辑操作" className="candidate-professional-actions">
      <Button disabled={blocked} onClick={documentPreview}>{dirty ? '预览草稿' : '预览当前指令'}</Button>
      <Button disabled={!dirty} onClick={clear}>放弃草稿</Button>
      <Button variant="primary" disabled={blocked || !changes.length} onClick={() => void apply()}>应用到原指令</Button>
    </CandidateToolbar>}
    {spec && <div className="candidate-professional-scroll" ref={scroll}>
      {error && <p role="alert" className="candidate-asset-note">{error}</p>}
      {notice && <p role="status" className="candidate-asset-note">{notice}</p>}
      {preview && <>
        {!equals(preview.args, values) && <p role="status" className="candidate-asset-note">正在显示上次预览。点击预览可查看当前参数。</p>}
        <ProfessionalStage preview={preview} active={visible} sceneId={sceneId} statementId={statementId}/>
      </>}
      {spec.key === 'setComplexAnimation' && <div className="candidate-professional-animation">
        {linkedVariant && linked?.id !== linkedVariant && !error ? <CandidateState kind="loading" title="正在读取原动画"/> :
          <CandidateAnimationWorkbench key={resetKey} animation={animation} targetLabel={scene!.name} locale={locale} active={visible}
            readonly={busy || readOnly || stale} statusLabel="关键帧在草稿中采样 · 应用后写回原指令" previewServices={services}
            guiDraft={session.viewState<CandidateAnimationGuiDraft>(animationMemory)} onGuiDraftChange={captureAnimation}
            onGenerate={request => session.tasks.openAnimationProduction(request, { documentId: scene!.documentId, statementId, viewId: id })}
            onDraftChange={setBuffered} onChange={async next => change(args => {
              const { resourceId: _resource, segments: _segments, ...keep } = args;
              return { ...keep, animation: next };
            })}/>}
      </div>}
      {sourceAsset?.kind === 'audio' && ['bgm', 'playEffect'].includes(spec.key) && <CandidateLeasedAudioLoopEditor key={sourceAsset.activeVariantId + ':' + resetKey} asset={sourceAsset}
        resources={services.runtimeAssets} value={loop} active={visible} readonly={busy || readOnly || stale} loop={values.loop !== false}
        loopLimitSec={sourceVariant?.metadata.durationSec} fallback={{ loopStartSec: typeof values.startSec === 'number' ? values.startSec : 0, loopEndSec: null }}
        guiDraft={session.viewState<CandidateAudioLoopGuiDraft>(audioMemory)} onGuiDraftChange={captureAudio}
        onDraftChange={setBuffered} onChange={async next => change(args => {
          const { loopStartSec: _start, loopEndSec: _end, ...keep } = args;
          return { ...keep, ...(next.loopStartSec === null ? {} : { loopStartSec: next.loopStartSec }), ...(next.loopEndSec === null ? {} : { loopEndSec: next.loopEndSec }) };
        })}/>}
      <CandidateFieldGroup title="演出参数" className="candidate-professional-fields" disabled={busy || readOnly || stale} key={String(scene?.revision) + ':' + resetKey}>
        {selectedFields.map(field => <ProfessionalField key={field.path} field={field} value={values[field.path]} assets={assets}
          capabilities={sourceVariant?.groupCapabilities} command={spec.key} path={field.path}
          invalid={(path, bad) => setInvalid(previous => bad ? [...new Set([...previous, path])] : previous.filter(item => item !== path))}
          change={value => change(args => {
            if (value !== undefined) return { ...args, [field.path]: value };
            const next = { ...args }; delete next[field.path]; return next;
          })}/>)}
      </CandidateFieldGroup>
    </div>}
  </section>;
}

function ProfessionalStage({ preview, active, sceneId, statementId }: { preview: Preview; active: boolean; sceneId: Id; statementId: Id }) {
  const { services } = useCandidate();
  const container = useRef<HTMLDivElement>(null), stage = useRef<MiniStage>(null);
  const current = useRef(preview); current.current = preview;
  const [issues, setIssues] = useState<Issue[]>([]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let live = true;
    const instance = new MiniStage({ ...services, compilePreview: services.compilePreview && (async () => {
      const input = current.current;
      const result = await services.compilePreview!(false, input.documents);
      if (live && current.current === input) setIssues(result.ok ? result.value.issues : result.issues);
      return result;
    }) });
    stage.current = instance;
    node.append(instance.root);
    const releaseControls = mountCandidateMiniStageControls(instance);
    return () => {
      live = false; stage.current = null; releaseControls(); instance.root.remove();
      queueMicrotask(() => instance.dispose());
    };
  }, [services]);
  useEffect(() => {
    setIssues([]);
    stage.current?.update(active ? String(preview.sequence) : 'hidden', active ? { sceneId, statementId } : null);
  }, [active, sceneId, statementId, preview]);
  return <section className="candidate-professional-stage" aria-label="草稿 Player 预览">
    <div ref={container}/>
    {issues.length > 0 && <ul>{issues.map((issue, index) => <li key={issue.code + index} role={issue.severity === 'error' ? 'alert' : undefined}>{issue.message}</li>)}</ul>}
  </section>;
}

type FieldProps = { field: FieldSpec; value: Json | undefined; assets: Asset[]; capabilities?: ResourceCapabilities | null; command: string;
  path: string; invalid(path: string, invalid: boolean): void; change(value: Json | undefined): void };

function ProfessionalField({ field, value, assets, capabilities, command, path, invalid, change }: FieldProps) {
  const label = extendedFieldLabel(field, locale, command);
  const shown = value ?? (field.path === 'framing' ? { mode: 'full', scale: 1, offsetX: 0, offsetY: 0, crop: null } : field.default);
  if (field.path === 'parameters' && path === 'model.parameters') {
    const parameters = commandArgs(shown);
    return capabilities?.parameters.length ? <CandidateSection className="candidate-professional-field-group" title="模型参数" collapsible initiallyOpen={false}>
      <CandidateFieldGroup>{capabilities.parameters.map(item => <ProfessionalNumber key={item.id} label={item.id}
        field={{ ...field, path: item.id, type: 'number', min: item.min, max: item.max }}
        shown={parameters[item.id] ?? item.default} path={path + '.' + item.id} invalid={invalid}
        change={next => {
          const result = { ...parameters };
          if (next === undefined) delete result[item.id]; else result[item.id] = next;
          change(result);
        }}/>)}</CandidateFieldGroup></CandidateSection> : <CandidateState kind="empty" title="当前版本未提供可验证的模型参数清单"/>;
  }
  if (field.type === 'object') {
    const children = field.children ?? [];
    if (!children.length) return null;
    const object = commandArgs(shown);
    return <CandidateSection className="candidate-professional-field-group" title={label} collapsible
      initiallyOpen={field.path === 'framing' || field.path === 'model' || field.path === 'effects' && command === 'setTransform'}>
      <CandidateFieldGroup>{children.map(child => <ProfessionalField key={child.path} field={child} value={object[child.path]} assets={assets}
        capabilities={capabilities} command={command} path={path + '.' + child.path} invalid={invalid}
        change={next => {
          const result = { ...object };
          if (next === undefined) delete result[child.path]; else result[child.path] = next;
          change(result);
        }}/>)}</CandidateFieldGroup>
    </CandidateSection>;
  }
  if (field.type === 'array') {
    const entries = Array.isArray(value) ? value : [];
    const item = field.item;
    if (!item || item.type !== 'object') return null;
    return <CandidateSection className="candidate-professional-field-group" title={label}>
      {entries.map((entry, index) => <ProfessionalField key={index} field={{ ...item, path: String(index + 1) }} value={entry} assets={assets} capabilities={capabilities} command={command} path={path + '.' + index} invalid={invalid}
        change={next => change(entries.map((existing, at) => at === index ? next ?? existing : existing))}/>)}
    </CandidateSection>;
  }
  if (field.type === 'boolean') return <CandidateField label={label} layout="row">
    <CandidateCheckbox checked={shown === true} onChange={event => change(event.target.checked)}/>
  </CandidateField>;
  if (field.type === 'number' || field.type === 'integer') return <ProfessionalNumber field={field} label={label} shown={shown} path={path} invalid={invalid} change={change}/>;
  if (field.type === 'enum') return <CandidateField label={label} layout="row">
    <CandidateSelect value={typeof shown === 'string' ? shown : ''} onValueChange={next => change(next || undefined)}>
      <option value="">沿用</option>{field.enumValues?.map(item => <option key={item} value={item}>{enumLabel(item, locale, command)}</option>)}
    </CandidateSelect>
  </CandidateField>;
  if (field.type === 'ref' && field.refKind === 'asset') {
    const kinds = command === 'pixi' && field.path === 'resourceId' ? ['texture', 'image'] : field.assetKinds;
    const matching = assets.filter(item => !kinds?.length || kinds.includes(item.kind));
    const chosen = typeof shown === 'string' ? shown : '';
    return <CandidateField label={label} layout="row">
      <CandidateSelect searchLabel="查找素材" value={chosen} onValueChange={next => change(next || undefined)}>
        <option value="">未指定</option>
        {chosen && !matching.some(item => item.id === chosen) && <option value={chosen}>原素材不可用</option>}
        {matching.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </CandidateSelect>
    </CandidateField>;
  }
  if (field.type === 'string') return <CandidateField label={label} layout="row"><CandidateInput value={typeof shown === 'string' ? shown : ''}
    onChange={event => change(event.target.value)}/></CandidateField>;
  return null;
}

function ProfessionalNumber({ field, label, shown, path, invalid, change }: Pick<FieldProps, 'field' | 'path' | 'invalid' | 'change'> & { label: string; shown: Json | undefined }) {
  const [text, setText] = useState<string>();
  const value = text ?? (typeof shown === 'number' ? String(shown) : '');
  const parsed = Number(value);
  const bad = value !== '' && (!Number.isFinite(parsed) || field.type === 'integer' && !Number.isInteger(parsed)
    || field.min !== undefined && parsed < field.min || field.max !== undefined && parsed > field.max
    || field.exclusiveMin !== undefined && parsed <= field.exclusiveMin);
  return <CandidateField label={label} layout="row" className="gc-candidate-command-short" unit={field.unit === 'none' ? undefined : field.unit === 'percent' ? '%' : field.unit === 'deg' ? '°' : field.unit} error={bad ? '数值超出允许范围。' : undefined}>
    <CandidateInput density="compact" inputMode="decimal" value={value} onBlur={() => { if (!bad) setText(undefined); }} onChange={event => {
      const value = event.target.value;
      const next = Number(value);
      const bad = value !== '' && (!Number.isFinite(next) || field.type === 'integer' && !Number.isInteger(next)
        || field.min !== undefined && next < field.min || field.max !== undefined && next > field.max
        || field.exclusiveMin !== undefined && next <= field.exclusiveMin);
      setText(value); invalid(path, bad);
      if (!bad) change(value === '' ? undefined : next);
    }}/>
  </CandidateField>;
}
