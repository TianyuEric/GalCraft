import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Film, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { DialogueContentSchema, JsonSchema, NativeAnimationSchema, StageWeatherPresets, dialoguePlainText, dialogueSegments, replaceDialogueText, styleDialogueRange, type DialogueSegment, type Asset, type CommandSpec, type DocumentView, type FieldSpec, type Json, type Ref } from '@galcraft/contracts';
import { parseExpression, printExpression } from '@galcraft/dsl';
import type { AuthoringSource, SceneSource } from '../../../authoring/controller.js';
import { commandName } from '../../../authoring/command-picker.js';
import { enumLabel, extendedFieldLabel, fieldHint, initialFieldValue, ownsIdentity } from '../../../authoring/field-help.js';
import { commandFields, validateFields } from '../../../authoring/field-validation.js';
import { initialAnimation } from '../../../authoring/animation-timeline.js';
import { soundInstances } from '../../../authoring/sound-instances.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateSection, CandidateSelect, CandidateState, CandidateTextarea, CandidateToolbar } from '../components/controls/index.js';
import { CandidateAnimationWorkbench } from '../components/professional/CandidateAnimationWorkbench.js';
import { CandidateLeasedAudioLoopEditor } from '../components/professional/CandidateAudioLoopEditor.js';
import { pickWorkfaceAsset } from './workface-helpers.js';
import { useCandidate } from '../application/context.js';
import { candidateAssets } from '../application/services.js';
import { candidateCommandFields, commandArgs, commandSource, watchCommandVisibility } from '../adapters/command-preview.js';

const locale = 'zh-CN';
const animationFields = ['animation', 'segments', 'resourceId'];
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
type Changes = Array<{ field: string; op: 'set' | 'inherit'; value: Json }>;
type Props = {
  spec: CommandSpec; args: Record<string, Json>; kind: 'insert' | 'update'; scene: SceneSource; source: AuthoringSource;
  documents: readonly DocumentView[]; statementId: string | null; figureKind?: 'image' | 'live2d';
  position?: string; busy: boolean; readOnly: boolean; stale: boolean; onClose(): void; onApply(args: Record<string, Json>, changes: Changes, assetIds: string[]): Promise<void>;
};
type Reference = Ref & { name: string; sceneId?: string };
type FieldContext = {
  command: string; mode: Props['kind']; active: boolean; root: HTMLElement | null; source: AuthoringSource; scene: SceneSource; args: Record<string, Json>;
  assets: Asset[]; references: Reference[]; figureKind?: 'image' | 'live2d'; statementId?: string;
  session: ReturnType<typeof useCandidate>; chooseAsset(id: string): void; error(path: string, message: string): void;
};

export function initialCommandArgs(spec: CommandSpec): Record<string, Json> {
  const args: Record<string, Json> = Object.fromEntries(spec.fields.filter(field => field.default !== null).map(field => [field.path, structuredClone(field.default)]));
  const fade = { preset: 'fade', resourceId: null, durationMs: 400, easing: { family: 'linear', direction: 'in' }, direction: 'left' };
  if (spec.key === 'say') args.speaker = { kind: 'narrator' };
  if (spec.key === 'changeBg') args.transition = { enter: fade, exit: fade };
  if (spec.key === 'changeFigure') args.transition = {
    enter: { ...fade, durationMs: 200, easing: { family: 'cubic', direction: 'out' } },
    exit: { ...fade, durationMs: 160, easing: { family: 'cubic', direction: 'in' } },
  };
  if (['changeIllustrationDiff', 'characterDifference'].includes(spec.key)) args.transition = { ...fade, durationMs: 180 };
  return args;
}

function commandReferences(source: AuthoringSource, scene: SceneSource, assets: Asset[]): Reference[] {
  const dynamic = source.scenes.flatMap(item => commandSource(item).cst.flatMap((node, index): Reference[] => {
    if (!node.valid || !node.id) return [];
    const args = commandArgs(node.object?.value), name = `${item.name} · 第 ${index + 1} 条`;
    const refs: Reference[] = [{ kind: 'statement', id: node.id, name, sceneId: item.sceneId }];
    if (node.command === 'label' && typeof args.labelId === 'string') refs.push({ kind: 'label', id: args.labelId, name: String(args.name ?? name), sceneId: item.sceneId });
    if (typeof args.objectId === 'string' && ['changeBg', 'changeFigure', 'changeIllustration'].includes(node.command)) refs.push({ kind: 'object', id: args.objectId, name: assets.find(asset => asset.id === args.assetId)?.name ?? name, sceneId: item.sceneId });
    if (node.command === 'pixi' && typeof args.effectId === 'string') refs.push({ kind: 'effect', id: args.effectId, name: `${enumLabel(String(args.type ?? ''), locale, 'pixi')} · ${name}`, sceneId: item.sceneId });
    return refs;
  }));
  return [
    ...source.scenes.map(item => ({ kind: 'scene' as const, id: item.sceneId, name: item.name })),
    ...source.characters.map(item => ({ kind: 'character' as const, id: item.id, name: item.name })),
    ...(source.variables ?? []).filter(item => !item.declaringSceneId || item.declaringSceneId === scene.sceneId).map(item => ({ kind: 'variable' as const, id: item.id, name: item.name })),
    ...source.references ?? [], ...dynamic,
  ];
}

export function CandidateCommandFields({ spec, args, kind, scene, source, documents, statementId, figureKind, position, busy, readOnly, stale, onApply, onClose }: Props) {
  const session = useCandidate();
  const [values, setValues] = useState(args);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showValidation, setShowValidation] = useState(false);
  const [form, setForm] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(true);
  const assets = useMemo(() => candidateAssets(documents), [documents]);
  const references = useMemo(() => commandReferences(source, scene, assets), [source, scene, assets]);
  const chosen = useRef(new Set<string>());
  const editableFields = (draft: Record<string, Json>) => {
    const assetKind = assets.find(asset => asset.id === draft.assetId)?.kind ?? figureKind;
    return candidateCommandFields(spec.key, commandFields(spec.key, spec.fields, draft), assetKind)
      .filter(field => !ownsIdentity(spec.key, field.path, draft));
  };
  const visibleFields = editableFields(values);
  const label = (field: FieldSpec) => extendedFieldLabel(field, locale, spec.key);
  const validation = (draft: Record<string, Json>) => validateFields(editableFields(draft), draft, label, locale);
  const existing = kind === 'update' ? validation(args) : [];
  const issues = validation(values).filter(issue => !existing.some(item => item.path === issue.path && item.message === issue.message));
  const changes: Changes = [...new Set([...Object.keys(args), ...Object.keys(values)])].flatMap((field): Changes =>
    equal(args[field], values[field]) ? [] : values[field] === undefined
      ? [{ field, op: 'inherit', value: null }]
      : [{ field, op: 'set', value: values[field] }]);
  const change = (field: FieldSpec, value: Json | undefined) => setValues(previous => {
    const next = { ...previous };
    if (value === undefined) delete next[field.path];
    else next[field.path] = value;
    if (spec.key === 'setComplexAnimation' && value != null && animationFields.includes(field.path)) {
      for (const path of animationFields) if (path !== field.path) delete next[path];
    }
    return next;
  });
  const context: FieldContext = {
    command: spec.key, mode: kind, active, root: form, source, scene, args: values, assets, references, figureKind, statementId: statementId ?? undefined,
    session, chooseAsset: id => chosen.current.add(id), error: (path, message) => setErrors(previous => {
      if (previous[path] === message || !message && !previous[path]) return previous;
      const next = { ...previous }; if (message) next[path] = message; else delete next[path]; return next;
    }),
  };
  const showField = (field: FieldSpec) => <CommandField key={field.path} spec={field} value={values[field.path]} context={context}
    name={field.path} parent={values} change={value => change(field, value)}/>;
  const common = visibleFields.filter(field => field.required || field.group === 'basic');
  const advanced = visibleFields.filter(field => !common.includes(field));
  const disabled = busy || readOnly || stale;
  const audio = spec.key === 'bgm' || spec.key === 'playEffect' ? assets.find(asset => asset.id === values.assetId && asset.kind === 'audio') : undefined;
  const [audioOpen, setAudioOpen] = useState(false);
  const loopStartSec = typeof values.loopStartSec === 'number' ? values.loopStartSec : null;
  const loopEndSec = typeof values.loopEndSec === 'number' ? values.loopEndSec : null;
  const loop = useMemo(() => ({ loopStartSec, loopEndSec }), [loopStartSec, loopEndSec]);

  useEffect(() => {
    if (!form) return;
    const frame = requestAnimationFrame(() => {
      const first = [...form.querySelectorAll<HTMLElement>('.gc-candidate-command-field :is(.gc-candidate-input,.gc-candidate-command-asset > button)')].find(control => control.getClientRects().length);
      (first ?? form.querySelector<HTMLButtonElement>('footer button'))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [form]);
  useEffect(() => form ? watchCommandVisibility(form, setActive) : undefined, [form]);

  return <form ref={setForm} className="gc-candidate-command-form" aria-label={kind === 'insert' ? '待配置指令' : '编辑指令字段'} noValidate onSubmit={event => {
    event.preventDefault();
    setShowValidation(true);
    if (disabled || issues.length || Object.keys(errors).length || kind === 'update' && !changes.length) return;
    void onApply(values, changes, [...chosen.current]);
  }} onKeyDownCapture={event => {
    if (event.nativeEvent.isComposing && ['Enter', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
  }}>
    <header><strong>{commandName(spec, locale)}</strong><small>{kind === 'insert' ? `插入至${position ?? '场景末尾'}` : `编辑字段 · ${position}`}</small></header>
    <div className="gc-candidate-command-form-body">
    {stale && <p className="gc-candidate-command-error" role="alert">场景版本已变化。当前输入已保留，请核对后关闭并重新打开该指令。</p>}
    <CandidateFieldGroup disabled={disabled}>
      {spec.key === 'pixi' && <CommandWeatherPresets disabled={disabled || !session.services.weatherTexture} apply={async key => {
        const imported = await session.services.weatherTexture!(key);
        if (!imported.ok) throw new Error(imported.error.message);
        await session.refreshFromHost();
        const preset = StageWeatherPresets[key];
        chosen.current.add(imported.value.id);
        setValues(previous => ({ ...previous, type: key, resourceId: imported.value.id, target: previous.target ?? { kind: 'stage' },
          enabled: true, density: preset.density, speed: preset.speed, directionDeg: preset.directionDeg, parameters: preset.parameters }));
      }}/>}
      {common.map(showField)}
      {audio && <div className="gc-candidate-command-composite">
        <CandidateButton aria-expanded={audioOpen} onClick={() => setAudioOpen(open => !open)}>声音循环工作台<ChevronDown size={14}/></CandidateButton>
        {audioOpen && <CandidateLeasedAudioLoopEditor key={audio.activeVariantId} asset={audio} resources={session.services.runtimeAssets} active={active && audioOpen}
          value={loop} loop={typeof values.loop === 'boolean' ? values.loop : spec.key === 'bgm'} locale={locale} readonly={disabled}
          loopLimitSec={audio.variants.find(variant => variant.id === audio.activeVariantId)?.metadata.durationSec}
          fallback={{ loopStartSec: typeof values.startSec === 'number' ? values.startSec : 0, loopEndSec: null }}
          onChange={async next => setValues(previous => {
            const updated = { ...previous };
            for (const field of ['loopStartSec', 'loopEndSec'] as const) {
              if (next[field] === null) delete updated[field]; else updated[field] = next[field];
            }
            return updated;
          })}/>}
      </div>}
      {advanced.length > 0 && <CandidateSection className="gc-candidate-command-advanced" title="演出与高级参数" collapsible
        initiallyOpen={showValidation && issues.some(issue => advanced.some(field => issue.path.startsWith(field.path)))}>
        {advanced.map(showField)}
      </CandidateSection>}
    </CandidateFieldGroup>
    {showValidation && (issues.length > 0 || Object.keys(errors).length > 0) && <ul className="gc-candidate-command-error" role="alert">
      {[...issues, ...Object.entries(errors).map(([path, message]) => ({ path, message }))].map(issue => <li key={issue.path}>{issue.message}</li>)}
    </ul>}
    </div>
    <footer>
      <CandidateButton type="button" disabled={busy} onClick={onClose}>取消</CandidateButton>
      <CandidateButton type="submit" variant="primary" disabled={disabled || kind === 'update' && !changes.length}>{busy ? '正在应用…' : kind === 'insert' ? '插入' : '应用'}</CandidateButton>
    </footer>
  </form>;
}

function CommandWeatherPresets({ apply, disabled }: { apply(key: keyof typeof StageWeatherPresets): Promise<void>; disabled: boolean }) {
  const [pending, setPending] = useState<keyof typeof StageWeatherPresets | null>(null), [error, setError] = useState('');
  return <CandidateSection title="天气粒子预设" collapsible initiallyOpen={false}>
    <CandidateToolbar label="选择天气预设">{(Object.keys(StageWeatherPresets) as Array<keyof typeof StageWeatherPresets>).map(key =>
      <CandidateButton key={key} disabled={disabled || pending !== null} onClick={() => {
        setPending(key); setError('');
        void apply(key).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setPending(null));
      }}>{pending === key ? '正在应用…' : StageWeatherPresets[key].title[0]}</CandidateButton>)}</CandidateToolbar>
    <p className="gc-candidate-command-field-hint">填入纹理和运动参数，保留此特效的标识。</p>
    {error && <CandidateState kind="error" title={error}/>}
  </CandidateSection>;
}

function CommandField({ spec, name, value, parent, context, change }: {
  spec: FieldSpec; name: string; value: Json | undefined; parent: Record<string, Json>; context: FieldContext; change(value: Json | undefined): void;
}) {
  const id = useId(), label = extendedFieldLabel(spec, locale, context.command);
  const [timeline, setTimeline] = useState(false);
  const [assetProblem, setAssetProblem] = useState('');
  const defaultValue = spec.default;
  const actual = value === undefined ? spec.default : value;
  const assetKinds = context.command === 'changeFigure' && spec.path === 'assetId' && context.figureKind ? [context.figureKind] : spec.assetKinds;
  let control;

  if (context.command === 'say' && spec.path === 'text') {
    control = <DialogueField value={actual} change={change} id={id}/>;
  } else if (spec.type === 'boolean') {
    control = <CandidateSelect id={id} value={value == null ? '' : String(value)} onValueChange={next => change(next ? next === 'true' : undefined)}>
      <option value="">{typeof spec.default === 'boolean' ? `默认 · ${spec.default ? '启用' : '关闭'}` : '沿用默认'}</option><option value="true">启用</option><option value="false">关闭</option>
    </CandidateSelect>;
  } else if (spec.type === 'enum') {
    control = <CandidateSelect id={id} value={typeof actual === 'string' ? actual : ''} onValueChange={next => change(next || undefined)}>
      <option value="">选择{label}</option>
      {typeof actual === 'string' && !spec.enumValues?.includes(actual) && <option value={actual}>{actual}</option>}
      {spec.enumValues?.map(option => <option key={option} value={option}>{enumLabel(option, locale, context.command)}</option>)}
    </CandidateSelect>;
  } else if (spec.type === 'ref' && spec.refKind === 'asset') {
    const chosen = context.assets.find(asset => asset.id === value);
    control = <div className="gc-candidate-command-asset">
      <CandidateButton type="button" id={id} aria-label={chosen ? `更换${label} · ${chosen.name}` : `选择${label}`} onClick={event => {
        const trigger = event.currentTarget, scope = context.root;
        setAssetProblem('');
        if (!scope) return;
        void (async () => {
          const catalog = !assetKinds?.length ? await context.session.services.assetTypeCatalog?.() : undefined;
          const kinds = assetKinds?.length ? [...assetKinds] : catalog?.ok ? catalog.value.map(item => item.descriptor.key) : [...new Set(context.assets.map(asset => asset.kind))];
          if (!scope.isConnected) return;
          const selected = await pickWorkfaceAsset(context.session.services, scope, {
            projectId: context.source.project.projectId, sceneId: context.scene.sceneId,
            characterId: typeof context.args.characterId === 'string' ? context.args.characterId : null,
            allowedKinds: kinds, currentAssetId: typeof value === 'string' ? value : null, currentName: chosen?.name,
            purpose: label, locale, returnFocus: trigger,
          });
          if (selected && scope.isConnected) { context.chooseAsset(selected); change(selected); }
        })().catch(cause => setAssetProblem(cause instanceof Error ? cause.message : String(cause)));
      }}><FolderOpen size={16}/>{chosen?.name ?? (value ? '更换素材' : '选择素材')}</CandidateButton>
      <CandidateSection title="素材引用 ID" collapsible initiallyOpen={false}><CandidateInput aria-label={`${label}引用 ID`} value={typeof value === 'string' ? value : ''} onChange={event => change(event.target.value || undefined)}/></CandidateSection>
      {assetProblem && <p role="alert" className="gc-candidate-command-error">{assetProblem}</p>}
    </div>;
  } else if (spec.type === 'ref') {
    const sceneId = typeof parent.sceneId === 'string' ? parent.sceneId : context.scene.sceneId;
    const options = spec.path === 'soundId' && context.command === 'playEffect'
      ? soundInstances(context.source.scenes, context.scene.sceneId, context.statementId, context.assets).map(item => ({ id: item.id, name: `${item.name} · ${item.source}` }))
      : context.references.filter(item => item.kind === spec.refKind && (item.kind !== 'label' || item.sceneId === sceneId));
    const unique = [...new Map(options.map(option => [option.id, option])).values()];
    if (spec.path === 'differenceId' && ['changeFigure', 'characterDifference'].includes(context.command)) {
      unique.splice(0, unique.length, ...context.source.characters.find(item => item.id === context.args.characterId)?.differences ?? []);
    }
    control = <div className="gc-candidate-command-ref">
      {unique.length > 0 && <CandidateSelect searchLabel={`查找${label}`} id={id} value={typeof value === 'string' ? value : ''} onValueChange={next => change(next || undefined)}>
        <option value="">选择{label}</option>{typeof value === 'string' && !unique.some(item => item.id === value) && <option value={value}>现有引用</option>}
        {unique.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </CandidateSelect>}
      {unique.length ? <CandidateSection title="引用 ID" collapsible initiallyOpen={false}><CandidateInput aria-label={`${label}引用 ID`} value={String(value ?? '')} onChange={event => change(event.target.value || undefined)}/></CandidateSection>
        : <CandidateInput id={id} value={String(value ?? '')} placeholder="填写已有引用 ID" onChange={event => change(event.target.value || undefined)}/>}
    </div>;
  } else if (spec.type === 'object' && spec.children?.length) {
    const child = commandArgs(actual);
    const children = spec.path === 'speaker' ? spec.children.filter(item => item.path !== 'id' || child.kind === 'character') : spec.children;
    control = <CandidateSection className="gc-candidate-command-composite" title={label} collapsible initiallyOpen={spec.required === true}>
      {children.map(item => <CommandField key={item.path} spec={item} name={`${name}.${item.path}`} value={child[item.path]} parent={child} context={context} change={next => {
        const updated = { ...child };
        if (next === undefined) delete updated[item.path]; else updated[item.path] = next;
        if (spec.path === 'speaker' && item.path === 'kind' && next !== 'character') delete updated.id;
        change(updated);
      }}/>)}
    </CandidateSection>;
  } else if (spec.type === 'array' && spec.item) {
    const items = Array.isArray(actual) ? actual : [];
    const item = spec.item;
    control = <CandidateSection className="gc-candidate-command-composite" title={`${label} · ${items.length} 项`} collapsible initiallyOpen={spec.required === true}>
      {items.map((entry, index) => <div key={String(commandArgs(entry).id ?? index)} className="gc-candidate-command-array-item">
        <CommandField spec={item} name={`${name}.${index}`} value={entry} parent={parent} context={context}
          change={next => change(items.map((previous, at) => at === index ? next ?? null : previous))}/>
        <CandidateIconButton label={`移除第 ${index + 1} 项`} onClick={() => change(items.filter((_, at) => at !== index))}><Trash2 size={15}/></CandidateIconButton>
      </div>)}
      <CandidateButton type="button" onClick={() => change([...items, (initialFieldValue(item) ?? (item.type === 'string' ? '' : null)) as Json])}><Plus size={15}/>添加一项</CandidateButton>
    </CandidateSection>;
  } else if (spec.path === 'animation' && spec.type === 'object') {
    const animation = NativeAnimationSchema.safeParse(actual).data;
    control = <div>
      <CandidateButton id={id} type="button" aria-expanded={timeline} onClick={() => setTimeline(value => !value)}><Film size={16}/>动画时间轴<ChevronDown size={14}/></CandidateButton>
      {timeline && <CandidateAnimationWorkbench animation={animation ?? initialAnimation()} targetLabel={enumLabel(String(commandArgs(context.args.target).kind ?? 'stage'), locale)}
        active={context.active} locale={locale} onChange={async next => change(next as unknown as Json)}/>}
      <CandidateSection title="动画数据" collapsible initiallyOpen={false}><TextValue spec={spec} name={name} value={value} context={context} change={change} id={`${id}-animation`}/></CandidateSection>
    </div>;
  } else {
    control = <TextValue spec={spec} name={name} value={value} context={context} change={change} id={id}/>;
  }
  const isComposite = spec.type === 'object' && spec.children?.length || spec.type === 'array' && spec.item;
  return <div className="gc-candidate-command-field" data-command-field={name}>
    {isComposite ? control : <CandidateField id={id} label={spec.required ? <>{label} <small>必填</small></> : label}
      className={['number', 'integer'].includes(spec.type) ? 'gc-candidate-command-short' : undefined}
      layout={['number', 'integer', 'enum', 'boolean'].includes(spec.type) ? 'row' : 'stack'}
      unit={spec.unit === 'none' ? undefined : spec.unit === 'percent' ? '%' : spec.unit === 'deg' ? '°' : spec.unit}
      hint={spec.path === 'value' && context.command === 'return' ? fieldHint(spec, label, locale, context.command) : undefined}>
      {() => control}
    </CandidateField>}
    <div className="gc-candidate-command-value-actions">
    {spec.nullable && value !== null && spec.type !== 'array' &&
      <CandidateButton type="button" className="gc-candidate-command-inherit" onClick={() => { context.error(name, ''); change(null); }}>设为空值</CandidateButton>}
    {!spec.required && value !== undefined && (context.mode === 'update' || !equal(value, spec.default)) &&
      <CandidateButton type="button" className="gc-candidate-command-inherit" onClick={() => { context.error(name, ''); change(undefined); }}>沿用默认</CandidateButton>}
    {value === undefined && spec.type === 'object' && !spec.children?.length && defaultValue !== null && defaultValue !== undefined &&
      <CandidateButton type="button" onClick={() => change(defaultValue)}>填入默认值</CandidateButton>}
    </div>
  </div>;
}

function DialogueField({ value, change, id }: { value: Json | undefined; change(value: Json): void; id: string }) {
  const [content, setContent] = useState(() => DialogueContentSchema.safeParse(value).data ?? '');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [ruby, setRuby] = useState(''), [color, setColor] = useState('#ffffff'), [size, setSize] = useState('');
  const [bold, setBold] = useState(false), [italic, setItalic] = useState(false), [error, setError] = useState('');
  const text = useRef<HTMLTextAreaElement>(null), plain = dialoguePlainText(content);
  const update = (next: typeof content) => { setContent(next); change(next); };
  const capture = (element: HTMLTextAreaElement) => setSelection({ start: element.selectionStart, end: element.selectionEnd });
  function applyStyle(style: Omit<Partial<DialogueSegment>, 'text'>) {
    if (selection.start === selection.end) { setError('请先在正文中选择片段。'); text.current?.focus(); return; }
    const next = DialogueContentSchema.safeParse(styleDialogueRange(content, selection.start, selection.end, style));
    if (!next.success) { setError('请填写有效的字号与样式。'); return; }
    setError(''); update(next.data);
  }
  return <div className="gc-candidate-command-dialogue">
    <CandidateTextarea id={id} ref={text} aria-label="正文与片段选择" rows={5} value={plain} onSelect={event => capture(event.currentTarget)}
      onChange={event => { capture(event.currentTarget); update(replaceDialogueText(content, event.currentTarget.value)); }}/>
    <CandidateSection title="片段样式" collapsible initiallyOpen={false}>
      <p className="gc-candidate-command-field-hint">{selection.start < selection.end ? plain.slice(selection.start, selection.end) : '在正文中选取片段，再设置注音或样式。'}</p>
      <CandidateFieldGroup className="gc-candidate-command-dialogue-fields">
        <CandidateField label="注音"><CandidateInput density="compact" value={ruby} onChange={event => setRuby(event.currentTarget.value)}/></CandidateField>
        <CandidateField label="片段颜色"><CandidateInput density="compact" type="color" value={color} onChange={event => setColor(event.currentTarget.value)}/></CandidateField>
        <CandidateField label="片段字号"><CandidateInput density="compact" type="number" min={1} placeholder="模板默认" value={size} onChange={event => setSize(event.currentTarget.value)}/></CandidateField>
      </CandidateFieldGroup>
      <CandidateToolbar label="片段字形">
        <label><CandidateCheckbox checked={bold} onChange={event => setBold(event.currentTarget.checked)}/>粗体</label>
        <label><CandidateCheckbox checked={italic} onChange={event => setItalic(event.currentTarget.checked)}/>斜体</label>
      </CandidateToolbar>
      <CandidateToolbar label="片段样式操作">
        <CandidateButton variant="secondary" onClick={() => applyStyle({ ruby: ruby || undefined, color, fontSize: size ? Number(size) : undefined, bold, italic })}>应用到所选片段</CandidateButton>
        <CandidateButton onClick={() => applyStyle({ ruby: undefined, color: undefined, fontSize: undefined, bold: undefined, italic: undefined })}>恢复片段默认</CandidateButton>
      </CandidateToolbar>
      {error && <CandidateState kind="error" title={error}/>}
      <p className="gc-candidate-command-dialogue-preview" aria-label="文字样式预览">{dialogueSegments(content).map((segment, index) =>
        <span key={index} style={{ color: segment.color, fontSize: segment.fontSize, fontWeight: segment.bold ? 700 : undefined, fontStyle: segment.italic ? 'italic' : undefined }}>
          {segment.ruby ? <ruby>{segment.text}<rt>{segment.ruby}</rt></ruby> : segment.text}
        </span>)}</p>
    </CandidateSection>
  </div>;
}

function TextValue({ spec, name, value, context, change, id }: {
  spec: FieldSpec; name: string; value: Json | undefined; context: FieldContext; change(value: Json | undefined): void; id: string;
}) {
  const kind = spec.type;
  const format = (data: Json | undefined) => data == null ? '' : kind === 'expression' && typeof data === 'object'
    ? printExpression(data as Parameters<typeof printExpression>[0]) : typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
  const stored = format(value);
  const [text, setText] = useState(stored);
  const [invalid, setInvalid] = useState('');
  const lastEmitted = useRef(stored), composing = useRef(false), report = useRef(context.error);
  report.current = context.error;
  useEffect(() => {
    if (stored === lastEmitted.current) return;
    lastEmitted.current = stored; setText(stored); setInvalid(''); report.current(name, '');
  }, [stored, name]);
  useEffect(() => () => { report.current(name, ''); }, [name]);
  function update(raw: string) {
    if (composing.current) return;
    let next: Json | undefined, error = '';
    if (raw === '') next = undefined;
    else if (kind === 'number' || kind === 'integer') {
      const number = Number(raw);
      if (!Number.isFinite(number) || kind === 'integer' && !Number.isSafeInteger(number)) error = '请输入有效数字。';
      else next = number;
    } else if (kind === 'expression') {
      const parsed = parseExpression(raw);
      if (parsed.ok) next = parsed.expr as Json;
      else error = parsed.message;
    } else if (kind === 'object' || kind === 'array') {
      try {
        const json = JsonSchema.parse(JSON.parse(raw));
        if (kind === 'array' ? !Array.isArray(json) : !json || typeof json !== 'object' || Array.isArray(json)) throw new Error();
        next = json;
      } catch { error = kind === 'array' ? '请输入有效的 JSON 数组。' : '请输入有效的 JSON 对象。'; }
    } else next = raw;
    setInvalid(error);
    context.error(name, error);
    if (!error) { lastEmitted.current = format(next); change(next); }
  }
  const control = {
    id, value: text, placeholder: spec.default == null ? undefined : format(spec.default),
    'aria-invalid': Boolean(invalid), 'aria-describedby': invalid ? `${id}-error` : undefined,
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => { composing.current = false; update(event.currentTarget.value); },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setText(event.target.value); update(event.target.value); },
  };
  return <>{['object', 'array'].includes(kind) ? <CandidateTextarea {...control} rows={4} spellCheck={false}/> :
    <CandidateInput {...control} density="compact" inputMode={kind === 'number' || kind === 'integer' ? 'decimal' : undefined}/>}
    {invalid && <small id={`${id}-error`} className="gc-candidate-command-error">{invalid}</small>}
  </>;
}
