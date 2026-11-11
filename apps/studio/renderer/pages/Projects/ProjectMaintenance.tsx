import { useCallback, useEffect, useRef, useState } from 'react';
import { createId, type DocumentView, type Issue, type Result, type UpgradePlan } from '@galcraft/contracts';
import type { DesktopBridge } from '../../../desktop-bridge.js';
import type { AuthoringSource, StudioLocale } from '../../authoring/controller.js';
import { Button, Choice, Field } from '../../components/controls.js';
import { IssueNotice } from '../../components/issue-notice.js';
import { MessageBox } from '../../components/workbench/MessageBox.js';
import './project-maintenance.css';

type Upgrades = DesktopBridge['upgrades'];
type Engine = Extract<Awaited<ReturnType<Upgrades['list']>>, { ok: true }>['value'][number];
type UpgradeRecord = Extract<Awaited<ReturnType<Upgrades['history']>>, { ok: true }>['value'][number];
type EngineHealth = { version: string; issues: Issue[] };
const value = <T,>(result: Result<T>): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

export function ProjectMaintenance({ locale, source, upgrades, readDocuments, chooseOldSaves, engineRepair, beforeProjectChange, onProjectChanged }: {
  locale: StudioLocale;
  source: AuthoringSource;
  upgrades: Upgrades;
  readDocuments(): Promise<Result<DocumentView[]>>;
  chooseOldSaves(): Promise<Result<string[]>>;
  engineRepair?: { health(): Promise<Result<EngineHealth>>; repair(): Promise<Result<EngineHealth | null>> };
  beforeProjectChange?(): Promise<boolean>;
  onProjectChanged(): void | Promise<void>;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [engines, setEngines] = useState<Engine[]>([]), [history, setHistory] = useState<UpgradeRecord[]>([]);
  const [target, setTarget] = useState(''), [samples, setSamples] = useState<string[]>([]);
  const [plan, setPlan] = useState<UpgradePlan | null>(null), [operationId, setOperationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [engineHealth, setEngineHealth] = useState<EngineHealth | null>(null);
  const [checkingEngine, setCheckingEngine] = useState(false), [engineError, setEngineError] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'commit' | 'restore'; id: string; original: string } | null>(null);
  const running = useRef(false);
  const { project } = source;

  const load = useCallback(async () => {
    const [engineResult, historyResult] = await Promise.all([upgrades.list(), upgrades.history()]);
    return { engines: value(engineResult), history: value(historyResult) };
  }, [upgrades]);
  useEffect(() => {
    let active = true;
    void load().then(result => { if (active) { setEngines(result.engines); setHistory(result.history); } })
      .catch(reason => { if (active) setError(String(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, project.projectId]);
  useEffect(() => {
    if (!engineRepair) return;
    let active = true;
    setCheckingEngine(true);
    setEngineError('');
    void engineRepair.health().then(value).then(health => { if (active) setEngineHealth(health); })
      .catch(reason => { if (active) setEngineError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setCheckingEngine(false); });
    return () => { active = false; };
  }, [engineRepair, project.projectId, project.engineVersion]);

  const candidates = engines.filter(engine => engine.version !== project.engineVersion && engine.targets.includes('windows')
    && engine.conversions.some(conversion => conversion.from === project.engineVersion && conversion.to === engine.version));
  const ready = plan?.validation?.checks.length && plan.validation.checks.every(check => check.result === 'pass');
  const engineBlocked = engineHealth?.issues.some(issue => issue.severity === 'error');
  const chooseTarget = t('目标引擎版本', 'Target engine version', '移行先のエンジンバージョン');
  const needsSave = t('请先应用并保存作品修改。', 'Apply and save project changes first.', '先に作品の変更を適用して保存してください。');
  const checkLabels = {
    dsl: t('剧本编译', 'Script compilation', 'シナリオのコンパイル'),
    template: t('模板', 'Template', 'テンプレート'),
    plugin: t('插件', 'Plugins', 'プラグイン'),
    resource: t('资源', 'Resources', 'リソース'),
    save: t('旧档兼容', 'Save compatibility', '旧セーブの互換性'),
    playtest: t('试玩路线', 'Playtest routes', 'テストプレイのルート'),
  };
  const run = async (action: () => Promise<void>, inDialog = false) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (reason) {
      if (inDialog) throw reason;
      setError(reason instanceof Error ? reason.message : String(reason));
    }
    finally { running.current = false; setBusy(false); }
  };
  const saved = async () => {
    const documents = value(await readDocuments());
    if (documents.some(document => document.dirty)) throw new Error(needsSave);
    return documents.map(document => ({ ref: { kind: 'document' as const, id: document.documentId }, revision: document.savedRevision }));
  };
  const prepare = async () => {
    const expected = await saved(), id = createId();
    setOperationId(id);
    try { setPlan(value(await upgrades.plan({ projectId: project.projectId, toVersion: target, expected, operationId: id, representativeSaves: samples }))); }
    finally { setOperationId(null); }
  };
  const apply = async (choice: NonNullable<typeof confirm>) => {
    if (beforeProjectChange && !await beforeProjectChange()) throw new Error(needsSave);
    await saved();
    const result = choice.kind === 'commit' ? await upgrades.commit(choice.id) : await upgrades.restore(choice.id);
    value(result);
    setConfirm(null); setPlan(null); setTarget('');
    setNotice(choice.kind === 'commit' ? t('引擎迁移已提交。原副本可在维护记录中查看。', 'Engine migration committed. The original copy is listed in maintenance history.', 'エンジン移行を確定しました。元のコピーはメンテナンス履歴にあります。')
      : t('已从原副本恢复。', 'Restored from the original copy.', '元のコピーから復元しました。'));
    if (result.ok && result.warnings.length) setError(result.warnings.map(issue => issue.message).join('\n'));
    try { await onProjectChanged(); setHistory(value(await upgrades.history())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const checkEngine = async (repair: boolean) => {
    if (!engineRepair) return;
    setEngineError('');
    try {
      const health = repair ? value(await engineRepair.repair()) : value(await engineRepair.health());
      if (!health) return;
      setEngineHealth(health);
      if (engineBlocked && !health.issues.some(issue => issue.severity === 'error')) await onProjectChanged();
    } catch (reason) { setEngineError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return <section className="project-workbench project-maintenance" aria-busy={busy || loading}>
    <header><h1>{t('作品维护', 'Project maintenance', '作品のメンテナンス')}</h1>
      <p>{project.name} · {t('当前引擎', 'Current engine', '現在のエンジン')} <code>galcraft@{project.engineVersion}</code></p>
    </header>
    {error && <p role="alert" className="project-library-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {engineRepair && <section className="project-maintenance-section" aria-busy={checkingEngine || busy}>
      <h2>{t('作品引擎检查', 'Project engine check', '作品エンジンの確認')}</h2>
      <p>{t('锁定版本', 'Locked version', '固定バージョン')} <code>galcraft@{engineHealth?.version ?? project.engineVersion}</code></p>
      {checkingEngine ? <p role="status">{t('正在检查本机引擎…', 'Checking the installed engine…', 'インストール済みエンジンを確認しています…')}</p>
        : engineBlocked ? <p>{t('精确引擎不可用。作品以只读方式打开，补齐该版本后可继续编辑。', 'The exact engine is unavailable. The project opens read-only until this version is available.', '指定のエンジンを利用できません。このバージョンを導入するまで作品は読み取り専用です。')}</p>
        : engineHealth && <p>{t('已找到并验证锁定引擎。', 'The locked engine is installed and verified.', '固定エンジンのインストールを確認しました。')}</p>}
      {engineError && <p role="alert" className="project-library-error">{engineError}</p>}
      {engineHealth?.issues.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}
      <div className="gc-actions">
        <Button disabled={busy || checkingEngine} onClick={() => void run(() => checkEngine(false))}>{t('重新检查引擎', 'Recheck engine', 'エンジンを再確認')}</Button>
        {engineHealth?.issues.some(issue => issue.actions.includes('supplyDependency')) && <Button tone="primary" disabled={busy || checkingEngine} onClick={() => void run(() => checkEngine(true))}>{t('导入精确引擎目录', 'Import exact engine folder', '指定バージョンのエンジンフォルダーを読み込む')}</Button>}
      </div>
    </section>}
    <section className="project-maintenance-section">
      <h2>{t('引擎迁移', 'Engine migration', 'エンジン移行')}</h2>
      <p>{t('用已保存版本准备并验证迁移副本。确认后替换当前目录，保留原副本以便回退。', 'Prepare and validate a migrated copy of the saved project. Confirm to replace the current directory and keep the original copy for rollback.', '保存済みの作品から移行コピーを準備して検証します。確定後は現在のフォルダーを入れ替え、元のコピーを保持します。')}</p>
      {!plan && <>
        <Field label={chooseTarget}><Choice label={chooseTarget} value={target} disabled={busy || loading || !candidates.length} options={[
          { value: '', label: t('选择已安装的兼容引擎', 'Choose an installed compatible engine', 'インストール済みの対応エンジンを選択') },
          ...candidates.map(engine => ({ value: engine.version, label: `galcraft@${engine.version}` })),
        ]} onChange={setTarget}/></Field>
        {!loading && !candidates.length && <p>{t('已安装的引擎没有从此版本迁移的路径。', 'No installed engine offers a migration from this version.', 'このバージョンから移行できるインストール済みエンジンがありません。')}</p>}
        <div className="gc-actions">
          <Button disabled={busy || loading} onClick={() => void run(async () => { const result = await load(); setEngines(result.engines); setHistory(result.history); })}>{t('刷新引擎和记录', 'Refresh engines and history', 'エンジンと履歴を更新')}</Button>
          <Button disabled={busy} onClick={() => void run(async () => { const files = value(await chooseOldSaves()); if (files.length) setSamples(files); })}>{t('选择代表旧档', 'Choose representative saves', '検証用の旧セーブを選択')}</Button>
          {!!samples.length && <Button disabled={busy} tone="quiet" onClick={() => setSamples([])}>{t('清空旧档选择', 'Clear selected saves', 'セーブの選択を解除')}</Button>}
        </div>
        {samples.length ? <ul>{samples.map(sample => <li key={sample}>{sample}</li>)}</ul>
          : <p>{t('验证需要代表旧档和作品中已保存的调试路线。', 'Validation requires representative old saves and a saved debug route in the project.', '検証には旧セーブのサンプルと、作品に保存されたデバッグルートが必要です。')}</p>}
        {source.anyDirty && <p>{needsSave}</p>}
        <div className="gc-actions">
          <Button tone="primary" disabled={busy || !!engineBlocked || !!source.anyDirty || !samples.length || !candidates.some(engine => engine.version === target)} onClick={() => void run(prepare)}>{t('准备并验证迁移', 'Prepare and validate migration', '移行を準備して検証')}</Button>
          {operationId && <Button onClick={() => { void upgrades.cancel(operationId).then(value).catch(reason => setError(String(reason))); }}>{t('取消验证', 'Cancel validation', '検証をキャンセル')}</Button>}
          {operationId && <span role="status">{t('正在验证迁移副本…', 'Validating the migrated copy…', '移行コピーを検証しています…')}</span>}
        </div>
      </>}
      {plan && <>
        <h3>{plan.from} → {plan.to}</h3>
        <dl><dt>{t('原副本', 'Original copy', '元のコピー')}</dt><dd>{plan.originalCopy}</dd>
          <dt>{t('待提交副本', 'Migrated copy', '移行コピー')}</dt><dd>{plan.workingCopy}</dd></dl>
        <details><summary>{t('受影响文件', 'Affected files', '変更対象ファイル')} · {plan.changes.length}</summary>
          <ul>{plan.changes.map(change => <li key={change.file}>{change.file} · {change.description === 'added' ? t('新增', 'Added', '追加') : change.description === 'removed' ? t('移除', 'Removed', '削除') : t('修改', 'Modified', '変更')}</li>)}</ul>
        </details>
        {!!plan.dependencyChanges.length && <details><summary>{t('精确依赖变化', 'Exact dependency changes', '依存パッケージの変更')} · {plan.dependencyChanges.length}</summary>
          <ul>{plan.dependencyChanges.map(change => <li key={change.pluginId}>{change.pluginId} · {change.from ?? '—'} → {change.to ?? '—'}</li>)}</ul>
        </details>}
        <h3>{t('验证结果', 'Validation results', '検証結果')}</h3>
        <ul className="project-maintenance-checks">{plan.validation?.checks.map(check => <li key={`${check.target}:${check.kind}`}>
          <strong>{check.target === 'web' ? 'Web' : check.target === 'windows' ? 'Windows' : check.target} · {checkLabels[check.kind]}</strong> · {check.result === 'pass' ? t('通过', 'Passed', '成功') : check.result === 'fail' ? t('失败', 'Failed', '失敗') : t('未执行', 'Not run', '未実行')}
          {check.issues.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}
        </li>)}</ul>
        {!ready && <p>{t('请处理验证问题，再准备新方案。', 'Resolve validation issues, then prepare a new plan.', '検証の問題を解決して、新しい計画を準備してください。')}</p>}
        <div className="gc-actions"><Button disabled={busy} onClick={() => setPlan(null)}>{t('返回迁移设置', 'Back to migration settings', '移行設定に戻る')}</Button>
          <Button tone="primary" disabled={busy || !!engineBlocked || !ready || !!source.anyDirty} onClick={() => setConfirm({ kind: 'commit', id: plan.id, original: plan.originalCopy })}>{t('确认迁移', 'Confirm migration', '移行を確定')}</Button></div>
      </>}
    </section>
    <section className="project-maintenance-section">
      <h2>{t('维护记录与回退', 'Maintenance history and rollback', 'メンテナンス履歴と復元')}</h2>
      {!history.length && !loading && <p>{t('此作品还没有迁移记录。', 'This project has no migration history.', 'この作品には移行履歴がありません。')}</p>}
      <ul className="project-maintenance-history">{history.map(record => <li key={record.id}>
        <strong>{record.from} → {record.to}</strong> · {record.state === 'committed' ? t('已提交', 'Committed', '確定済み') : record.state === 'restored' ? t('已回退', 'Rolled back', '復元済み') : t('待提交', 'Prepared', '準備済み')}
        <p>{record.originalCopy}</p>
        {record.state === 'committed' && record.to === project.engineVersion && <Button disabled={busy || !!engineBlocked || !!source.anyDirty} onClick={() => setConfirm({ kind: 'restore', id: record.id, original: record.originalCopy })}>{t('回退到此原副本', 'Roll back to this original copy', 'この元のコピーから復元')}</Button>}
      </li>)}</ul>
    </section>
    {confirm && <MessageBox title={confirm.kind === 'commit' ? t('替换当前作品目录？', 'Replace the current project directory?', '現在の作品フォルダーを入れ替えますか？') : t('回退当前作品？', 'Roll back the current project?', '現在の作品を復元しますか？')}
      description={<>{confirm.kind === 'commit' ? t('迁移后仍可从原副本回退。', 'The original copy remains available for rollback.', '移行後も元のコピーから復元できます。') : t('回退前，Studio 会备份当前保存版本。', 'Studio backs up the current saved version before rolling back.', '復元前に現在の保存バージョンをバックアップします。')}<p>{confirm.original}</p></>}
      cancelLabel={t('取消', 'Cancel', 'キャンセル')} onClose={() => { if (!running.current) setConfirm(null); }}
      actions={[{ label: confirm.kind === 'commit' ? t('替换并重开', 'Replace and reopen', '入れ替えて開き直す') : t('回退并重开', 'Roll back and reopen', '復元して開き直す'), tone: 'danger', run: () => run(() => apply(confirm), true) }]}/>}
  </section>;
}
