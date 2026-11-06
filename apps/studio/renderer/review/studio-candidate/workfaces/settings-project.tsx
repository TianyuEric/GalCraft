import { useEffect, useRef, useState } from 'react';
import type { Asset, Project } from '@galcraft/contracts';
import type { AuthorOperation } from '@galcraft/documents/authoring';
import type { AuthoringSource } from '../../../authoring/controller.js';
import type { ProjectSettingsGuiDraft } from '../../../authoring/ProjectSettingsEditor.js';
import type { CandidateSession } from '../application/session.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateInput, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateTextarea, CandidateToolbar } from '../components/controls/index.js';
import { resultValue, workfaceError } from './workface-helpers.js';

type Props = { store: CandidateSession; source: AuthoringSource; assets: Asset[] };
type Resolution = 'draft' | 'current';
type Collision = { path: string; baseline: unknown; current: unknown; input: unknown };
const key = 'settings/project';
const labels: Record<string, string> = {
  name: '作品名称', description: '作品简介', releaseVersion: '发行版本', 'release.executableName': 'Windows 入口文件名',
  'release.publisher': '发行者', 'release.windowsSigning': 'Windows 签名方式', 'canvas.width': '宽度', 'canvas.height': '高度',
  'canvas.stageColor': '舞台底色', 'player.emergencyKey': '紧急回避快捷键', 'player.autosave': '自动存档', dynamicAssets: '动态素材预载入',
};
const get = (value: Project, path: string) => path.split('.').reduce<unknown>((item, part) => (item as Record<string, unknown> | undefined)?.[part], value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const shown = (value: unknown) => value === undefined ? '未设置' : typeof value === 'string' ? value : JSON.stringify(value);
const emergencyKeys = [
  ...Array.from({ length: 12 }, (_, index) => ({ value: 'F' + (index + 1), label: 'F' + (index + 1) })),
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', item => ({ value: 'Key' + item, label: item })),
  ...Array.from({ length: 10 }, (_, index) => ({ value: 'Digit' + index, label: String(index) })),
];

export function CandidateProjectFields({ store, source, assets }: Props) {
  const previous = store.viewState<ProjectSettingsGuiDraft>(key);
  const [fields, setFields] = useState<Record<string, unknown>>(() => previous?.fields ?? {});
  const base = useRef(previous?.baseline ?? source.project);
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Collision[]>([]);
  const dirty = Object.keys(fields).length > 0;
  const project = dirty ? base.current : source.project;
  useEffect(() => {
    store.rememberViewState(key, { project, baseline: base.current, fields } satisfies ProjectSettingsGuiDraft);
    store.setViewPending(key, dirty);
  }, [store, project, fields, dirty]);
  const value = (path: string, fallback: unknown = '') => Object.hasOwn(fields, path) ? fields[path] : get(project, path) ?? fallback;
  const change = (path: string, next: unknown) => {
    if (!dirty) base.current = structuredClone(source.project);
    setFields(current => {
      const fields = { ...current };
      if (equal(get(base.current, path), next)) delete fields[path]; else fields[path] = next;
      return fields;
    });
    setConflicts([]); setError(''); setStatus('');
  };
  const reset = () => { base.current = source.project; setFields({}); setConflicts([]); setError(''); };
  const apply = async (resolution?: Resolution) => {
    setBusy(true); setError(''); setStatus('');
    try {
      const documents = resultValue(await store.services.bridge.documents.list());
      const latest = resultValue(await store.services.read(documents)).project;
      const changes = Object.entries(fields).map(([path, value]): [string, unknown] => {
        if (path !== 'canvas.width' && path !== 'canvas.height') return [path, value];
        const next = Number(value);
        if (!Number.isInteger(next) || next <= 0) throw new Error(labels[path] + '须为正整数。');
        return [path, next];
      }).filter(([path, value]) => !equal(get(base.current, path), value));
      const collisions = changes.flatMap(([path, input]) => {
        const baseline = get(base.current, path), current = get(latest, path);
        return !equal(baseline, current) && !equal(current, input) ? [{ path, baseline, current, input }] : [];
      });
      if (collisions.length && !resolution) { setConflicts(collisions); return; }
      const update: Record<string, unknown> = {};
      for (const [path, next] of changes) {
        if (resolution === 'current' && collisions.some(item => item.path === path)) continue;
        const [group, child] = path.split('.');
        if (child) update[group!] = { ...(update[group!] as object), [child]: next };
        else update[group!] = next;
      }
      if (update.release && !latest.release) update.release = { executableName: 'Game.exe', publisher: '', windowsSigning: 'unsigned', ...update.release as object };
      if (Object.keys(update).length) {
        resultValue(await store.authorOperation({ op: 'project.update', changes: update as Extract<AuthorOperation, { op: 'project.update' }>['changes'] }, documents));
        store.refreshFromHost();
      }
      reset(); setStatus('已应用到作品工作区。');
    } catch (reason) { setError(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  const text = (path: string, fallback?: string) => <CandidateField label={labels[path]} layout="row">
    <CandidateInput value={String(value(path, fallback))} disabled={busy} onChange={event => change(path, event.target.value)}/>
  </CandidateField>;
  const dimensions = (path: 'canvas.width' | 'canvas.height') => <CandidateField label={labels[path]} unit="px" className="candidate-settings-number">
    <CandidateInput inputMode="numeric" value={String(value(path))} disabled={busy} onChange={event => change(path, event.target.value)}/>
  </CandidateField>;
  const selected = value('dynamicAssets', []) as string[];
  return <>
    <div className="candidate-document-scroll candidate-settings-scroll"><div className="candidate-settings-fields-body">
      <CandidateSection title="基本信息">
        {text('name')}
        <CandidateField label="作品简介" className="candidate-settings-long">
          <CandidateTextarea rows={3} value={String(value('description'))} disabled={busy} onChange={event => change('description', event.target.value)}/>
        </CandidateField>
      </CandidateSection>
      <CandidateSection title="舞台与玩家">
        <div className="candidate-settings-inline" aria-label="舞台画布">{dimensions('canvas.width')}{dimensions('canvas.height')}</div>
        {text('canvas.stageColor')}
        <CandidateField label={labels['player.emergencyKey']} layout="row" hint="运行时再次按键恢复。">
          <CandidateSelect value={String(value('player.emergencyKey', 'F8'))} disabled={busy} onValueChange={next => change('player.emergencyKey', next)}>
            {emergencyKeys.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </CandidateSelect>
        </CandidateField>
        <CandidateField label={labels['player.autosave']} layout="row"><CandidateCheckbox disabled={busy} checked={value('player.autosave') === true}
          onChange={event => change('player.autosave', event.target.checked)}/></CandidateField>
      </CandidateSection>
      <CandidateSection title="发行元信息" collapsible initiallyOpen={false}>
        {text('releaseVersion')}{text('release.executableName', 'Game.exe')}{text('release.publisher')}
        <CandidateField label={labels['release.windowsSigning']} layout="row"><CandidateSelect disabled={busy} value={String(value('release.windowsSigning', 'unsigned'))}
          onValueChange={next => change('release.windowsSigning', next)}><option value="unsigned">未签名</option><option value="certificate">作者证书</option></CandidateSelect></CandidateField>
      </CandidateSection>
      <CandidateSection title="动态素材预载入" collapsible initiallyOpen={false}>
        <p className="candidate-settings-hint">选择运行时可能通过变量或插件使用的素材。</p>
        {!assets.length && !selected.length && <p className="candidate-settings-hint">作品中暂无素材。</p>}
        <div className="candidate-settings-checks candidate-settings-asset-list">
          {[...assets.map(asset => ({ id: asset.id, name: asset.name })), ...selected.filter(id => !assets.some(asset => asset.id === id)).map(id => ({ id, name: '素材缺失 · ' + id }))].map(asset =>
            <label key={asset.id} className="candidate-settings-check"><CandidateCheckbox disabled={busy} checked={selected.includes(asset.id)} onChange={event => change('dynamicAssets',
              event.target.checked ? [...selected, asset.id] : selected.filter(id => id !== asset.id))}/>{asset.name}</label>)}
        </div>
      </CandidateSection>
    </div></div>
    <SettingsCommit title="作品设置" dirty={dirty} busy={busy} error={error} status={status} reset={reset} apply={() => void apply()}/>
    {!!conflicts.length && <CandidateReviewDialog open title="作品设置已变更" description="以下字段已由其他操作修改。请选择要应用的值。" onDismiss={() => { if (!busy) setConflicts([]); }}
      actions={<><CandidateButton disabled={busy} onClick={() => setConflicts([])}>继续编辑</CandidateButton><CandidateButton disabled={busy} onClick={() => void apply('current')}>采用工作区冲突字段</CandidateButton><CandidateButton variant="primary" disabled={busy} onClick={() => void apply('draft')}>采用我的冲突字段</CandidateButton></>}>
      <dl className="candidate-settings-conflicts">{conflicts.map(item => <div key={item.path}><dt>{labels[item.path]}</dt><dd>编辑前 {shown(item.baseline)}</dd><dd>工作区 {shown(item.current)}</dd><dd>我的输入 {shown(item.input)}</dd></div>)}</dl>
      {error && <p role="alert">{error}</p>}
    </CandidateReviewDialog>}
  </>;
}

export function SettingsCommit({ title, dirty, busy, error, status, reset, apply }: {
  title: string; dirty: boolean; busy: boolean; error: string; status?: string; reset(): void; apply(): void;
}) {
  return <footer className="candidate-settings-footer">
    <div className="candidate-settings-status">
      {error ? <p role="alert">{error}</p> : <p role="status">{busy ? '正在应用…' : dirty ? '有未应用修改' : status}</p>}
    </div>
    <CandidateToolbar label={title + '操作'}>
      {dirty && <CandidateButton disabled={busy} onClick={reset}>还原未应用输入</CandidateButton>}
      <CandidateButton variant="primary" disabled={!dirty || busy} onClick={apply}>应用{title}</CandidateButton>
    </CandidateToolbar>
  </footer>;
}
