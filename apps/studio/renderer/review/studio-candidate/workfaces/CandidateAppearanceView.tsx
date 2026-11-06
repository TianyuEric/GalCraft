import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileImage, Layers, Plus, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { createId, type DocumentView, type Json } from '@galcraft/contracts';
import {
  appearanceAsset, appearanceComposition, appearanceParts, appearancePath, assetIndexPath, readAppearanceResources, resourceLocationsPath,
  selectedAppearanceAxes, type AppearanceResources, type CandidateSceneCast,
} from '../adapters/appearance-composition.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { envelope, sceneExtension } from '../application/documents.js';
import { openCandidateAssetPicker } from '../components/CandidateAssetPicker.js';
import {
  CandidateButton, CandidateCheckbox, CandidateField, CandidateIconButton, CandidateInput, CandidateNumberField, CandidateSelect, CandidateToolbar,
} from '../components/controls/index.js';
import { CandidateCompositionPreview } from './CandidateCompositionPreview.js';
import { CandidatePsdMapping } from './CandidatePsdMapping.js';
import { preparePsdImport, type CandidateAppearance, type CandidateAppearancePart, type PsdAxis, type PsdImportPlan } from './psd-import-model.js';
import { resultValue, workfaceError } from './workface-helpers.js';
import '../styles/appearance-workface.css';

const json = (value: unknown): Json => JSON.parse(JSON.stringify(value));
const version = (document: DocumentView) => ({ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision });
const sourceAssetId = (part: CandidateAppearancePart) => part.source.startsWith('asset:') ? part.source.slice(6) : undefined;

function compositionDocuments(documents: readonly DocumentView[]) {
  return {
    appearance: documents.find(document => appearancePath in document.files),
    index: documents.find(document => assetIndexPath in document.files),
    resources: documents.find(document => resourceLocationsPath in document.files),
  };
}

function appearancePatch(document: DocumentView, character: CandidateAppearance) {
  const before = JSON.parse(document.files[appearancePath]!).data;
  const { id, name: _name, description: _description, ...appearance } = character;
  const after = { ...before, appearances: { ...before.appearances, [id]: appearance } };
  return { kind: 'json' as const, documentId: document.documentId, changes: [{ op: 'set' as const, path: '/data', before: json(before), after: json(after) }] };
}

type PsdDialog = { character: CandidateAppearance; resources: AppearanceResources; documents: DocumentView[]; sourceId?: string };

function AddAppearanceName({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (value: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  return <form className="candidate-appearance-add" onSubmit={event => {
    event.preventDefault();
    if (!value.trim() || pending) return;
    setPending(true);
    void onAdd(value.trim()).then(() => setValue(''), () => undefined).finally(() => setPending(false));
  }}>
    <CandidateInput aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => setValue(event.currentTarget.value)}/>
    <CandidateButton type="submit" disabled={!value.trim() || pending}><Plus size={14} aria-hidden="true"/>{label}</CandidateButton>
  </form>;
}

function AppearanceName({ value, label, onChange }: { value: string; label: string; onChange(value: string): void }) {
  return <CandidateInput key={value} aria-label={label} defaultValue={value} onBlur={event => {
    const next = event.currentTarget.value.trim();
    if (next && next !== value) onChange(next);
    else event.currentTarget.value = value;
  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>;
}

export function CandidateAppearanceView({ characterId, viewId, onOpen }: { characterId?: string; viewId?: string; onOpen: (view: string) => void }) {
  const { project } = useCandidateState();
  const character = characterId ? project.characters.find(item => item.id === characterId) : project.characters[0];
  if (!character) return <p className="candidate-empty">从角色目录打开要编辑的角色。</p>;
  return <CandidateAppearanceEditor key={character.id} character={character} viewId={viewId ?? 'appearances'} onOpen={onOpen}/>;
}

function CandidateAppearanceEditor({ character, viewId, onOpen }: {
  character: CandidateAppearance; viewId: string; onOpen: (view: string) => void;
}) {
  const store = useCandidate(), { project, ui, activeView } = useCandidateState();
  const root = useRef<HTMLElement>(null);
  const documents = store.host.list();
  const { appearance: doc, index, resources: resourceDoc } = compositionDocuments(documents);
  const resources = readAppearanceResources(documents);
  const [psd, setPsd] = useState<PsdDialog>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [partId, setPartId] = useState<string>();
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string>>({});
  const pendingPsd = viewId + '/psd';
  useEffect(() => () => store.setViewPending(pendingPsd, false), [store, pendingPsd]);
  const run = async (action: () => Promise<void>) => {
    setError('');
    setStatus('');
    try { await action(); }
    catch (reason) { setError(workfaceError(reason)); throw reason; }
  };
  const act = (action: () => Promise<void>) => { void run(action).catch(() => undefined); };
  const selectCommandTarget = (document: DocumentView) => {
    const current = store.getSnapshot();
    if (current.activeView === viewId && current.commandTarget !== document.documentId) store.target(document.documentId);
  };
  const write = async (label: string, change: (target: CandidateAppearance) => void) => {
    const document = compositionDocuments(store.host.list()).appearance;
    const latest = store.getSnapshot().project.characters.find(item => item.id === character.id);
    if (!document || !latest) throw new Error('角色或组合外观文档已移除。');
    const target: CandidateAppearance = structuredClone(latest);
    change(target);
    if (JSON.stringify(target) === JSON.stringify(latest)) return;
    selectCommandTarget(document);
    resultValue(await store.applyEdit({
      label, origin: 'field', expected: [version(document)], patches: [appearancePatch(document, target)], preparedAssets: [], requiredRefs: [],
    }));
  };
  const editPart = (part: CandidateAppearancePart, patch: Partial<CandidateAppearancePart>) => write('修改组合图层', target => {
    const current = target.parts.find(item => item.id === part.id);
    if (!current) throw new Error('图层已移除，请重新选择。');
    Object.assign(current, patch);
  });
  const axes = character.compositionAxes ?? [];
  const defaultSelection = selectedAppearanceAxes(character);
  const previewSelection = selectedAppearanceAxes(character, previewOverrides);
  const composition = appearanceComposition(character, previewSelection, resources);
  const hasPreviewChanges = axes.some(axis => defaultSelection[axis.id] !== previewSelection[axis.id]);
  const scene = project.scenes.find(item => item.id === ui.sceneId);
  const layers = appearanceParts(character);
  const selected = layers.find(part => part.id === partId) ?? layers[0];
  const selectedAxis = axes.find(axis => axis.id === selected?.compositionAxisId);

  const choosePng = async (replace?: CandidateAppearancePart) => {
    const projectId = store.controller.source?.project.projectId;
    if (!projectId) throw new Error('作品尚未载入。');
    const choice = await openCandidateAssetPicker({
      projectId, allowedKinds: ['image'], services: store.services, scope: root.current ?? undefined, locale: store.controller.preferences.locale,
      purpose: replace ? '替换 PNG 组合图层' : '选择 PNG 组合图层', currentAssetId: replace && sourceAssetId(replace),
      currentVariantId: replace?.compositionVariantId, mode: 'compact', remember: false, chooseVersion: true,
      onApply: async selected => {
        const resolved = appearanceAsset(selected.assetId, selected.variantId, readAppearanceResources(store.host.list()));
        if (!resolved.variant?.files.some(file => file.path === resolved.variant?.entry && file.mime === 'image/png')) {
          const error = { code: 'COMPOSITION_PNG_REQUIRED', message: '请选择 PNG 素材作为组合图层。', severity: 'error' as const, owner: 'M04' as const, related: [], actions: [] };
          return { ok: false, error, issues: [error] };
        }
        return { ok: true, value: undefined, warnings: [] };
      },
    });
    if (!choice) return;
    const resolved = appearanceAsset(choice.assetId, choice.variantId, readAppearanceResources(store.host.list()));
    if (!resolved.asset || !resolved.variant || !resolved.image) throw new Error('此图像在候选宿主中没有可读取的预览来源。');
    const image = new Image();
    image.src = resolved.image;
    await image.decode().catch(() => { throw new Error('无法读取此 PNG 图层，请检查素材。'); });
    const id = replace?.id ?? createId(store.getSnapshot().project.characters);
    const frame = resolved.variant.canvas;
    const png = {
      source: 'asset:' + resolved.asset.id, image: '', compositionVariantId: choice.variantId, compositionSizedVariantId: resolved.variant.id,
      compositionFrame: { width: image.naturalWidth, height: image.naturalHeight,
        canvasWidth: frame?.width ?? image.naturalWidth, canvasHeight: frame?.height ?? image.naturalHeight },
    };
    if (replace) await editPart(replace, png);
    else await write('添加 PNG 组合图层', target => {
      target.parts.push({ ...png, id, name: resolved.asset!.name, axis: 'shared', value: id, visible: true, x: frame?.offsetX ?? 0, y: frame?.offsetY ?? 0 });
    });
    setPartId(id);
  };

  const startPsd = (sourceId?: string) => {
    if (!doc || !index || !resourceDoc) return;
    setError('');
    setStatus('');
    setPsd({ character: structuredClone(character), resources, documents: [doc, index, resourceDoc], sourceId });
  };
  const closePsd = () => {
    setPsd(undefined);
    store.setViewPending(pendingPsd, false);
  };
  const confirmPsd = async (plan: PsdImportPlan) => {
    const snapshot = store.host.list();
    const latest = compositionDocuments(snapshot);
    const current: CandidateAppearance | undefined = store.getSnapshot().project.characters.find(item => item.id === character.id);
    if (!psd || !current || !latest.appearance || !latest.index || !latest.resources) throw new Error('组合外观、素材索引或角色已移除。');
    if (psd.documents.some(document => snapshot.find(item => item.documentId === document.documentId)?.revision !== document.revision)) {
      throw new Error('外观或素材已变化。请关闭弹窗，再用当前版本重新打开导入。');
    }
    const existing = readAppearanceResources(snapshot);
    const prepared = preparePsdImport({
      character: current, assets: [...existing.assets], locations: { ...existing.locations }, plan,
      allocateId: () => createId(), now: new Date().toISOString(),
    });
    selectCommandTarget(latest.appearance);
    resultValue(await store.applyEdit({
      label: current.psdSource ? '重导入 PSD 组合外观' : '导入 PSD 组合外观', origin: 'field',
      expected: psd.documents.map(version), preparedAssets: [], requiredRefs: [],
      patches: [
        appearancePatch(latest.appearance, prepared.character),
        { kind: 'json', documentId: latest.index.documentId, changes: [{ op: 'set', path: '/data/assets', before: json(existing.assets), after: json(prepared.assets) }] },
        { kind: 'json', documentId: latest.resources.documentId, changes: [{ op: 'set', path: '/data/locations', before: json(existing.locations), after: json(prepared.locations) }] },
      ],
    }));
    setPreviewOverrides({});
    setPartId(undefined);
    setStatus('PSD 组合已写入角色。');
    closePsd();
  };
  const applyScene = async () => {
    if (!scene) return;
    if (store.sourceReadOnly(scene.id)) throw new Error('场景源码需要修复，修复后可应用组合外观。');
    const latest = store.host.list();
    const path = `candidate/scenes/${scene.id}.json`;
    const document = latest.find(item => path in item.files);
    const sceneDocument = latest.find(item => `scenes/${scene.id}/script.gal` in item.files);
    if (!sceneDocument) throw new Error('此场景已移除，请重新定位。');
    const before = sceneExtension(latest, scene.id);
    const prior = before.cast[character.id];
    const cast: CandidateSceneCast = { outfit: character.outfit, expression: character.expression,
      x: prior?.x ?? 960, y: prior?.y ?? 1080, scale: prior?.scale ?? .72, visible: prior?.visible ?? true, composition };
    const after = { ...before, cast: { ...before.cast, [character.id]: cast } };
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const created = document ? undefined : envelope(createId(latest), path, after);
    resultValue(await store.applyEdit({
      label: '应用组合外观到场景实例', origin: 'field', expected: [version(sceneDocument), ...(document ? [version(document)] : [])], preparedAssets: [],
      requiredRefs: [...new Set(composition.layers.flatMap(layer => layer.assetId ? [layer.assetId] : []))].map(id => ({ kind: 'asset', id })),
      patches: document
        ? [{ kind: 'json', documentId: document.documentId, changes: [{ op: 'set', path: '/data', before: json(before), after: json(after) }] }]
        : [{ kind: 'document', documentId: created!.documentId, op: 'create', before: null, after: { format: created!.format, files: created!.files } }],
    }));
    setStatus(`已将预览组合应用到「${scene.name}」。`);
  };
  const writeAxis = (axisId: string, label: string, change: (axis: PsdAxis, target: CandidateAppearance) => void) => write(label, target => {
    const axis = target.compositionAxes?.find(item => item.id === axisId);
    if (!axis) throw new Error('组合轴已移除。');
    change(axis, target);
  });

  return <section ref={root} className="candidate-object-scroll candidate-appearance-workface" aria-label="组合外观"
    onFocusCapture={() => { if (doc && activeView === viewId) selectCommandTarget(doc); }}>
    <header className="candidate-appearance-heading">
      <div><h3>组合外观</h3><p>管理角色图层，按轴切换外观。</p></div>
      <CandidateToolbar label="组合图层来源">
        {!character.psdSource && <CandidateButton variant="outline" disabled={!doc || !index || !resourceDoc} onClick={() => startPsd()}><Layers size={15} aria-hidden="true"/>导入 PSD</CandidateButton>}
        <CandidateButton variant="outline" disabled={!doc} onClick={() => act(() => choosePng())}><Plus size={15} aria-hidden="true"/>添加 PNG 图层</CandidateButton>
      </CandidateToolbar>
    </header>
    {character.psdSource && <div className="candidate-appearance-source">
      <div><FileImage size={16} aria-hidden="true"/><strong title={character.psdSource.fileName}>{character.psdSource.fileName}</strong>
        <span>{character.psdSource.revision.toUpperCase()} · {character.psdSource.width} × {character.psdSource.height} px · 已映射 {character.psdSource.layers.length} 层</span></div>
      <CandidateButton disabled={!doc || !index || !resourceDoc} onClick={() => startPsd(character.psdSource?.sourceId)}><RefreshCw size={14} aria-hidden="true"/>重导入 PSD</CandidateButton>
    </div>}
    {error && <p className="candidate-workface-message" role="alert">{error}</p>}
    <div className="candidate-appearance-body">
      <div className="candidate-appearance-preview-column">
        <CandidateCompositionPreview name={character.name} composition={composition} resources={resources}/>
        <section className="candidate-appearance-preview-picks" aria-label="预览组合">
          <h4>预览组合</h4>
          {axes.length ? axes.map(axis => <CandidateField key={axis.id} label={axis.name} title={axis.name} layout="row">
            <CandidateSelect value={previewSelection[axis.id]} disabled={!axis.choices.length} placeholder="暂无标签"
              onValueChange={value => setPreviewOverrides(previous => ({ ...previous, [axis.id]: value }))}>
              {axis.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
            </CandidateSelect>
          </CandidateField>) : <p>添加组合轴后可在这里切换标签。</p>}
          <CandidateToolbar label="角色外观默认值">
            <CandidateButton variant="outline" disabled={!doc || !hasPreviewChanges} onClick={() => act(async () => {
              await write('保存角色默认外观', target => { target.compositionSelection = previewSelection; });
              setPreviewOverrides({});
              setStatus('已保存角色默认组合。');
            })}>设为角色默认</CandidateButton>
            <CandidateButton disabled={!hasPreviewChanges} onClick={() => setPreviewOverrides({})}>恢复角色默认</CandidateButton>
          </CandidateToolbar>
        </section>
      </div>
      <div className="candidate-appearance-editor">
        <details className="candidate-appearance-axes">
          <summary><strong>组合轴与标签</strong><small>{axes.length} 个轴</small></summary>
          {axes.map(axis => <div className="candidate-appearance-axis" key={axis.id}>
            <div className="candidate-appearance-axis-heading">
              <AppearanceName label={axis.name + ' · 轴名称'} value={axis.name} onChange={name => act(() => writeAxis(axis.id, '重命名组合轴', (item, target) => {
                if (target.compositionAxes?.some(other => other.id !== item.id && other.name === name)) throw new Error('已存在同名组合轴。');
                item.name = name;
              }))}/>
              <span title="角色默认">{axis.choices.find(choice => choice.id === defaultSelection[axis.id])?.name ?? '默认不显示'}</span>
              <CandidateIconButton label={`移除组合轴 ${axis.name}`} disabled={layers.some(part => part.compositionAxisId === axis.id)} onClick={() => act(() => write('移除组合轴', target => {
                target.compositionAxes = target.compositionAxes?.filter(item => item.id !== axis.id) ?? [];
                if (target.compositionSelection) delete target.compositionSelection[axis.id];
              }))}><Trash2 size={14}/></CandidateIconButton>
            </div>
            {axis.choices.map(choice => <div className="candidate-appearance-tag" key={choice.id}>
              <AppearanceName label={axis.name + ' · ' + choice.name + ' · 标签名称'} value={choice.name} onChange={name => act(() => writeAxis(axis.id, '重命名组合标签', item => {
                if (item.choices.some(other => other.id !== choice.id && other.name === name)) throw new Error('此轴已有同名标签。');
                const current = item.choices.find(other => other.id === choice.id);
                if (current) current.name = name;
              }))}/>
              <CandidateIconButton label={`移除标签 ${choice.name}`} disabled={layers.some(part => part.compositionAxisId === axis.id && part.value === choice.id)} onClick={() => act(() => writeAxis(axis.id, '移除组合标签', item => {
                item.choices = item.choices.filter(other => other.id !== choice.id);
              }))}><Trash2 size={14}/></CandidateIconButton>
            </div>)}
            <AddAppearanceName label="添加标签" placeholder={axis.name + ' · 新标签名称'} onAdd={name => run(() => writeAxis(axis.id, '添加组合标签', item => {
              if (item.choices.some(choice => choice.name === name)) throw new Error('此轴已有同名标签。');
              item.choices.push({ id: createId(item.choices), name });
            }))}/>
          </div>)}
          <AddAppearanceName label="添加轴" placeholder="新组合轴名称" onAdd={name => run(() => write('添加组合轴', target => {
            const current = target.compositionAxes ??= [];
            if (current.some(item => item.name === name)) throw new Error('已存在同名组合轴。');
            current.push({ id: createId(current), name, choices: [] });
          }))}/>
        </details>
        <section aria-label="组合图层" className="candidate-appearance-layers">
          <h4>图层 <small>{layers.length}</small></h4>
          {layers.length ? <ul>{layers.map(part => {
            const axis = axes.find(item => item.id === part.compositionAxisId);
            const tag = axis?.choices.find(item => item.id === part.value);
            const placement = axis && tag ? axis.name + ' / ' + tag.name : part.axis === 'shared' ? '常驻' : '现有差分';
            return <li key={part.id}>
              <CandidateButton aria-pressed={selected?.id === part.id} onClick={() => setPartId(part.id)} title={part.name}>
                <FileImage size={14} aria-hidden="true"/><span>{part.name}</span><small title={placement}>{placement}</small>
              </CandidateButton>
              <CandidateCheckbox aria-label={part.name + ' · 启用图层'} checked={part.visible} onChange={event => {
                const value = event.currentTarget.checked;
                act(() => editPart(part, { visible: value }));
              }}/>
            </li>;
          })}</ul> : <p>导入 PSD 或添加 PNG 素材，开始组合角色外观。</p>}
        </section>
        {selected && <section className="candidate-appearance-layer-properties" aria-label={selected.name + ' · 图层属性'}>
          <header><h4 title={selected.name}>{selected.name}</h4><CandidateToolbar label="图层顺序">
            {([-1, 1] as const).map(delta => {
              const position = layers.indexOf(selected);
              const neighbor = layers[position + delta];
              return <CandidateIconButton key={delta} label={delta < 0 ? '向前移动一层' : '向后移动一层'} disabled={!neighbor} onClick={() => act(() => write('调整组合图层顺序', target => {
                const from = target.parts.findIndex(item => item.id === selected.id);
                const to = target.parts.findIndex(item => item.id === neighbor?.id);
                if (from >= 0 && to >= 0) [target.parts[from], target.parts[to]] = [target.parts[to]!, target.parts[from]!];
              }))}>{delta < 0 ? <ArrowUp size={14}/> : <ArrowDown size={14}/>}</CandidateIconButton>;
            })}
          </CandidateToolbar></header>
          <div className="candidate-appearance-layer-fields">
            <CandidateField label="组合轴"><CandidateSelect value={selected.compositionAxisId ?? (selected.axis === 'shared' ? '' : '@legacy')} onValueChange={value => {
              const axis = axes.find(item => item.id === value);
              if (value === '@legacy') return;
              act(() => editPart(selected, { axis: 'shared', compositionAxisId: axis?.id, value: axis?.choices[0]?.id ?? selected.id }));
            }}>
              {selected.axis !== 'shared' && <option value="@legacy">现有差分</option>}
              <option value="">常驻图层</option>{axes.map(axis => <option key={axis.id} value={axis.id} disabled={!axis.choices.length}>{axis.name}</option>)}
            </CandidateSelect></CandidateField>
            {selectedAxis && <CandidateField label="标签"><CandidateSelect value={selected.value} onValueChange={value => act(() => editPart(selected, { value }))}>
              {selectedAxis.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
            </CandidateSelect></CandidateField>}
            {(['x', 'y'] as const).map(axis => <CandidateNumberField key={selected.id + axis} label={axis.toUpperCase() + ' 位置'} unit="px" value={selected[axis]} step={1}
              onCommit={value => run(() => editPart(selected, { [axis]: value }))}/>)}
          </div>
          <CandidateToolbar label="图层素材">
            {sourceAssetId(selected) && <CandidateButton onClick={() => onOpen('assets:' + sourceAssetId(selected))}>定位素材</CandidateButton>}
            <CandidateButton onClick={() => act(() => choosePng(selected))}>替换 PNG</CandidateButton>
            <CandidateButton onClick={() => act(() => write('移除组合图层', target => {
              target.parts = target.parts.filter(item => item.id !== selected.id);
            }))}>移除图层</CandidateButton>
          </CandidateToolbar>
        </section>}
      </div>
    </div>
    <footer className="candidate-appearance-footer">
      <div><strong>场景实例</strong><span title={scene?.name}>{scene?.name ?? '没有当前场景'}</span></div>
      <CandidateToolbar label="组合外观操作">
        <CandidateButton variant="primary" disabled={!scene || !composition.layers.length} onClick={() => act(applyScene)}>应用预览到场景</CandidateButton>
        {scene && <CandidateButton onClick={() => onOpen('writing:' + scene.id)}>定位场景</CandidateButton>}
        <CandidateIconButton label="撤销外观修改" disabled={!doc || !store.history(doc.documentId).canUndo} onClick={() => doc && void store.undo(doc.documentId)}><Undo2 size={15}/></CandidateIconButton>
      </CandidateToolbar>
      {status && <p role="status">{status}</p>}
    </footer>
    {psd && <CandidatePsdMapping character={psd.character} assets={psd.resources.assets} initialSourceId={psd.sourceId}
      onPending={pending => store.setViewPending(pendingPsd, pending)} onCancel={closePsd} onConfirm={confirmPsd}/>}
  </section>;
}
