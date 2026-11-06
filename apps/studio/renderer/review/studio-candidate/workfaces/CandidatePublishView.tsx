import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import { createId, issueDetails, localizeIssue, type BuildInput, type BuildReceipt, type Issue, type Target } from '@galcraft/contracts';
import { workbenchBridge } from '../../../pages/Production/bridge.js';
import { candidateReleaseVersions, subscribeCandidateRelease } from '../adapters/candidate-release-host.js';
import { useCandidateState } from '../application/context.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateInput, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { resultValue, useFormalSource, workfaceError, type CandidateWorkfaceProps } from './workface-helpers.js';
import '../styles/support.css';

const targets: Target[] = ['web', 'windows', 'android', 'ios'];
const targetLabel = (target: Target) => ({ web: 'Web', windows: 'Windows', android: 'Android', ios: 'iOS' })[target];
type ReleaseOptions = { target: Target; outputDirectory: string; version: 'saved' | 'working'; live2d: NonNullable<BuildInput['live2d']> };
const initialOptions: ReleaseOptions = { target: 'web', outputDirectory: '', version: 'saved', live2d: { purpose: 'distribution', licenseConfirmed: false } };
type Checked = { key: string; version: string; plan: { planId: string; issues: Issue[] } };
type ReleaseResult = { key: string; planId: string; receipt: BuildReceipt };

function ReleaseIssue({ issue, locale, recovery }: { issue: Issue; locale: string; recovery?: { label: string; run(): void } }) {
  const explanation = localizeIssue(issue, locale);
  const details = locale === 'en' ? 'Diagnostic details' : locale === 'ja' ? '診断の詳細' : '诊断详情';
  return <div className="candidate-support-issue" data-severity={issue.severity}>
    <p role={issue.severity === 'info' ? 'status' : 'alert'}>{explanation}</p>
    {issue.severity === 'error' && explanation !== issue.message && <p>{issue.message}</p>}
    {recovery && <CandidateButton variant="outline" onClick={recovery.run}>{recovery.label}</CandidateButton>}
    <details><summary>{details}</summary><pre>{issueDetails(issue)}</pre></details>
  </div>;
}

export function CandidatePublishView({ onNavigate }: CandidateWorkfaceProps) {
  const { store, source, error: sourceError } = useFormalSource();
  const { activeView } = useCandidateState();
  const [options, setOptions] = useState(() => store.viewState<ReleaseOptions>('publish:options') ?? initialOptions);
  const [checked, setChecked] = useState<Checked>();
  const [result, setResult] = useState<ReleaseResult>();
  const [replace, setReplace] = useState<Checked>();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<Issue[]>([]);
  const [phase, setPhase] = useState<'check' | 'build' | 'assets' | 'output'>();
  const running = useRef(false);
  const building = useRef<string | null>(null);
  const output = useRef<HTMLInputElement>(null);
  const bridge = workbenchBridge(store.services.bridge);
  const locale = store.controller.preferences.locale;
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const documents = store.host.list();
  const projectDoc = documents.find(doc => 'project.json' in doc.savedFiles);
  const saved = projectDoc?.savedFiles['project.json'];
  const savedProject = saved ? JSON.parse(saved).data as NonNullable<typeof source>['project'] : null;
  const savedVersion = savedProject?.releaseVersion;
  const workingVersion = source?.project.releaseVersion;
  const newVersion = !!workingVersion && workingVersion !== savedVersion;
  const savedVersions = candidateReleaseVersions(documents);
  const key = JSON.stringify([options, savedVersions]);
  const versionBlocked = options.version === 'working' && newVersion;
  const stale = !!checked && checked.key !== key;
  const live2d = documents.some(doc => {
    const raw = doc.savedFiles['dependencies.lock.json'];
    if (!raw) return false;
    const lock = JSON.parse(raw).data as { live2dRuntime?: unknown; plugins?: { id: string }[] };
    return !!lock.live2dRuntime || lock.plugins?.some(plugin => plugin.id === 'org.galcraft.live2d');
  });
  const busy = phase !== undefined;
  useEffect(() => subscribeCandidateRelease(bridge.builds, notice => setFeedback(notice.message)), [bridge.builds]);
  useEffect(() => {
    if (activeView === 'publish' && source && store.getSnapshot().commandTarget !== source.projectDocumentId) store.target(source.projectDocumentId);
  }, [activeView, source, store]);

  const update = (next: Partial<ReleaseOptions>) => {
    const value = { ...options, ...next };
    setOptions(value);
    store.rememberViewState('publish:options', value);
    setError('');
    setDiagnostics([]);
    setFeedback('');
  };
  const run = async (nextPhase: typeof phase, action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setPhase(nextPhase);
    setError('');
    setFeedback('');
    setDiagnostics([]);
    try { await action(); }
    catch (reason) { setError(workfaceError(reason)); }
    finally { running.current = false; setPhase(undefined); }
  };
  const build = async (selection: Checked) => {
    building.current = selection.plan.planId;
    setPhase('build');
    try {
      const receipt = resultValue(await bridge.builds.build(selection.plan.planId));
      setResult({ key: selection.key, planId: selection.plan.planId, receipt });
      setChecked(undefined);
    } catch (reason) {
      setChecked(undefined);
      throw reason;
    } finally { building.current = null; }
  };
  const check = (thenBuild: boolean) => void run('check', async () => {
    if (versionBlocked || !savedProject) throw new Error(t('请先保存选中的发行版本，再重新检查。', 'Save the selected release version and check again.', '選択した配布バージョンを保存して再確認してください。'));
    const directory = options.outputDirectory.trim();
    if (!directory) {
      output.current?.focus();
      throw new Error(t('请填写或选择输出目录。', 'Enter or choose an output directory.', '出力先のフォルダーを指定してください。'));
    }
    const reusable = thenBuild && checked?.key === key && !checked.plan.issues.some(issue => issue.severity === 'error') ? checked : undefined;
    if (reusable) {
      if (reusable.plan.issues.some(issue => issue.code === 'CANDIDATE_BUILD_REPLACE')) setReplace(reusable);
      else await build(reusable);
      return;
    }
    setChecked(undefined);
    const compiled = await store.services.compilePreview!(true, documents);
    if (!compiled.ok) { setDiagnostics(compiled.issues); return; }
    const snapshot = compiled.value.snapshot;
    if (!snapshot) {
      setDiagnostics(compiled.value.issues);
      throw new Error(t('已保存版本编译失败。修复问题并保存后重新检查。', 'The saved release failed to compile. Fix, save, and check again.', '保存済みバージョンのコンパイルに失敗しました。修正して保存後、再確認してください。'));
    }
    const planned = await bridge.builds.planBuild({
      projectId: snapshot.projectId, target: options.target, outputDirectory: directory, releaseVersion: snapshot.releaseVersion,
      snapshotId: snapshot.snapshotId, savedVersions, keepAssets: [], platformPolicy: {},
      font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [], live2d: options.live2d,
    });
    if (!planned.ok) {
      setDiagnostics(planned.issues);
      throw new Error(planned.error.message);
    }
    const plan = planned.value;
    const selection = { key, version: snapshot.releaseVersion, plan };
    setChecked(selection);
    if (!thenBuild || plan.issues.some(issue => issue.severity === 'error')) return;
    if (plan.issues.some(issue => issue.code === 'CANDIDATE_BUILD_REPLACE')) { setReplace(selection); return; }
    await build(selection);
  });
  const verifyAssets = () => void run('assets', async () => {
    const verified = resultValue(await bridge.assets.verifyTarget(options.target, createId()));
    setDiagnostics(verified.issues);
    await store.refreshFromHost();
    setFeedback(t('已更新目标素材验证。审阅并保存修改后重新检查。', 'Target asset checks updated. Review and save changes before rechecking.', '対象素材の検証を更新しました。変更を確認して保存後、再確認してください。'));
  });
  const exportReceipt = (receipt: BuildReceipt) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ environment: 'candidate-review', receipt }, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `GalCraft-${receipt.releaseVersion}-${receipt.target}-review.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!source) return <CandidateState kind={sourceError ? 'error' : 'loading'} title={sourceError || t('正在读取发行配置', 'Reading release configuration', '配布設定を読み込み中')}/>;
  const issues = [...diagnostics, ...(stale ? [] : checked?.plan.issues ?? [])];
  const blocked = issues.some(issue => issue.severity === 'error');
  return <section className="candidate-support-view candidate-release-view" aria-label={t('发布', 'Publish', '配布')}>
    <div className="candidate-support-scroll candidate-release-content">
      <header className="candidate-support-heading">
        <h2>{t('发布', 'Publish', '配布')}</h2>
        <p>{source.project.name} · {t('候选审核宿主', 'Candidate review host', '候補レビュー環境')}</p>
      </header>
      <CandidateSection title={t('目标与保存版本', 'Target and saved release', '対象と保存済みバージョン')}>
        <div className="candidate-support-fields">
          <CandidateField label={t('发行目标', 'Release target', '配布対象')}>
            <CandidateSelect disabled={busy} value={options.target} onValueChange={selectedValue => update({ target: selectedValue as Target })}>
              {targets.map(target => <option key={target} value={target}>{targetLabel(target)}</option>)}
            </CandidateSelect>
          </CandidateField>
          <CandidateField label={t('发行版本', 'Release version', '配布バージョン')}>
            <CandidateSelect disabled={busy} value={newVersion ? options.version : 'saved'} onValueChange={selectedValue => update({ version: selectedValue as ReleaseOptions['version'] })}>
              <option value="saved">{savedVersion ?? '—'} · {t('上次保存', 'Last saved', '前回の保存')}</option>
              {newVersion && <option value="working">{workingVersion} · {t('待保存', 'Unsaved', '未保存')}</option>}
            </CandidateSelect>
          </CandidateField>
        </div>
        <div className="candidate-support-output">
          <CandidateField label={t('输出目录', 'Output directory', '出力先フォルダー')}>
            <CandidateInput ref={output} disabled={busy} value={options.outputDirectory} onChange={event => update({ outputDirectory: event.target.value })}/>
          </CandidateField>
          <CandidateButton variant="outline" disabled={busy} onClick={() => void run('output', async () => {
            const directory = resultValue(await bridge.projects.chooseDirectory());
            if (directory) update({ outputDirectory: directory });
          })}><FolderOpen size={14} aria-hidden="true"/>{t('选择目录', 'Choose directory', 'フォルダーを選択')}</CandidateButton>
        </div>
        {(documents.some(document => document.dirty) || versionBlocked) && <div className="candidate-support-feedback" role="status">
          <p>{versionBlocked ? t('所选版本尚未保存。', 'The selected release is unsaved.', '選択した配布バージョンは未保存です。')
            : t('工作区有未保存的修改。检查与构建读取上次保存的内容。', 'Checks and builds use the last saved content. Working changes are unsaved.', '確認と構築には前回の保存内容を使用します。作業中の変更は未保存です。')}</p>
          <CandidateButton variant="outline" disabled={busy} onClick={() => void store.reviewSave()}>{t('审阅待保存修改', 'Review changes to save', '保存する変更を確認')}</CandidateButton>
        </div>}
        {live2d && <div className="candidate-support-fields">
          <CandidateField label="Live2D">
            <CandidateSelect disabled={busy} value={options.live2d.purpose} onValueChange={selectedValue => update({ live2d: { ...options.live2d, purpose: selectedValue as ReleaseOptions['live2d']['purpose'] } })}>
              <option value="distribution">{t('发行', 'Distribution', '配布')}</option><option value="localTest">{t('本机验收', 'Local review', 'ローカル確認')}</option>
            </CandidateSelect>
          </CandidateField>
          {options.live2d.purpose === 'distribution' && <label className="candidate-support-check">
            <CandidateCheckbox disabled={busy} checked={options.live2d.licenseConfirmed} onChange={event => update({ live2d: { ...options.live2d, licenseConfirmed: event.target.checked } })}/>
            {t('已确认 Live2D SDK 发布资格', 'Confirm Live2D SDK distribution eligibility', 'Live2D SDK の配布資格を確認済み')}
          </label>}
        </div>}
      </CandidateSection>
      <CandidateSection title={t('检查与构建', 'Check and build', '確認と構築')}>
        <CandidateToolbar label={t('发行操作', 'Release actions', '配布操作')}>
          <CandidateButton variant="primary" disabled={busy} onClick={() => check(true)}>{t('检查并构建', 'Check and build', '確認して構築')}</CandidateButton>
          <CandidateButton variant="outline" disabled={busy} onClick={() => check(false)}>{t('仅检查', 'Check only', '確認のみ')}</CandidateButton>
          <CandidateButton disabled={busy} onClick={verifyAssets}>{t('验证目标素材', 'Verify target assets', '対象素材を検証')}</CandidateButton>
          {phase === 'build' && <CandidateButton onClick={() => {
            if (building.current) void bridge.builds.cancel(building.current).then(resultValue).catch(reason => setError(workfaceError(reason)));
          }}>{t('取消构建', 'Cancel build', '構築をキャンセル')}</CandidateButton>}
        </CandidateToolbar>
        {phase && <p role="status">{phase === 'build' ? t('正在生成审核回执…', 'Generating review receipt…', 'レビュー結果を生成中…')
          : phase === 'assets' ? t('正在验证素材…', 'Verifying assets…', '素材を検証中…') : t('正在读取发行配置…', 'Reading release configuration…', '配布設定を読み込み中…')}</p>}
        {error && <p className="candidate-support-feedback" role="alert">{error}</p>}
        {feedback && <p className="candidate-support-feedback" role="status">{feedback}</p>}
        {stale && <p role="status">{t('配置或保存版本已变化。请重新检查。', 'Configuration or saved content changed. Check again.', '設定または保存内容が変更されました。再確認してください。')}</p>}
        {checked && !stale && <p role="status">{blocked
          ? t('存在发行阻断。处理后重新检查。', 'Resolve release blockers and check again.', '配布の問題を修正して再確認してください。')
          : t('检查通过', 'Checks passed', '確認済み') + ' · ' + checked.version}</p>}
        {!!issues.length && <div className="candidate-support-issues">
          {issues.map((issue, index) => <ReleaseIssue key={issue.code + index} issue={issue} locale={locale}
            recovery={onNavigate && (issue.owner === 'M04' ? { label: t('查看素材', 'Review assets', '素材を確認'), run: () => onNavigate('assets') }
              : issue.code === 'CANDIDATE_SIGNING_CERTIFICATE' ? { label: t('打开发行设置', 'Open release settings', '配布設定を開く'), run: () => onNavigate('settings') }
              : undefined) || undefined}/>)}
        </div>}
      </CandidateSection>
      {result && <CandidateSection title={t('构建审核回执', 'Build review receipt', '構築レビュー結果')}>
        <p role="status">{result.receipt.releaseVersion} · {targetLabel(result.receipt.target)} · {result.key !== key ? t('上次构建', 'Previous build', '前回の構築') : t('审核构建完成', 'Review build complete', 'レビュー構築完了')}</p>
        <p className="candidate-support-path">{result.receipt.handoff.path}</p>
        <p>{t('本机试玩未执行。回执记录候选宿主检查的目标和保存版本。', 'Local playtest was not run. The receipt records the checked target and saved version.', 'ローカル試遊は未実行です。結果には確認した対象と保存バージョンが記録されます。')}</p>
        <CandidateToolbar label={t('审核回执操作', 'Review receipt actions', 'レビュー結果の操作')}>
          <CandidateButton variant="outline" onClick={() => exportReceipt(result.receipt)}><Download size={14} aria-hidden="true"/>{t('下载审核回执', 'Download review receipt', 'レビュー結果をダウンロード')}</CandidateButton>
          <CandidateButton disabled={busy} onClick={() => void run('output', async () => { resultValue(await bridge.builds.instructions(result.planId)); })}>{t('查看交付说明', 'Review handoff instructions', '引き渡し手順を確認')}</CandidateButton>
        </CandidateToolbar>
      </CandidateSection>}
    </div>
    <CandidateReviewDialog open={!!replace} title={t('替换已有审核回执？', 'Replace existing review receipt?', '既存のレビュー結果を置き換えますか？')}
      description={replace?.plan.issues.find(issue => issue.code === 'CANDIDATE_BUILD_REPLACE')?.message} onDismiss={() => setReplace(undefined)} actions={<>
        <CandidateButton onClick={() => setReplace(undefined)}>{t('取消', 'Cancel', 'キャンセル')}</CandidateButton>
        <CandidateButton variant="primary" onClick={() => {
          if (!replace) return;
          setReplace(undefined);
          void run('build', async () => {
            if (replace.key !== key) throw new Error(t('配置已变化，请重新检查。', 'Configuration changed. Check again.', '設定が変わりました。再確認してください。'));
            await build(replace);
          });
        }}>{t('确认替换并构建', 'Replace and build', '置き換えて構築')}</CandidateButton>
      </>}/>
  </section>;
}
