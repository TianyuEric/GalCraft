import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, FolderCode, Package, Plus, Search, TriangleAlert } from 'lucide-react';
import { pluginDisplayMetadata, type PluginManifest } from '@galcraft/plugins/contracts';
import type { PackageInspection } from '@galcraft/plugins';
import { issueDetails, localizeIssue, type Diagnostic, type Result } from '@galcraft/contracts';
import { contributionStatus, contributionStatusLabels } from '../../../../pages/Plugins/contribution-status.js';
import { pluginCapabilityLabel } from '../../../../pages/Plugins/PluginOverview.js';
import type { StudioPluginHost } from '../../../../pages/Plugins/studio-host.js';
import type { WorkbenchBridge } from '../../../../pages/Production/bridge.js';
import { CandidateButton, CandidateField, CandidateInput, CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateState, CandidateToolbar } from '../controls/index.js';
import { CandidateCodeReadout } from '../collaboration/CandidateCodeReadout.js';

type Value<T> = T extends { ok: true; value: infer V } ? V : never;
type Catalog = Value<Awaited<ReturnType<WorkbenchBridge['plugins']['list']>>>;
type ChangePlan = Value<Awaited<ReturnType<WorkbenchBridge['plugins']['planChange']>>>;
type Entry = Catalog['entries'][number] & { key: string; registration: number; registrations: number };

const unwrap = <T,>(result: Result<T>) => { if (!result.ok) throw new Error(result.error.message); return result.value; };

function catalogEntries(entries: Catalog['entries']): Entry[] {
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  const identity = (entry: Catalog['entries'][number]) => `${entry.manifest.id}/${entry.manifest.version}/${entry.development}`;
  for (const entry of entries) {
    const key = identity(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entries.map(entry => {
    const key = identity(entry);
    const registration = (seen.get(key) ?? 0) + 1;
    seen.set(key, registration);
    return { ...entry, key: `${key}/${registration}`, registration, registrations: counts.get(key) ?? 1 };
  });
}

export function CandidatePluginCatalog({ bridge, projectId, locale, authorHost, active, refreshVersion, changed, children }: {
  bridge: WorkbenchBridge;
  projectId: string;
  locale: string;
  authorHost: StudioPluginHost | null;
  active: boolean;
  refreshVersion: number;
  changed(): Promise<void>;
  children?: ReactNode;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const display = (manifest: PluginManifest) => pluginDisplayMetadata(manifest, locale);
  const [data, setData] = useState<Catalog>();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [plan, setPlan] = useState<ChangePlan>();
  const [mode, setMode] = useState<'install' | 'development'>();
  const [path, setPath] = useState('');
  const [inspection, setInspection] = useState<PackageInspection>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const refresh = useCallback(async () => setData(unwrap(await bridgeRef.current.plugins.list())), []);
  useEffect(() => {
    let active = true;
    void bridgeRef.current.plugins.list().then(result => {
      if (active) setData(unwrap(result));
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [refreshVersion]);
  const run = async (action: () => Promise<void>, reload = false) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
      if (reload) await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const entries = catalogEntries(data?.entries ?? []);
  const installed = entries.filter(entry => !entry.studioService);
  const bundled = entries.filter(entry => entry.studioService);
  const missing = data?.lock?.plugins.filter(plugin => !entries.some(entry => entry.manifest.id === plugin.id && entry.manifest.version === plugin.version)) ?? [];
  const entry = entries.find(item => item.key === selected);
  const missingEntry = missing.find(item => `missing/${item.id}` === selected);
  const manifest = entry?.manifest;
  const enabled = data?.lock?.plugins.find(plugin => plugin.id === manifest?.id)?.version;
  const hostState = manifest && authorHost?.inspect(manifest.id);
  const isEnabled = !!manifest && enabled === manifest.version;
  const select = (id: string) => { setSelected(id); setPlan(undefined); setError(''); setStatus(''); };
  const filter = query.trim().toLocaleLowerCase();
  const matches = (...values: string[]) => !filter || values.some(value => value.toLocaleLowerCase().includes(filter));
  const filtered = (items: Entry[]) => items.filter(item => matches(item.manifest.id, item.manifest.version, display(item.manifest).name));
  const missingFiltered = missing.filter(item => matches(item.id, item.version));
  const openInstall = (next: typeof mode) => { setError(''); setStatus(''); setMode(next); setInspection(undefined); };
  const packageSource = () => ({ kind: /\.(zip|galplugin)$/i.test(path) ? 'archive' as const : 'directory' as const, path });
  const changeLabel = isEnabled ? t('停用此版本…', 'Disable this version…', 'このバージョンを無効化…') : enabled
    ? t('切换到此版本…', 'Switch to this version…', 'このバージョンに切替…') : t('启用到作品…', 'Enable in project…', '作品で有効化…');
  const reviewImpact = () => manifest && !entry?.studioService && void run(async () => {
    setPlan(unwrap(await bridge.plugins.planChange({ pluginId: manifest.id, version: isEnabled ? null : manifest.version })));
  });
  const packageList = (title: string, items: Entry[]) => !!items.length && <CandidateSection title={<>{title}<small>{items.length}</small></>}>
    {items.map(item => {
      const itemEnabled = data?.lock?.plugins.some(plugin => plugin.id === item.manifest.id && plugin.version === item.manifest.version);
      return <CandidateObjectRow key={item.key} icon={<Package size={15}/>} title={display(item.manifest).name} active={item.key === selected}
        metadata={<>{item.manifest.version}{item.registrations > 1 && ` · ${item.registration}/${item.registrations}`}</>}
        actions={!item.studioService && <span className="candidate-plugin-state" data-enabled={itemEnabled || undefined}>{itemEnabled
          ? t('已启用', 'Enabled', '有効') : t('未启用', 'Disabled', '無効')}</span>}
        onActivate={() => { if (!running.current) select(item.key); }}/>;
    })}
  </CandidateSection>;
  const selectPath = () => void run(async () => {
    const path = mode === 'development'
      ? bridge.files.chooseImport ? unwrap(await bridge.files.chooseImport({ purpose: 'packages', directory: true }))[0] : unwrap(await bridge.projects.chooseDirectory())
      : unwrap(await (bridge.files.chooseImport ? bridge.files.chooseImport({ purpose: 'packages', extensions: ['galplugin', 'zip'] }) : bridge.files.pickAssets()))[0];
    if (path) { setPath(path); setInspection(undefined); }
  });
  const install = () => void run(async () => {
    if (mode === 'development') {
      unwrap(await bridge.plugins.loadDevelopment({ directory: path, projectId }));
      setStatus(t('开发目录已登记', 'Development directory registered', '開発ディレクトリを登録しました'));
    } else if (!inspection) {
      setInspection(unwrap(await bridge.plugins.inspectPackage(packageSource())) as PackageInspection);
      return;
    } else {
      unwrap(await bridge.plugins.install(packageSource()));
      setStatus(t('插件已安装到本机', 'Plugin installed locally', 'プラグインをインストールしました'));
    }
    setMode(undefined);
    await refresh();
  });
  const cancel = t('取消', 'Cancel', 'キャンセル');
  const issues = (items: readonly Diagnostic[]) => items.map((issue, index) => {
    const explanation = localizeIssue(issue, locale);
    return <div className="candidate-plugin-issue" data-severity={issue.severity ?? 'error'} key={`${issue.code}/${index}`}>
      <p role={issue.severity === 'info' ? 'status' : 'alert'}>{explanation}</p>
      {(issue.severity === undefined || issue.severity === 'error') && explanation !== issue.message && <p>{issue.message}</p>}
      <CandidateSection collapsible initiallyOpen={false} title={t('诊断详情', 'Diagnostic details', '診断の詳細')}>
        <CandidateCodeReadout code={issueDetails(issue)} locale={locale}/>
      </CandidateSection>
    </div>;
  });
  return <div className="candidate-plugin-catalog">
    <CandidateToolbar label={t('插件管理', 'Manage plugins', 'プラグイン管理')} className="candidate-plugin-toolbar">
      <CandidateButton variant="primary" disabled={busy} onClick={() => openInstall('install')}><Plus size={15} aria-hidden="true"/>{t('安装插件', 'Install plugin', 'プラグインを追加')}</CandidateButton>
      <CandidateButton variant="outline" disabled={busy} onClick={() => openInstall('development')}><FolderCode size={15} aria-hidden="true"/>{t('开发目录', 'Development directory', '開発ディレクトリ')}</CandidateButton>
      <p>{t('浏览器登记样例包。保存作品后保留启用的精确版本。', 'This browser registers sample packages. Saving the project persists its exact enabled versions.', 'ブラウザーでサンプルパッケージを登録します。作品を保存すると有効な正確なバージョンを保持します。')}</p>
    </CandidateToolbar>
    {!mode && !plan && error && <CandidateState kind="error" title={error} action={<CandidateButton onClick={() => void run(refresh)}>{t('重新读取插件', 'Reload plugins', 'プラグインを再読込')}</CandidateButton>}/>}
    {status && <p className="candidate-plugin-feedback" role="status">{status}</p>}
    {!data && !error && <CandidateState kind="loading" title={t('正在读取插件', 'Loading plugins', 'プラグインを読み込み中')}/>}
    {data && <div className="candidate-plugin-workspace">
      <aside className="candidate-plugin-index" aria-label={t('本机插件与作品依赖', 'Installed plugins and dependencies', 'ローカルプラグインと作品の依存関係')}>
        <div className="candidate-plugin-search"><Search size={15} aria-hidden="true"/><CandidateInput type="search"
          aria-label={t('搜索插件', 'Search plugins', 'プラグインを検索')} placeholder={t('搜索插件', 'Search plugins', 'プラグインを検索')}
          value={query} onChange={event => setQuery(event.target.value)}/></div>
        {packageList(t('本机已安装', 'Installed locally', 'インストール済み'), filtered(installed))}
        {packageList(t('Studio 默认装配', 'Provided by Studio', 'Studio 標準搭載'), filtered(bundled))}
        {!!missingFiltered.length && <CandidateSection title={<>{t('缺失的作品依赖', 'Missing project dependencies', '不足している作品の依存関係')}<small>{missingFiltered.length}</small></>}>
          {missingFiltered.map(item => <CandidateObjectRow key={item.id} icon={<TriangleAlert size={15}/>} title={item.id} metadata={item.version}
            active={selected === `missing/${item.id}`} onActivate={() => { if (!running.current) select(`missing/${item.id}`); }}/>)}
        </CandidateSection>}
        {!filtered(installed).length && !filtered(bundled).length && !missingFiltered.length &&
          <CandidateState kind="empty" title={filter ? t('没有匹配的插件', 'No matching plugins', '一致するプラグインがありません') : t('本机尚未安装插件', 'No plugins installed locally', 'プラグインはありません')}/>}
      </aside>
      <div className="candidate-plugin-details">
        {plan && <CandidateSection title={t('插件变更影响', 'Plugin change impact', 'プラグイン変更の影響')} className="candidate-plugin-impact">
          <p>{t('确认会更新作品工作内容。保存作品后保留精确依赖。', 'Confirmation updates working content. Saving the project persists the exact dependency.', '確定すると作業内容が更新されます。作品を保存すると正確な依存関係を保持します。')}</p>
          {plan.change.changes.map(change => <div className="candidate-plugin-change" key={change.pluginId}>
            <h3>{entries.find(item => item.manifest.id === change.pluginId) ? display(entries.find(item => item.manifest.id === change.pluginId)!.manifest).name : change.pluginId}</h3>
            <p className="candidate-plugin-version">{change.from ?? t('未启用', 'Not enabled', '無効')}<ArrowRight size={14} aria-hidden="true"/><strong>{change.to ?? t('停用', 'Disabled', '無効')}</strong></p>
            <dl className="candidate-plugin-facts">
              <dt>{t('关联文档', 'Affected documents', '関連文書')}</dt><dd>{change.affected.length}</dd>
              <dt>{t('涉及资料', 'Data scope', 'データ範囲')}</dt><dd>{change.savedData.map(kind => ({
                document: t('作品文档', 'Documents', '作品文書'), progress: t('游戏进度', 'Progress', 'ゲーム進行'), longTerm: t('长期资料', 'Long-term data', '長期データ'),
              })[kind] ?? kind).join(' · ') || '—'}</dd>
              <dt>{t('目标依赖', 'Target dependencies', '変更後の依存関係')}</dt><dd>{change.dependencies.map(item => `${item.id} · ${item.version}`).join(' · ') || '—'}</dd>
            </dl>
            {issues(change.issues)}
          </div>)}
          <CandidateSection title={t('展开完整影响清单', 'Full impact details', '影響の詳細を表示')} collapsible initiallyOpen={false}>
            <CandidateCodeReadout code={JSON.stringify(plan.change.changes, null, 2)} locale={locale} language="json"/>
          </CandidateSection>
          {error && <CandidateState kind="error" title={error}/>}
          <CandidateToolbar label={t('变更操作', 'Change actions', '変更操作')}>
            <CandidateButton disabled={busy} onClick={() => { setPlan(undefined); setError(''); }}>{cancel}</CandidateButton>
            <CandidateButton variant="primary" disabled={busy} onClick={() => void run(async () => {
              unwrap(await bridge.documents.applyEdit(plan.edit.planId, plan.edit.input.expected));
              setPlan(undefined);
              setStatus(t('已更新作品插件依赖', 'Project plugin dependencies updated', '作品のプラグイン依存関係を更新しました'));
              await changed();
            }, true)}>{t('确认变更', 'Confirm change', '変更を確認')}</CandidateButton>
          </CandidateToolbar>
        </CandidateSection>}
        {!plan && manifest && entry && <CandidateSection title={display(manifest).name} className="candidate-plugin-package"
          actions={!entry.studioService && <CandidateButton variant="primary" disabled={busy} onClick={reviewImpact}>{changeLabel}<ArrowRight size={14} aria-hidden="true"/></CandidateButton>}>
          <p>{display(manifest).description}</p>
          <dl className="candidate-plugin-facts">
            <dt>{t('包版本', 'Package version', 'パッケージのバージョン')}</dt><dd>{manifest.version}</dd>
            <dt>{t('支持目标', 'Targets', '対象')}</dt><dd>{manifest.targets.join(' / ')}</dd>
            <dt>{t('本机状态', 'Local status', 'ローカル状態')}</dt><dd>{entry.studioService
              ? t('Studio 默认装配', 'Provided by Studio', 'Studio 標準搭載') : entry.development
                ? t('开发目录', 'Development directory', '開発ディレクトリ') : t('已安装', 'Installed', 'インストール済み')}</dd>
            {!entry.studioService && <><dt>{t('作品锁定', 'Project lock', '作品の固定バージョン')}</dt><dd>{enabled ?? t('未启用', 'Not enabled', '無効')}</dd></>}
            {entry.registrations > 1 && <><dt>{t('本机登记', 'Local registration', 'ローカル登録')}</dt><dd>{entry.registration} / {entry.registrations}</dd></>}
          </dl>
          {entry.studioService && <p>{t('制作时按需加载，在「制作 → 服务连接」配置。', 'Loaded on demand. Configure in Production → Service connections.', '制作時に読み込みます。「制作 → サービス接続」で設定します。')}</p>}
          <CandidateSection title={t('贡献与诊断', 'Contributions and diagnostics', 'コントリビューションと診断')}>
            <p>{t('这里显示编辑端状态。宿主服务与运行时在实际使用时加载。', 'Editor status is shown here. Host and runtime contributions load on demand.', '編集環境の状態を表示します。ホストと実行環境の機能は必要時に読み込みます。')}</p>
            {[...manifest.contributions.map(item => ({ key: item.key, kind: item.kind, target: item.targets.join(' / ') })),
              ...(manifest.studio ?? []).map(item => ({ key: item.key, kind: item.kind, target: item.slot }))].map(item => {
              const state = contributionStatus(manifest, item, !!entry.studioService || isEnabled, hostState);
              const label = contributionStatusLabels[state];
              return <div className="candidate-plugin-contribution" key={item.key}>
                <div><strong>{pluginCapabilityLabel(item.kind, locale)}</strong><small>{item.target}</small><code>{item.key}</code></div>
                <span className="candidate-plugin-state" data-enabled={state === 'active' || state === 'definition' || undefined}>{t(label[0], label[1], label[2])}</span>
              </div>;
            })}
            {hostState?.loadError && <CandidateState kind="error" title={hostState.loadError}/>}
            {issues(hostState?.issues ?? [])}
          </CandidateSection>
          <CandidateSection title={t('包身份与入口', 'Package identity and entries', 'パッケージIDとエントリー')} collapsible initiallyOpen={false}>
            <CandidateCodeReadout code={JSON.stringify({ id: manifest.id, version: manifest.version, targets: manifest.targets, stateVersions: manifest.stateVersions,
              studioVersion: hostState?.manifest?.version ?? null, schemaVersion: manifest.schemaVersion, sdkMajor: manifest.sdkMajor, entry: manifest.entry }, null, 2)} locale={locale} language="json"/>
          </CandidateSection>
        </CandidateSection>}
        {!plan && missingEntry && <CandidateState kind="error" title={t('缺少作品依赖', 'Project dependency missing', '作品の依存関係がありません')}
          description={<><code>{missingEntry.id} · {missingEntry.version}</code><p>{t('安装作品锁定的精确版本后重新检查。', 'Install the exact locked version, then check again.', '固定された正確なバージョンを導入して確認してください。')}</p></>}
          action={<CandidateButton onClick={() => openInstall('install')}>{t('安装插件', 'Install plugin', 'プラグインを追加')}</CandidateButton>}/>}
        {!plan && !entry && !missingEntry && <CandidateState kind="empty" title={t('选择插件', 'Select a plugin', 'プラグインを選択')}
          description={t('选择登记包查看版本、贡献和作品启用状态。', 'Select a registered package to see its version, contributions and project status.', 'パッケージを選択してバージョン、機能、作品の状態を確認します。')}/>}
        {children}
      </div>
    </div>}
    <CandidateReviewDialog open={active && !!mode} busy={busy}
      title={mode === 'development' ? t('加载开发目录', 'Load development directory', '開発ディレクトリを読み込む') : t('安装插件包', 'Install package', 'パッケージを追加')}
      onDismiss={() => { setMode(undefined); setError(''); }}
      actions={<CandidateToolbar label={t('安装操作', 'Install actions', 'インストール操作')}>
        <CandidateButton disabled={busy} onClick={() => { setMode(undefined); setError(''); }}>{cancel}</CandidateButton>
        <CandidateButton variant="primary" disabled={busy || !path.trim()} onClick={install}>{inspection
          ? t('确认安装', 'Confirm install', 'インストールを確認') : t('检查', 'Inspect', '確認')}</CandidateButton>
      </CandidateToolbar>}>
      <div className="candidate-plugin-install-form">
        <CandidateField label={t('本机路径', 'Local path', 'ローカルパス')}>
          {props => <><CandidateInput {...props} disabled={busy} value={path} onChange={event => { setPath(event.target.value); setInspection(undefined); }}/>
            <CandidateButton density="standard" variant="outline" disabled={busy} onClick={selectPath}>{mode === 'development'
              ? t('选择目录', 'Choose directory', 'ディレクトリを選択') : t('选择文件', 'Choose file', 'ファイルを選択')}</CandidateButton></>}
        </CandidateField>
        {inspection && <CandidateSection title={display(inspection.manifest).name}>
          <p>{display(inspection.manifest).description}</p>
          <dl className="candidate-plugin-facts">
            <dt>{t('包身份', 'Package ID', 'パッケージ ID')}</dt><dd>{inspection.manifest.id} · {inspection.manifest.version}</dd>
            <dt>{t('支持目标', 'Targets', '対象')}</dt><dd>{inspection.manifest.targets.join(' / ')}</dd>
            <dt>{t('已安装版本', 'Installed version', 'インストール済み')}</dt><dd>{inspection.installedVersion ?? t('尚未安装', 'Not installed', '未インストール')}</dd>
          </dl>
          {issues(inspection.issues)}
          <CandidateSection title={t('包清单详情', 'Package manifest', 'パッケージの詳細')} collapsible initiallyOpen={false}>
            <CandidateCodeReadout code={JSON.stringify(inspection.manifest, null, 2)} locale={locale} language="json"/>
          </CandidateSection>
        </CandidateSection>}
        {error && mode && <CandidateState kind="error" title={error}/>}
      </div>
    </CandidateReviewDialog>
  </div>;
}
