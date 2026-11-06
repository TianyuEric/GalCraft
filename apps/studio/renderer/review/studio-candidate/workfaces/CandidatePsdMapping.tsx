import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset } from '@galcraft/contracts';
import { FileImage, Layers, Square } from 'lucide-react';
import { CandidateButton, CandidateField, CandidateReviewDialog, CandidateSelect } from '../components/controls/index.js';
import {
  planPsdImport, teachingPsdSource,
  type CandidateAppearance, type PsdEffectDecision, type PsdImportPlan, type PsdImportRow, type PsdResolution,
} from './psd-import-model.js';
import { workfaceError } from './workface-helpers.js';
import '../styles/psd-import.css';

type Revision = ReturnType<typeof teachingPsdSource>['revision'];

const issueText = {
  missing: '来源层已移除或移动',
  ambiguous: '图层路径有重名',
  manual: '当前槽位已改用其他素材',
} as const;
const rowLabels = {
  add: '新增',
  refresh: '刷新版本',
  unchanged: '维持现状',
  missing: issueText.missing,
  ambiguous: issueText.ambiguous,
  manual: issueText.manual,
  hidden: '源图层隐藏',
  effect: '效果处理',
} as const;

// Structure reference: NarraLeaf Studio 08c973cd6, CharacterEditor / PsdImportWizard.
// The candidate supplies deterministic teaching manifests and uses GalCraft document edits.
export function CandidatePsdMapping({ character, assets, initialSourceId, onPending, onCancel, onConfirm }: {
  character: CandidateAppearance;
  assets: readonly Asset[];
  initialSourceId?: string;
  onPending(pending: boolean): void;
  onCancel(): void;
  onConfirm(plan: PsdImportPlan): Promise<void>;
}) {
  const [revision, setRevision] = useState<Revision | null>(null);
  const [effect, setEffect] = useState<PsdEffectDecision>(null);
  const [resolutions, setResolutions] = useState<Record<string, PsdResolution>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choice = useRef<HTMLButtonElement>(null);
  const reimport = initialSourceId !== undefined;
  const source = useMemo(() => revision ? teachingPsdSource(revision) : null, [revision]);
  const plan = useMemo(() => source ? planPsdImport({ character, assets, source, effect, resolutions }) : null,
    [character, assets, source, effect, resolutions]);
  const ready = !!plan && (!reimport || initialSourceId === source?.sourceId);
  const effects = source?.layers.filter(layer => layer.visible && layer.effect && !layer.effect.skipOnlyReason) ?? [];
  const hasEffect = effects.length > 0;
  const excluded = plan?.rows.filter(row => row.status === 'hidden' || row.action === 'skip' || row.action === 'merge') ?? [];
  const changes = plan?.rows.filter(row => ['add', 'refresh', 'replace'].includes(row.action)) ?? [];
  const issues = plan?.rows.filter(row => row.status in issueText && !['skip', 'merge'].includes(row.action)) ?? [];
  const unresolved = issues.filter(row => row.action === 'preserve' && resolutions[row.id] !== 'keep');
  const shared = plan?.rows.filter(row => row.layer && !row.axisId &&
    (row.status === 'unchanged' || ['add', 'refresh', 'replace'].includes(row.action))) ?? [];
  const state = plan
    ? hasEffect && effect === null ? '还有 ' + effects.length + ' 个混合效果待处理'
      : '新增 ' + changes.filter(row => row.action === 'add').length
        + ' · 刷新 ' + changes.filter(row => row.action === 'refresh').length
        + (changes.some(row => row.action === 'replace') ? ' · 重新绑定 ' + changes.filter(row => row.action === 'replace').length : '')
        + ' · 待处理 ' + unresolved.length
    : '';
  useEffect(() => { onPending(revision !== null); }, [revision]);

  const choose = (next: Revision | null) => {
    setRevision(next);
    setEffect(null);
    setResolutions({});
    setError('');
  };
  const apply = async () => {
    if (!ready || !plan?.canConfirm || busy) return;
    setBusy(true);
    setError('');
    try { await onConfirm(plan); }
    catch (reason) { setError(workfaceError(reason)); setBusy(false); }
  };
  const resolution = (row: PsdImportRow) => {
    const chosen = resolutions[row.id];
    return chosen === 'keep' ? '@keep' : chosen?.layerKey ?? '';
  };

  return <CandidateReviewDialog open title={reimport ? '重导入 PSD' : '导入 PSD'}
    className="candidate-psd-import" busy={busy} initialFocus={choice} onDismiss={onCancel}
    actions={<div className="candidate-psd-footer">
      <span role="status">{state}</span>
      <div>
        <CandidateButton variant="secondary" disabled={busy} onClick={onCancel}>取消</CandidateButton>
        <CandidateButton variant="primary" disabled={!ready || !plan?.canConfirm || busy} onClick={() => void apply()}>
          {busy ? '正在写入…' : reimport ? '确认重导入' : '导入'}
        </CandidateButton>
      </div>
    </div>}>
    {!source ? <div className="candidate-psd-choose">
      <FileImage size={32} aria-hidden="true"/>
      {reimport && character.psdSource && <p title={character.psdSource.fileName}>{character.psdSource.fileName}</p>}
      <CandidateButton ref={choice} variant="primary" onClick={() => choose(reimport ? 'v2' : 'v1')}>选择教学 PSD</CandidateButton>
      <p>教学图层与预制 PNG。真实 PSD 文件由后续集成接入。</p>
    </div> : <>
      <div className="candidate-psd-file">
        <strong title={source.fileName}>{source.fileName}</strong>
        <span aria-label="PSD 画布">{source.width} × {source.height} px</span>
        <span>{source.layers.length} 个源图层</span>
        <CandidateButton density="compact" onClick={() => choose(null)} disabled={busy}>{reimport ? '重新定位来源' : '更换来源'}</CandidateButton>
      </div>
      {reimport && <div className="candidate-psd-version">
        <CandidateField label="教学来源版本" layout="row"><CandidateSelect density="compact" disabled={busy} value={revision ?? 'v2'} onValueChange={value => choose(value as Revision)}>
          <option value="v1">初始版</option><option value="v2">结构变化版</option>
        </CandidateSelect></CandidateField>
        {ready && <span>来源记录匹配</span>}
      </div>}
      {!ready && <p role="alert" className="candidate-psd-fault">所选清单属于其他来源，请重新定位当前组合的 PSD。</p>}
      {hasEffect && <section className="candidate-psd-section" aria-label="需要处理的混合效果">
        <h3>需要处理的混合效果</h3>
        {effects.map(layer => <div className="candidate-psd-row" key={layer.key}>
          <span className="candidate-psd-name" title={layer.path}>{layer.name}</span>
          <span className="candidate-psd-effect">{layer.effect?.name}</span>
          <div className="candidate-psd-actions">
            <CandidateButton density="compact" variant="outline" aria-pressed={effect === 'merge'} disabled={busy} onClick={() => setEffect('merge')}>向下合并</CandidateButton>
            <CandidateButton density="compact" variant="outline" aria-pressed={effect === 'skip'} disabled={busy} onClick={() => setEffect('skip')}>跳过</CandidateButton>
          </div>
        </div>)}
      </section>}
      {plan && <section className="candidate-psd-section" aria-label="自动图层映射">
        <h3>自动图层映射</h3>
        {[...plan.axes].reverse().map(axis => <div className="candidate-psd-axis" key={axis.id}>
          <div className="candidate-psd-row">
            <Layers size={14} aria-hidden="true"/><span className="candidate-psd-name" title={axis.name}>{axis.name}</span>
            <span className="candidate-psd-meta">差分轴 · {axis.choices.length} 项</span>
          </div>
          <ul>{axis.choices.map(tag => <li key={tag.id}>{tag.name}</li>)}</ul>
        </div>)}
        {[...shared].reverse().map(row => <div className="candidate-psd-row" key={row.id}>
          <Square size={14} aria-hidden="true"/><span className="candidate-psd-name" title={row.path}>{row.name}</span>
          <span className="candidate-psd-meta">共用图层</span>
        </div>)}
        {!plan.axes.length && !shared.length && <p className="candidate-psd-note">当前清单没有可自动映射的图层。</p>}
      </section>}
      {reimport && changes.length > 0 && <section className="candidate-psd-section" aria-label="本次写入">
        <h3>本次写入</h3>
        {changes.map(row => <div className="candidate-psd-row" key={row.id}>
          <span className="candidate-psd-name" title={row.path}>{row.path}</span>
          <span className="candidate-psd-meta">{row.action === 'replace' ? '重新绑定' : row.action === 'refresh' ? '刷新版本' : '新增'}</span>
        </div>)}
      </section>}
      {issues.length > 0 && <section className="candidate-psd-section" aria-label="需要处理的图层">
        <h3>需要处理的图层</h3>
        <p className="candidate-psd-note">未处理的项保留原绑定。本次可先写入安全项。</p>
        {issues.map(row => <div className="candidate-psd-row" key={row.id}>
          <div className="candidate-psd-issue">
            <span className="candidate-psd-name" title={row.path}>{row.path}</span>
            <small>{rowLabels[row.status]}</small>
          </div>
          {row.candidates.length > 0 ? <CandidateSelect density="compact" aria-label={row.path + ' 重导入处理'} disabled={busy}
            value={resolution(row)} onValueChange={value => {
              const layer = row.candidates.find(item => item.key === value);
              setResolutions(current => {
                const next = { ...current };
                if (layer) next[row.id] = { path: layer.path, layerKey: layer.key };
                else if (value === '@keep') next[row.id] = 'keep';
                else delete next[row.id];
                return next;
              });
            }}>
            <option value="">暂不处理</option>
            <option value="@keep">确认保留原绑定</option>
            {row.candidates.map((layer, index) => <option key={layer.key} value={layer.key}>绑定到 {layer.path}
              {row.candidates.some(other => other !== layer && other.path === layer.path) ? ' · 清单第 ' + (index + 1) + ' 项' : ''}</option>)}
          </CandidateSelect> : <span className="candidate-psd-meta">保留原绑定</span>}
        </div>)}
      </section>}
      {excluded.length > 0 && <section className="candidate-psd-section" aria-label="排除的图层">
        <h3>未单独导入的图层</h3>
        {excluded.map(row => <div className="candidate-psd-row" key={row.id}>
          <span className="candidate-psd-name" title={row.path}>{row.path}</span>
          <span className="candidate-psd-meta candidate-psd-reason">{row.reason ?? (row.action === 'merge' ? '效果已向下合并' : row.status === 'hidden' ? '源图层隐藏' : row.status === 'effect' ? '已跳过效果' : rowLabels[row.status])}</span>
        </div>)}
      </section>}
      {ready && plan && plan.changeCount === 0 && (!hasEffect || effect !== null) && <p className="candidate-psd-note">当前没有可写入的变化。</p>}
      {error && <p role="alert" className="candidate-psd-fault">{error}</p>}
    </>}
  </CandidateReviewDialog>;
}
