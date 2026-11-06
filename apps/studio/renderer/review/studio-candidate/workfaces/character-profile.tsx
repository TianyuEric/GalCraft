import { createId, type AfterstoryEntry, type Asset, type Character, type FieldSpec, type Id, type Json } from '@galcraft/contracts';
import { CoreCommandSpecs, parse } from '@galcraft/dsl';
import { BookOpen, Play, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { parseColorString, rgbToHex } from '../../../components/editor-fields/vendor/dice-color-picker.js';
import type { AuthoringSource } from '../../../authoring/controller.js';
import { endingOptions, neutralCharacter, type CharacterDraft } from '../../../authoring/characters/model.js';
import { enumLabel, extendedFieldLabel } from '../../../authoring/field-help.js';
import { CandidateButton, CandidateCheckbox, CandidateColorField, CandidateField, CandidateFieldGroup, CandidateInput, CandidateSection, CandidateSelect, CandidateTextarea, CandidateToolbar } from '../components/controls/index.js';
import { CharacterNumber, useClearCharacterNumbers } from './character-number.js';

export type CharacterFieldsProps = {
  current: CharacterDraft;
  disabled: boolean;
  change(patch: Partial<CharacterDraft>): void;
};

const roles = { viewpoint: '玩家视角', main: '主角色', supporting: '配角', character: '未分类' } as const;
const effectsFields = CoreCommandSpecs.find(spec => spec.key === 'changeFigure')!.fields.find(field => field.path === 'effects')!.children!;
const commonEffects = new Set(['x', 'y', 'scaleX', 'scaleY', 'opacity', 'z']);

export function CharacterProfile({ current, assets, locale, disabled, change }: CharacterFieldsProps & { assets: Asset[]; locale: string }) {
  const appearance = current.appearance ?? { notes: '', referenceAssets: [] };
  const groups = current.groups ?? [];
  const effects = current.defaultEffects ?? neutralCharacter(current.id, current.name).defaultEffects;
  const updateEffect = (path: string[], value: Json) => {
    const next = structuredClone(effects) as unknown as Record<string, unknown>;
    let target = next, specs = effectsFields;
    for (const key of path.slice(0, -1)) {
      specs = specs.find(spec => spec.path === key)?.children ?? [];
      target[key] ??= Object.fromEntries(specs.map(child => [child.path, structuredClone(child.default)]));
      target = target[key] as Record<string, unknown>;
    }
    target[path.at(-1)!] = value;
    change({ defaultEffects: next as Character['defaultEffects'] });
  };
  const fields = (specs: FieldSpec[], prefix: string[] = []): ReactNode => specs.filter(spec => spec.path !== 'station').map(spec => {
    const path = [...prefix, spec.path], key = path.join('.'), label = extendedFieldLabel(spec, locale);
    const currentValue = path.reduce<unknown>((value, part) => (value as Record<string, unknown> | null)?.[part], effects);
    if (spec.type === 'object') return <CandidateFieldGroup key={key} title={label}><div className="candidate-character-inline">{fields(spec.children ?? [], path)}</div></CandidateFieldGroup>;
    if (spec.type === 'boolean') return <label key={key} className="candidate-character-check"><CandidateCheckbox checked={currentValue === true} disabled={disabled} onChange={event => updateEffect(path, event.target.checked)}/>{label}</label>;
    if (spec.type === 'enum') return <CandidateField key={key} label={label}><CandidateSelect value={String(currentValue ?? spec.default)} disabled={disabled} onValueChange={value => updateEffect(path, value)}>
      {(spec.enumValues ?? []).map(value => <option key={value} value={value}>{enumLabel(spec.path, value, locale)}</option>)}
    </CandidateSelect></CandidateField>;
    if (spec.type === 'number' || spec.type === 'integer') return <CharacterNumber key={key} field={'effect/' + key} label={label} value={typeof currentValue === 'number' ? currentValue : Number(spec.default ?? 0)}
      min={spec.min} max={spec.max} integer={spec.type === 'integer'} unit={spec.unit === 'px' ? 'px' : spec.unit === 'deg' ? '°' : undefined} disabled={disabled} change={value => updateEffect(path, value)}/>;
    if (spec.path === 'rgb') return <CharacterTint key={key} label={label} value={currentValue} locale={locale} disabled={disabled} change={value => updateEffect(path, value)}/>;
    return null;
  });
  return <>
    <CandidateSection title="基本资料">
      <div className="candidate-character-inline">
        <CandidateField label="角色名称"><CandidateInput value={current.name} disabled={disabled} required onChange={event => change({ name: event.target.value })}/></CandidateField>
        <CandidateField label="全局身份"><CandidateSelect value={current.narrativeRole} disabled={disabled} onValueChange={value => {
          const role = value as Character['narrativeRole'];
          change({ narrativeRole: role, personalRoute: role === 'main' ? current.personalRoute ?? { sceneIds: [], endingIds: [] } : undefined });
        }}>
          {current.narrativeRole === 'character' && <option value="character" disabled>未分类</option>}
          {(['viewpoint', 'main', 'supporting'] as const).map(role => <option key={role} value={role}>{roles[role]}</option>)}
        </CandidateSelect></CandidateField>
      </div>
      {current.narrativeRole === 'character' && <p role="status" className="candidate-character-hint">旧作品的角色尚未分类。请选择全局身份。</p>}
      <CandidateField label="角色简介与创作设定" className="candidate-character-long" hint="角色与当前场景相关时，AI 创作会参考这份资料。">
        <CandidateTextarea value={current.description} disabled={disabled} rows={3} onChange={event => change({ description: event.target.value })}/>
      </CandidateField>
      <CandidateField label="外观说明" className="candidate-character-long"><CandidateTextarea value={appearance.notes} disabled={disabled} rows={2}
        onChange={event => change({ appearance: { ...appearance, notes: event.target.value } })}/></CandidateField>
    </CandidateSection>
    <CandidateSection title="人设参考图" collapsible initiallyOpen={!!appearance.referenceAssets.length}>
      <p className="candidate-character-hint">参考图会用于相关制作的默认输入。</p>
      {appearance.referenceAssets.map(id => <div key={id} className="candidate-character-pair">
        <span>{assets.find(asset => asset.id === id)?.name ?? '参考图片缺失 · ' + id}</span>
        <CandidateButton disabled={disabled} onClick={() => change({ appearance: { ...appearance, referenceAssets: appearance.referenceAssets.filter(value => value !== id) } })}>解除关联</CandidateButton>
      </div>)}
      <CandidateField label="添加参考图"><CandidateSelect value="" disabled={disabled} onValueChange={id => { if (id) change({ appearance: { ...appearance, referenceAssets: [...appearance.referenceAssets, id] } }); }}>
        <option value="">选择作品图片</option>
        {assets.filter(asset => asset.kind === 'image' && !appearance.referenceAssets.includes(asset.id)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
      </CandidateSelect></CandidateField>
    </CandidateSection>
    <CandidateSection title="命名素材组" collapsible initiallyOpen={false}>
      {groups.map(group => <CandidateFieldGroup key={group.id} title={group.name || '未命名素材组'}>
        <CandidateField label="素材组名称"><CandidateInput value={group.name} disabled={disabled} onChange={event => change({ groups: groups.map(item => item.id === group.id ? { ...item, name: event.target.value } : item) })}/></CandidateField>
        <div className="candidate-character-checks">
          {assets.filter(asset => asset.kind === 'image' || asset.kind === 'live2d').map(asset => <label key={asset.id} className="candidate-character-check">
            <CandidateCheckbox checked={group.assetIds.includes(asset.id)} disabled={disabled} onChange={event => change({ groups: groups.map(item => item.id === group.id
              ? { ...item, assetIds: event.target.checked ? [...item.assetIds, asset.id] : item.assetIds.filter(id => id !== asset.id) } : item) })}/>{asset.name}
          </label>)}
        </div>
        <CandidateButton disabled={disabled} onClick={() => change({ groups: groups.filter(item => item.id !== group.id) })}>移除素材组</CandidateButton>
      </CandidateFieldGroup>)}
      <CandidateButton disabled={disabled} onClick={() => change({ groups: [...groups, { id: createId([current, groups]), name: '新素材组', assetIds: [] }] })}><Plus size={14}/>新增素材组</CandidateButton>
    </CandidateSection>
    <CandidateSection title="每次出场的默认效果" collapsible initiallyOpen={false}>
      <p className="candidate-character-hint">出场继承这些效果。指令里填写的值优先。</p>
      <div className="candidate-character-inline">{fields(effectsFields.filter(field => commonEffects.has(field.path)))}</div>
      <CandidateSection title="高级视觉效果" collapsible initiallyOpen={false}>
        <div className="candidate-character-inline">{fields(effectsFields.filter(field => !commonEffects.has(field.path)))}</div>
      </CandidateSection>
    </CandidateSection>
  </>;
}

function CharacterTint({ label, value, locale, disabled, change }: { label: string; value: unknown; locale: string; disabled: boolean; change(value: number[]): void }) {
  const [enabled, setEnabled] = useState(Array.isArray(value));
  const [remembered, setRemembered] = useState<number[]>([255, 255, 255]);
  const rgb = Array.isArray(value) ? value.map(Number) : remembered;
  const update = (hex: string) => {
    const parsed = parseColorString(hex);
    if (parsed) change([Math.round(parsed.r), Math.round(parsed.g), Math.round(parsed.b)]);
  };
  return <CandidateFieldGroup title={label}>
    <label className="candidate-character-check"><CandidateCheckbox checked={enabled} disabled={disabled} onChange={event => {
      setEnabled(event.target.checked);
      if (event.target.checked) change(remembered);
      else { setRemembered(rgb); change([255, 255, 255]); }
    }}/>启用颜色叠加</label>
    <CandidateColorField label="编辑颜色叠加" locale={locale} value={rgbToHex({ r: rgb[0] ?? 255, g: rgb[1] ?? 255, b: rgb[2] ?? 255, a: 1 })}
      allowAlpha={false} disabled={disabled || !enabled} onPreview={update} onCommit={update} onSession={() => {}}/>
    <CandidateButton disabled={disabled || !enabled} onClick={() => update('#ffffff')}>重置</CandidateButton>
  </CandidateFieldGroup>;
}
export function CharacterRoute({ current, source, disabled, change, previewScene }: CharacterFieldsProps & { source: AuthoringSource; previewScene(id: Id): void }) {
  if (current.narrativeRole !== 'main') return <CandidateSection title="个人路线"><p>主角色可以配置个人路线、结局与后日谈。可在资料中设置全局身份。</p></CandidateSection>;
  const scenes = current.personalRoute?.sceneIds ?? [];
  const endingIds = current.personalRoute?.endingIds ?? [];
  const endings = endingOptions(source);
  const missingScenes = scenes.filter(id => !source.scenes.some(scene => scene.sceneId === id));
  const missingEndings = endingIds.filter(id => !endings.some(ending => ending.id === id));
  const toggle = (items: string[], id: string, checked: boolean) => checked ? [...items, id] : items.filter(item => item !== id);
  const sceneCheck = (id: string, name: string) => <label key={id} className="candidate-character-check">
    <CandidateCheckbox checked={scenes.includes(id)} disabled={disabled} onChange={event => change({ personalRoute: { sceneIds: toggle(scenes, id, event.target.checked), endingIds } })}/>{name}
  </label>;
  const endingCheck = (id: string, name: string, detail?: string) => <label key={id} className="candidate-character-check">
    <CandidateCheckbox checked={endingIds.includes(id)} disabled={disabled} onChange={event => change({ personalRoute: { sceneIds: scenes, endingIds: toggle(endingIds, id, event.target.checked) } })}/>
    <span>{name}{detail && <small>{detail}</small>}</span>
  </label>;
  return <>
    <CandidateSection title="路线范围">
      {(!scenes.length || !endingIds.length || !!missingScenes.length || !!missingEndings.length) && <p role="status" className="candidate-character-hint">路线配置还不完整。可先应用，稍后补充场景和结局。</p>}
      <div className="candidate-character-columns">
        <CandidateFieldGroup title="路线场景"><div className="candidate-character-checks">
          {source.scenes.map(scene => sceneCheck(scene.sceneId, scene.name))}
          {missingScenes.map(id => sceneCheck(id, '已失效的场景 · ' + id))}
          {!source.scenes.length && <p className="candidate-character-hint">先在创作页添加场景。</p>}
        </div></CandidateFieldGroup>
        <CandidateFieldGroup title="个人线结局"><div className="candidate-character-checks">
          {endings.map(ending => endingCheck(ending.id, ending.id, ending.scenes.join(' · ')))}
          {missingEndings.map(id => endingCheck(id, '未找到的结局 · ' + id))}
          {!endings.length && <p className="candidate-character-hint">为场景添加「结束」指令和结局标识。</p>}
        </div></CandidateFieldGroup>
      </div>
    </CandidateSection>
    <CharacterAfterstory current={current} source={source} disabled={disabled} change={change} previewScene={previewScene}/>
  </>;
}

function CharacterAfterstory({ current, source, disabled, change, previewScene }: CharacterFieldsProps & { source: AuthoringSource; previewScene(id: Id): void }) {
  const clearNumbers = useClearCharacterNumbers();
  const value = current.afterstory;
  const scenes = source.scenes, endingIds = current.personalRoute?.endingIds ?? [];
  const scene = scenes.find(item => item.sceneId === value?.entry.sceneId);
  const labels = scene ? parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst.flatMap(node => {
    const args = node.object?.value as { labelId?: string; name?: string } | undefined;
    return node.command === 'label' && args?.labelId ? [{ id: args.labelId, name: args.name || args.labelId }] : [];
  }) : [];
  const update = (patch: Partial<AfterstoryEntry>) => { if (value) change({ afterstory: { ...value, ...patch } }); };
  return <CandidateSection title="普通后日谈">
    <p className="candidate-character-hint">每位主角色可配置一个入口，使用现有场景。进度独立保存，结束后返回主菜单。</p>
    {!value ? <CandidateToolbar label="后日谈入口">
      <CandidateButton variant="outline" disabled={disabled} disabledReason={!scenes.length || !endingIds.length ? '先添加场景并关联路线结局。' : undefined} onClick={() => change({ afterstory: {
        id: createId(), title: '角色后日谈', entry: { sceneId: scenes[0]!.sceneId, labelId: null }, unlockEndingIds: [endingIds[0]!], initialProgress: {}, lockedView: 'locked',
      } })}><BookOpen size={14}/>配置普通后日谈</CandidateButton>
    </CandidateToolbar> : <>
      <CandidateField label="入口标题"><CandidateInput value={value.title} disabled={disabled} onChange={event => update({ title: event.target.value })}/></CandidateField>
      <div className="candidate-character-inline">
        <CandidateField label="起始场景"><CandidateSelect disabled={disabled} value={value.entry.sceneId} onValueChange={sceneId => update({ entry: { sceneId, labelId: null } })}>
          {!scene && <option value={value.entry.sceneId}>起始场景缺失</option>}
          {scenes.map(item => <option key={item.sceneId} value={item.sceneId}>{item.name}</option>)}
        </CandidateSelect></CandidateField>
        <CandidateField label="起始标签"><CandidateSelect disabled={disabled} value={value.entry.labelId ?? ''} onValueChange={labelId => update({ entry: { ...value.entry, labelId: labelId || null } })}>
          <option value="">从场景开头</option>
          {value.entry.labelId && !labels.some(label => label.id === value.entry.labelId) && <option value={value.entry.labelId}>起始标签缺失</option>}
          {labels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}
        </CandidateSelect></CandidateField>
      </div>
      <CandidateFieldGroup title="任一结局解锁">
        <div className="candidate-character-checks">{[...new Set([...endingIds, ...value.unlockEndingIds])].map(id =>
          <label key={id} className="candidate-character-check"><CandidateCheckbox disabled={disabled} checked={value.unlockEndingIds.includes(id)}
            onChange={event => update({ unlockEndingIds: event.target.checked ? [...value.unlockEndingIds, id] : value.unlockEndingIds.filter(item => item !== id) })}/>
            {id}{!endingIds.includes(id) && ' · 已脱离路线'}</label>)}</div>
        {!value.unlockEndingIds.length && <p role="alert">至少选择一个所属路线结局。</p>}
      </CandidateFieldGroup>
      <CandidateField label="锁定展示"><CandidateSelect disabled={disabled} value={value.lockedView} onValueChange={next => update({ lockedView: next as AfterstoryEntry['lockedView'] })}>
        <option value="locked">灰色剪影</option><option value="hidden">隐藏入口</option>
      </CandidateSelect></CandidateField>
      <CandidateSection title="后日谈独立初始变量" collapsible initiallyOpen={false}>
        <p className="candidate-character-hint">其余进度变量使用作品初值，已获长期事实保持。</p>
        {(source.variables ?? []).filter(variable => variable.scope === 'progress').map(variable => {
          const included = Object.hasOwn(value.initialProgress, variable.id);
          const changeValue = (next: string | number | boolean) => update({ initialProgress: { ...value.initialProgress, [variable.id]: next } });
          return <div key={variable.id} className="candidate-character-inline">
            <label className="candidate-character-check"><CandidateCheckbox disabled={disabled} checked={included} onChange={event => {
              const next = { ...value.initialProgress };
              if (event.target.checked) next[variable.id] = variable.initial; else { delete next[variable.id]; clearNumbers('afterstory/' + variable.id); }
              update({ initialProgress: next });
            }}/>{variable.name} · 独立覆盖</label>
            {included && (variable.type === 'number' ? <CharacterNumber field={'afterstory/' + variable.id} label={variable.name} value={Number(value.initialProgress[variable.id])} disabled={disabled} change={changeValue}/>
              : <CandidateField label={variable.name}>{variable.type === 'boolean'
                ? <CandidateCheckbox checked={!!value.initialProgress[variable.id]} disabled={disabled} onChange={event => changeValue(event.target.checked)}/>
                : <CandidateInput value={String(value.initialProgress[variable.id])} disabled={disabled} onChange={event => changeValue(event.target.value)}/>}</CandidateField>)}
          </div>;
        })}
      </CandidateSection>
      <CandidateToolbar label="后日谈操作">
        <CandidateButton variant="outline" disabled={disabled || !scene} onClick={() => previewScene(value.entry.sceneId)}><Play size={14}/>试玩后日谈场景</CandidateButton>
        <CandidateButton disabled={disabled} onClick={() => { clearNumbers('afterstory'); change({ afterstory: null }); }}><Trash2 size={14}/>移除入口配置</CandidateButton>
      </CandidateToolbar>
    </>}
  </CandidateSection>;
}
