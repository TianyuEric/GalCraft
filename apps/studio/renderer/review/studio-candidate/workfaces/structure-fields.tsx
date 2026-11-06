import { useId, type Ref } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createId, type DocumentView, type Scene, type Variable } from '@galcraft/contracts';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateMenuButton, CandidateSection, CandidateSelect, CandidateToolbar } from '../components/controls/index.js';
import { declarationsOf, defaultScalar, removalReferences, type DeclarationDraft, type LocalDraft, type StructureDraft, typeLabels } from './structure-operations.js';

export type StructureFieldValues = Record<string, string>;
export type StructureFieldChange = (fields: StructureFieldValues) => void;

function ScalarField({ label, type, value, onChange }: { label: string; type: Variable['type']; value: string; onChange(value: string): void }) {
  return <CandidateField label={label}>
    {type === 'boolean' ? <CandidateSelect value={value} onValueChange={onChange}><option value="false">否</option><option value="true">是</option></CandidateSelect>
      : <CandidateInput value={value} inputMode={type === 'number' ? 'decimal' : undefined} onChange={event => onChange(event.target.value)}/>}
  </CandidateField>;
}

export function StructureNameField({ value, onChange, inputRef }: { value: string; onChange(value: string): void; inputRef?: Ref<HTMLInputElement> }) {
  return <CandidateField label="名称"><CandidateInput ref={inputRef} value={value} required onChange={event => onChange(event.target.value)}/></CandidateField>;
}

export function StructureVariableFields({ variable, fields, onChange, nameRef }: {
  variable?: Variable;
  fields: StructureFieldValues;
  onChange: StructureFieldChange;
  nameRef: Ref<HTMLInputElement>;
}) {
  const type = (fields.type ?? variable?.type ?? 'number') as Variable['type'];
  return <div className="candidate-structure-fields-grid">
    <StructureNameField inputRef={nameRef} value={fields.name ?? variable?.name ?? ''} onChange={name => onChange({ name })}/>
    <CandidateField label="作用域" hint="进度变量随存档恢复。长期变量跨周目保留。">
      <CandidateSelect value={fields.scope ?? variable?.scope ?? 'progress'} onValueChange={scope => onChange({ scope })}>
        <option value="progress">进度变量</option><option value="longTerm">长期变量</option>
      </CandidateSelect>
    </CandidateField>
    <CandidateField label="类型">
      <CandidateSelect value={type} onValueChange={next => onChange({ type: next, initial: defaultScalar(next as Variable['type']) })}>
        {Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </CandidateSelect>
    </CandidateField>
    <ScalarField label="初值" type={type} value={fields.initial ?? String(variable?.initial ?? defaultScalar(type))} onChange={initial => onChange({ initial })}/>
  </div>;
}

export function StructureDeclarationFields({ documents, scene, draft, disabled, busy, onChange, onDiscard, onApply, onReplace }: {
  documents: DocumentView[];
  scene: Scene;
  draft?: StructureDraft;
  disabled: boolean;
  busy: boolean;
  onChange(draft: DeclarationDraft): void;
  onDiscard(): void;
  onApply(): void;
  onReplace(id: string, name: string): void;
}) {
  const current = draft?.declarations ?? declarationsOf(scene);
  const update = (id: string, changes: Partial<LocalDraft>) => onChange({ ...current,
    locals: current.locals.map(local => local.id === id ? { ...local, ...changes } : local) });
  const add = () => onChange({ ...current, locals: [...current.locals, {
    id: createId([documents, current]), name: '', type: 'number', initial: '0', parameter: 'local', defaultValue: '0',
  }] });
  const remove = (id: string) => onChange({ ...current, locals: current.locals.filter(local => local.id !== id) });
  const labelId = useId();
  return <CandidateSection title="局部变量与子场景接口" className="candidate-structure-declarations"
    actions={<CandidateIconButton label="新增局部变量" disabled={disabled} onClick={add}><Plus size={15} aria-hidden="true"/></CandidateIconButton>}>
    <CandidateFieldGroup disabled={disabled} description="参数可以要求调用方传入，也可以配置省略时的默认值。修改后可在源码中修正现有调用。">
      {!current.locals.length && <p className="candidate-structure-empty-line">此场景暂无局部变量或参数。</p>}
      <ol className="candidate-structure-local-list" aria-label="局部变量与参数">
        {current.locals.map((local, index) => {
          const exists = scene.locals.some(item => item.id === local.id);
          const title = local.name || `局部变量 ${index + 1}`;
          return <li key={local.id} className="candidate-structure-local">
            <div className="candidate-structure-local-heading">
              <h3 id={`${labelId}-${local.id}`}>{title}</h3>
              {exists ? <CandidateMenuButton label={`${title}的操作`} actions={[
                { id: 'replace', label: '审阅替换引用', disabledReason: draft ? '先应用或还原声明草稿。' : undefined, run: () => onReplace(local.id, title) },
                { id: 'remove', label: '从声明中移除', danger: true, run: () => {
                  const refs = removalReferences(documents, { kind: 'local', id: local.id, sceneId: scene.id, name: title }).direct;
                  if (refs.length) onReplace(local.id, title);
                  else remove(local.id);
                } },
              ]}>操作</CandidateMenuButton> : <CandidateIconButton label={`移除${title}`} onClick={() => remove(local.id)}><Trash2 size={14} aria-hidden="true"/></CandidateIconButton>}
            </div>
            <div className="candidate-structure-fields-grid" role="group" aria-labelledby={`${labelId}-${local.id}`}>
              <CandidateField label="变量名称"><CandidateInput data-structure-local={local.id} required
                value={local.name} onChange={event => update(local.id, { name: event.target.value })}/></CandidateField>
              <CandidateField label="参数形式"><CandidateSelect value={local.parameter} onValueChange={value => update(local.id, {
                parameter: value as LocalDraft['parameter'], parameterRequired: undefined,
                ...(value === 'default' && local.parameter !== 'default' ? { defaultValue: local.initial } : {}),
              })}>
                <option value="local">仅局部变量</option><option value="required">必须传入</option><option value="default">可省略，使用默认值</option>
              </CandidateSelect></CandidateField>
              <CandidateField label="类型"><CandidateSelect value={local.type} onValueChange={value => {
                const type = value as Variable['type'];
                update(local.id, { type, initial: defaultScalar(type), defaultValue: defaultScalar(type) });
              }}>
                {Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </CandidateSelect></CandidateField>
              <ScalarField label="初值" type={local.type} value={local.initial} onChange={initial => update(local.id, { initial })}/>
              {local.parameter === 'default' && <ScalarField label="省略时的默认值" type={local.type} value={local.defaultValue}
                onChange={defaultValue => update(local.id, { defaultValue })}/>}
            </div>
          </li>;
        })}
      </ol>
      <div className="candidate-structure-fields-grid">
        <CandidateField label="返回类型"><CandidateSelect value={current.returns} onValueChange={returns => onChange({ ...current, returns: returns as Scene['returns'] })}>
          <option value="void">无返回值</option>
          {Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </CandidateSelect></CandidateField>
      </div>
    </CandidateFieldGroup>
    <CandidateToolbar label="声明操作">
      <CandidateButton variant="primary" disabled={disabled || !draft} onClick={onApply}>应用声明</CandidateButton>
      {draft && <CandidateButton disabled={busy} onClick={onDiscard}>还原声明</CandidateButton>}
    </CandidateToolbar>
  </CandidateSection>;
}
