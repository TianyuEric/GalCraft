import { createId, VersionSchema, ProjectSchema, type BuildInput, type Issue, type Result, type Target, type TargetCapability } from '@galcraft/contracts';
import { Input } from '../../components/ui/input.js';
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Globe,
  Monitor,
  Smartphone,
  FolderOpen,
  ArrowRight,
  CircleAlert,
  RotateCcw, Check,
} from "lucide-react";
import type { AuthoringServices } from "../../authoring/controller.js";
import type { AuthoringSource } from "../../authoring/controller.js";
import { Button, Badge, Field, Choice, Modal } from "../../components/controls.js";
import {
  workbenchBridge,
  type BuildReceipt,
} from "../Production/bridge.js";
import { issueSettingsSection, localTestLabel } from './publish-state.js';
import { publishIdentityChanges, PublishHistoryPaths, publishIdentityBase, mergePublishIdentity, type PublishIdentityBase } from './publish-identity.js';
import { issueText } from '../../components/issue-text.js';
import { IssueNotice } from '../../components/issue-notice.js';
import { VerificationAssetList } from './VerificationAssetList.js';
import { AssetVerificationStatus } from './AssetVerificationStatus.js';
import { SteamAppIdEditor } from './SteamAppIdEditor.js';
import { MobileTargetOptions, initialMobileOptions, type MobileDrafts } from './MobileTargetOptions.js';
import './publish.css';
import { tr } from "../Production/Production.js";
export type PublishGuiDraft = {
  identityBase?:PublishIdentityBase;target:import('@galcraft/contracts').Target;mobile?:MobileDrafts;output:string;fontMode:'full'|'subsetStatic';fallbackAssetId:string|null;keepAssets:string[];
  steamAppId?:string;steamRequired:boolean;live2dPurpose:'localTest'|'distribution';live2dLicenseConfirmed:boolean;
  entryMappings:import('@galcraft/contracts').EntryMapping[];version:string;brandName:string;executableName:string;
  publisher:string;brandIcon:string;windowsSigning:'unsigned'|'certificate';certificate:string;
};
type ReleaseSettings = 'assets' | 'compatibility' | 'platform';
type PublishView = 'release' | ReleaseSettings | 'engine';
type CheckedRelease = { planId: string; issues: Issue[]; capabilityResults?: TargetCapability[]; input: BuildInput };
export type ReleaseCheckState = 'checking' | 'complete' | 'failed' | 'stale';

const sameIssueValue = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right))
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameIssueValue(value, right[index]));
  const entries = Object.entries(left), other = right as Record<string, unknown>;
  return entries.length === Object.keys(other).length && entries.every(([key, value]) => Object.hasOwn(other, key) && sameIssueValue(value, other[key]));
};
const failureIssues = ({ error, issues }: Extract<Result<unknown>, { ok: false }>): Issue[] =>
  // Service transport gives error and its entry in issues separate object identities.
  issues.some(issue => sameIssueValue(issue, error)) ? issues : [error, ...issues];

export function Publish({
  services,
  source,
  locale,
  changed,
  saveAll,
  documentActive = true, locateSource, onUnappliedChange, guiDraft, onGuiDraftChange, onHistoryReady,
  onCheckIssues, onRecheckReady, onBuildStarted, onBuildReceipt, onBuildFailure, lastBuild, openProjectMaintenance, locateDependency,
}: {
  services: AuthoringServices;
  source: AuthoringSource;
  locale: string;
  changed(receipt?: import('@galcraft/contracts').EditReceipt): Promise<void>;
  saveAll(): Promise<void>;
  documentActive?: boolean;
  locateSource?(source: import('@galcraft/contracts').Source): void;
  onCheckIssues?(issues: Issue[], state?: ReleaseCheckState): void;
  onRecheckReady?(check: (() => Promise<void>) | null): void;
  locateDependency?(issue: Issue): void;
  onBuildStarted?(planId: string, target?: Target): void;
  onBuildReceipt?(planId: string, receipt: BuildReceipt): void;
  onBuildFailure?(planId: string, issue: Issue, cancelled: boolean, target?: Target): void;
  lastBuild?: { planId: string; receipt: BuildReceipt };
  openProjectMaintenance?(): void;
  onUnappliedChange?(dirty: boolean): void;
  guiDraft?:PublishGuiDraft|null;
  onGuiDraftChange?(draft:PublishGuiDraft):void;
  onHistoryReady?(handler: ((action: 'undo' | 'redo') => boolean) | null): void;
}) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja),
    bridge = workbenchBridge(services.bridge);
  const standaloneEngineView = !openProjectMaintenance;
  const unwrap = <T,>(result: import('@galcraft/contracts').Result<T>): T => {
    if (!result.ok) throw new Error(issueText(result.error, locale));
    return result.value;
  };
  const [target, setTarget] = useState<import('@galcraft/contracts').Target>(guiDraft?.target??"web"),
    [output, setOutput] = useState(guiDraft?.output??""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const operationPending = useRef(false);
  const [releaseFocus, setReleaseFocus] = useState<{ element: HTMLElement; selector: string | null; moved: boolean; release(): void } | null>(null);
  useEffect(() => {
    if (busy || !releaseFocus) return;
    releaseFocus.release();
    setReleaseFocus(null);
    const current = document.activeElement;
    if (releaseFocus.moved || current !== document.body && current !== document.documentElement) return;
    const element = releaseFocus.element.isConnected ? releaseFocus.element
      : releaseFocus.selector ? actionStripRef.current?.querySelector<HTMLElement>(releaseFocus.selector) : null;
    element?.focus({ preventScroll: true });
  }, [busy, releaseFocus]);
  useEffect(() => () => { releaseFocus?.release(); }, [releaseFocus]);
  const [checking, setChecking] = useState(false);
  const [savedSelection, setSavedSelection] = useState<{ version: string; revision: number; signing: 'unsigned' | 'certificate' } | null>(null);
  const [mobile, setMobile] = useState<MobileDrafts>(guiDraft?.mobile ?? {});
  const [savedIssues, setSavedIssues] = useState<import('@galcraft/contracts').Issue[]>([]);
  const targetLabel = (value: import('@galcraft/contracts').Target) => ({ web: 'Web', windows: 'Windows', android: 'Android', ios: 'iOS' }[value]);
  const [verificationPending,setVerificationPending]=useState(false),[verificationIssues,setVerificationIssues]=useState<import('@galcraft/contracts').Issue[]>([]);
  const [verificationProgress, setVerificationProgress] = useState<import('@galcraft/contracts').AssetVerificationProgress | null>(null);
  const verificationRequest = useRef<{ operationId: string; projectId: string; target: import('@galcraft/contracts').Target; sessionId?: string; running: boolean } | null>(null);
  useEffect(() => {
    verificationRequest.current = null; setVerificationProgress(null); setVerificationIssues([]); setSavedIssues([]);
    return bridge.assets.subscribeTargetVerification?.(event => {
      const request = verificationRequest.current;
      if (!request || request.operationId !== event.operationId || request.projectId !== event.projectId || request.target !== event.target || request.sessionId && request.sessionId !== event.sessionId) return;
      request.sessionId = event.sessionId; setVerificationProgress(event);
    });
  }, [bridge, source.project.projectId, target]);
  useEffect(() => () => { verificationRequest.current = null; }, []);
  useEffect(()=>{if(!source.anyDirty)setVerificationPending(false);},[source.anyDirty]);
  const [activeBuild, setActiveBuild] = useState<CheckedRelease | null>(null);
  const buildRequest = useRef<string | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [buildCancelled, setBuildCancelled] = useState(false);
  const [plan, setPlan] = useState<CheckedRelease | null>(null);
  const [replacement, setReplacement] = useState<{ checked: CheckedRelease; warning: Issue } | null>(null);
  const [receipt, setReceipt] = useState<BuildReceipt | null>(lastBuild?.receipt ?? null);
  const [receiptPlan, setReceiptPlan] = useState<string | null>(lastBuild?.planId ?? null);
  const [oldSaveFiles, setOldSaveFiles] = useState<string[]>([]);
  const [fontMode, setFontMode] = useState<'full' | 'subsetStatic'>(guiDraft?.fontMode??'full');
  const [fallbackAssetId, setFallbackAssetId] = useState<string | null>(guiDraft?.fallbackAssetId??null);
  const [assets, setAssets] = useState<import('@galcraft/contracts').Asset[]>([]);
  const [keepAssets, setKeepAssets] = useState<string[]>(guiDraft?.keepAssets??[]);
  const [steamAppId, setSteamAppId] = useState(guiDraft?.steamAppId ?? source.project.platform.steamAppId ?? '');
  const [steamRequired, setSteamRequired] = useState(guiDraft?.steamRequired??false);
  const [live2dPurpose, setLive2dPurpose] = useState<'localTest' | 'distribution'>(guiDraft?.live2dPurpose??'distribution');
  const [live2dLicenseConfirmed, setLive2dLicenseConfirmed] = useState(guiDraft?.live2dLicenseConfirmed??false);
  const [entryMappings, setEntryMappings] = useState<import('@galcraft/contracts').EntryMapping[]>(guiDraft?.entryMappings??[]);
  const [compatibility, setCompatibility] = useState<import('@galcraft/contracts').CompatibilityReport | null>(null);
  const [engines, setEngines] = useState<{ version: string; targets: string[]; conversions: { from: string; to: string; entry: string }[] }[]>([]);
  const [upgradeVersion, setUpgradeVersion] = useState('');
  const [upgrade, setUpgrade] = useState<import('@galcraft/contracts').UpgradePlan | null>(null);
  const [upgradeOperationId, setUpgradeOperationId] = useState<string | null>(null);
  const [upgrades, setUpgrades] = useState<{ id: string; from: string; to: string; originalCopy: string; state: string }[]>([]);
  const [version, setVersion] = useState(guiDraft?.version??source.project.releaseVersion);
  const [brandName, setBrandName] = useState(guiDraft?.brandName??source.project.name);
  const [executableName, setExecutableName] = useState(guiDraft?.executableName??source.project.release?.executableName ?? 'Game.exe');
  const [publisher, setPublisher] = useState(guiDraft?.publisher??source.project.release?.publisher ?? '');
  const [brandIcon, setBrandIcon] = useState(guiDraft?.brandIcon??source.project.display.icon ?? '');
  const [windowsSigning, setWindowsSigning] = useState<'unsigned' | 'certificate'>(guiDraft?.windowsSigning??source.project.release?.windowsSigning ?? 'unsigned');
  const [certificates, setCertificates] = useState<{ thumbprint: string; subject: string; expiresAt: string;authorUsable?:boolean;blockedReason?:string|null }[] | null>(null);
  const usableCertificates = certificates?.filter(item => item.authorUsable !== false) ?? [];
  const [certificate, setCertificate] = useState(guiDraft?.certificate??'');
  const checkState = useRef<ReleaseCheckState | null>(null);
  const reportedCheckIssues = useRef<Issue[]>([]);
  const activeCheck = useRef<object | null>(null);
  const checkInput = JSON.stringify([target, mobile, output, fontMode, fallbackAssetId, keepAssets, steamAppId, steamRequired,
    live2dPurpose, live2dLicenseConfirmed, entryMappings, version, brandName, executableName, publisher, brandIcon, windowsSigning,
    certificate, oldSaveFiles, savedSelection, source.project.projectId, source.projectRevision, source.projectSavedRevision,
    source.documentVersions, source.assetIndexRevision, source.scenes.map(scene => [scene.documentId, scene.revision, scene.savedRevision])]);
  const currentCheckInput = useRef(checkInput);
  currentCheckInput.current = checkInput;
  const reportCheckState = (issues: Issue[], state: ReleaseCheckState) => {
    if (state === 'complete') reportedCheckIssues.current = issues;
    checkState.current = state;
    onCheckIssues?.(issues, state);
  };
  useEffect(() => () => { activeCheck.current = null; }, []);
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [currentDocument, setCurrentDocument] = useState<PublishView>('release');
  const engineOpen = currentDocument === 'engine';
  const settings = currentDocument === 'release' || engineOpen ? null : currentDocument;
  const releaseScroll = useRef(0);
  const viewNavRef = useRef<HTMLElement>(null);
  const configurationRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const checksRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const pendingResultFocus = useRef(false);
  const actionStripRef = useRef<HTMLElement>(null);
  const [issueQuery, setIssueQuery] = useState('');
  const advancedRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const identityBaseline=useRef(guiDraft?.identityBase??publishIdentityBase(source.project));
  const [identityConflicts,setIdentityConflicts]=useState<string[]>([]);
  const pendingIdentity = publishIdentityChanges({target,steamAppId,version,brandName,brandIcon,executableName,publisher,windowsSigning} as PublishGuiDraft, identityBaseline.current);
  const identityDirty = pendingIdentity.length > 0;
  const draftHistory = useRef<{ current?: PublishGuiDraft; undo: PublishGuiDraft[]; redo: PublishGuiDraft[]; restoring: boolean }>({undo:[],redo:[],restoring:false});
  useEffect(()=>{const next={identityBase:identityBaseline.current,target,mobile,output,fontMode,fallbackAssetId,keepAssets,steamAppId,steamRequired,live2dPurpose,live2dLicenseConfirmed,entryMappings,version,brandName,executableName,publisher,brandIcon,windowsSigning,certificate};
    const history=draftHistory.current;
    if(history.current && !history.restoring && JSON.stringify(next)!==JSON.stringify(history.current)){history.undo.push(history.current);history.redo=[];}
    history.current=next;history.restoring=false;onGuiDraftChange?.(next);
  },[onGuiDraftChange,target,mobile,output,fontMode,fallbackAssetId,keepAssets,steamAppId,steamRequired,live2dPurpose,live2dLicenseConfirmed,entryMappings,version,brandName,executableName,publisher,brandIcon,windowsSigning,certificate]);
  useEffect(()=>{onHistoryReady?.(action=>{
    const history=draftHistory.current, from=action==='undo'?history.undo:history.redo, to=action==='undo'?history.redo:history.undo;
    const next=from.pop();if(!next||!history.current)return false;
    to.push(history.current);history.restoring=true;history.current=next;
    if(next.identityBase)identityBaseline.current=next.identityBase;setTarget(next.target);setMobile(next.mobile??{});setOutput(next.output);setFontMode(next.fontMode);setFallbackAssetId(next.fallbackAssetId);setKeepAssets(next.keepAssets);
    setSteamAppId(next.steamAppId??'');setSteamRequired(next.steamRequired);setLive2dPurpose(next.live2dPurpose);setLive2dLicenseConfirmed(next.live2dLicenseConfirmed);setEntryMappings(next.entryMappings);
    setVersion(next.version);setBrandName(next.brandName);setExecutableName(next.executableName);setPublisher(next.publisher);setBrandIcon(next.brandIcon);setWindowsSigning(next.windowsSigning);setCertificate(next.certificate);
    return true;
  });return()=>onHistoryReady?.(null);},[onHistoryReady]);
  useEffect(() => { onUnappliedChange?.(identityDirty); }, [identityDirty, onUnappliedChange]);
  useEffect(() => () => onUnappliedChange?.(false), [onUnappliedChange]);
  useEffect(() => {
    setPlan(null);
    if (checkState.current && checkState.current !== 'stale') {
      activeCheck.current = null;
      reportCheckState(reportedCheckIssues.current, 'stale');
    }
  }, [checkInput]);
  useEffect(() => { setIssueQuery(''); }, [plan?.planId]);
  useEffect(()=>{
    const previous=identityBaseline.current,pending=new Set(publishIdentityChanges({target,steamAppId,version,brandName,brandIcon,executableName,publisher,windowsSigning} as PublishGuiDraft,previous)),latest=source.project;
    if(!pending.has('version'))setVersion(latest.releaseVersion);if(!pending.has('brandName'))setBrandName(latest.name);if(!pending.has('brandIcon'))setBrandIcon(latest.display.icon??'');if(!pending.has('steamAppId'))setSteamAppId(latest.platform.steamAppId??'');
    if(!pending.has('executableName'))setExecutableName(latest.release?.executableName??'Game.exe');if(!pending.has('publisher'))setPublisher(latest.release?.publisher??'');if(!pending.has('windowsSigning'))setWindowsSigning(latest.release?.windowsSigning??'unsigned');
    identityBaseline.current={...publishIdentityBase(latest),name:pending.has('brandName')?previous.name:latest.name,releaseVersion:pending.has('version')?previous.releaseVersion:latest.releaseVersion,display:{...latest.display,icon:pending.has('brandIcon')?previous.display.icon:latest.display.icon},platform:{...latest.platform,steamAppId:pending.has('steamAppId')?previous.platform.steamAppId:latest.platform.steamAppId},release:{executableName:pending.has('executableName')?previous.release?.executableName??'Game.exe':latest.release?.executableName??'Game.exe',publisher:pending.has('publisher')?previous.release?.publisher??'':latest.release?.publisher??'',windowsSigning:pending.has('windowsSigning')?previous.release?.windowsSigning??'unsigned':latest.release?.windowsSigning??'unsigned'}};
  },[source.project]);
  useEffect(() => {
    void bridge.builds.status().then((r) => {
      if (r.ok) setReady(r.value.ready);
      else { setReady(false); setError(issueText(r.error, locale)); }
    });
    if (standaloneEngineView) {
      void bridge.upgrades?.list().then(result => { if (result.ok) setEngines(result.value); });
      void bridge.upgrades?.history().then(result => { if (result.ok) setUpgrades(result.value); });
    }
  }, [bridge, standaloneEngineView]);
  useEffect(() => { let live = true;
    void (async () => {
      const items: import('@galcraft/contracts').Asset[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = unwrap(await services.queryAssets({ kind: null, text: '', offset, limit: 100 })); items.push(...page.items);
        if (items.length >= page.total) break;
      }
      if (live) setAssets(items);
    })().catch(error => { if (live) setError(String(error)); });
    return () => { live = false; };
  }, [services, source.project.projectId, source.assetIndexRevision]);
  const run = async (fn: () => Promise<void>) => {
    if (operationPending.current) return;
    operationPending.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      operationPending.current = false;
      setBusy(false);
    }
  };
  const verifyAssets = () => {
    if (busy || verificationRequest.current?.running) return;
    const request = { operationId: createId(), projectId: source.project.projectId, target, running: true };
    verificationRequest.current = request;
    setVerificationProgress({ ...request, sessionId: '', phase: 'preparing', completed: 0, total: null, issueCount: 0 });
    void run(async () => {
      try {
        const result = unwrap(await bridge.assets.verifyTarget(target, request.operationId));
        if (verificationRequest.current !== request) return;
        setVerificationIssues(result.issues); setPlan(null); await changed(result.edit);
        if (verificationRequest.current !== request) return;
        const documents = unwrap(await bridge.documents.list());
        setVerificationPending(documents.some(document => document.dirty && 'assets/index.json' in document.files));
      } catch (reason) {
        if (verificationRequest.current === request) setVerificationProgress(previous => previous ? { ...previous, phase: 'failed', message: reason instanceof Error ? reason.message : String(reason) } : null);
        throw reason;
      } finally { request.running = false; }
    });
  };
  const canBuild = !!plan && !plan.issues.some(issue => issue.severity === 'error');
  const issueCounts = {
    error: plan?.issues.filter(issue => issue.severity === 'error').length ?? 0,
    warning: plan?.issues.filter(issue => issue.severity === 'warning').length ?? 0,
    info: plan?.issues.filter(issue => issue.severity === 'info').length ?? 0,
  };
  const query = issueQuery.trim().toLocaleLowerCase();
  const visibleIssues = (plan?.issues ?? []).map((issue, index) => ({ issue, index }))
    .filter(({ issue }) => !query || `${issueText(issue, locale)} ${issue.message} ${issue.code} ${issue.owner}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.issue.severity] - { error: 0, warning: 1, info: 2 }[b.issue.severity]));
  const hiddenBlockers = issueCounts.error - visibleIssues.filter(({ issue }) => issue.severity === 'error').length;
  const openDocument = (id: PublishView) => {
    if (id === 'engine' && openProjectMaintenance) { openProjectMaintenance(); return; }
    if (!engineOpen && !settings) releaseScroll.current = scrollRef.current?.scrollTop ?? 0;
    setCurrentDocument(id);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: id === 'release' ? releaseScroll.current : 0 }));
  };
  const returnToRelease = () => {
    openDocument('release');
    requestAnimationFrame(() => viewNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true }));
  };
  const locateSettings = (section: ReleaseSettings) => {
    openDocument(section);
    requestAnimationFrame(() => {
      const destination = advancedRef.current?.querySelector<HTMLElement>(`[data-publish-settings="${section}"]`);
      destination?.scrollIntoView({ block: 'center', behavior: 'instant' });
      (section === 'platform' ? destination?.querySelector<HTMLElement>('.publish-live2d button, input') : destination?.querySelector<HTMLElement>('input, button, select'))?.focus({ preventScroll: true });
    });
  };
  const showConfiguration = (field?: string) => {
    requestAnimationFrame(() => {
      const target=field?configurationRef.current?.querySelector<HTMLElement>(`[data-field="${field}"] input`):configurationRef.current?.querySelector<HTMLElement>('h2');
      target?.scrollIntoView({block:'nearest'});target?.focus({preventScroll:true});
    });
  };
  const focusSection = (section: HTMLElement | null) => requestAnimationFrame(() => {
    if (!section?.getClientRects().length) return;
    section.scrollIntoView({ block: 'start' });
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (!pendingResultFocus.current) return;
    pendingResultFocus.current = false;
    focusSection(resultRef.current);
  }, [receipt]);
  const views = [
    ['release', t('检查与构建', 'Check & build', '確認と構築')],
    ['assets', t('素材与字体', 'Assets & fonts', '素材とフォント')],
    ['compatibility', t('旧档兼容性', 'Save compatibility', '旧セーブの互換性')],
    ['platform', t('平台选项', 'Platform options', 'プラットフォームの設定')],
    ['engine', t('引擎版本与历史', 'Engine version & history', 'エンジンバージョンと履歴')],
  ] as const;
  const unverified=assets.filter(asset=>asset.variants.some(variant=>(variant.id===asset.activeVariantId||variant.role==='compatible')&&(!variant.targets[target]||variant.targets[target]==='unverified')));
  const reportCheckIssues = (issues: Issue[], state: 'complete' | 'failed' = 'complete') => {
    setSavedIssues(issues);
    reportCheckState(issues, state);
  };
  const checkSaved = async (current: () => boolean, selection = savedSelection): Promise<CheckedRelease | null> => {
    setChecking(true);
    try {
      const documents = unwrap(await bridge.documents.list());
      if (!current()) return null;
      const projectDocument = documents.find(document => document.savedFiles['project.json']);
      if (!projectDocument) throw new Error(t('找不到已保存的作品文档。', 'The saved project document is unavailable.', '保存済みの作品文書が見つかりません。'));
      const savedProject = ProjectSchema.parse(JSON.parse(projectDocument.savedFiles['project.json']!).data);
      const savedVersion = savedProject.releaseVersion;
      if (selection && selection.revision !== projectDocument.savedRevision) {
        setSavedSelection(null);
        throw new Error(t('保存版本已经更新，请重新选择。', 'The saved release changed. Choose it again.', '保存済みバージョンが更新されました。選択し直してください。'));
      }
      if (!selection && (identityDirty || documents.some(document => document.dirty) || version !== savedVersion ||
          publishIdentityChanges({ target, steamAppId, version, brandName, brandIcon, executableName, publisher, windowsSigning }, savedProject).length)) {
        throw new Error(t(`当前修改尚未保存。请审阅保存，或明确选用上次保存版本 ${savedVersion}。`, `Changes are unsaved. Review and save them, or choose the last saved release ${savedVersion}.`, `変更は未保存です。確認して保存するか、前回保存したバージョン ${savedVersion} を選択してください。`));
      }
      const compiled = await services.compilePreview?.(true, documents, { publish: true });
      if (!current()) return null;
      if (!compiled) throw new Error(t('编译服务尚未就绪', 'Compiler unavailable', 'コンパイラーは未準備です'));
      if (!compiled.ok) {
        reportCheckIssues(failureIssues(compiled), 'failed');
        return null;
      }
      const snapshot = compiled.value.snapshot;
      if (!snapshot) {
        if (!compiled.value.issues.length) throw new Error(t('已保存内容尚未编译成功，请重新检查。', 'The saved content did not compile. Check it again.', '保存済みの内容をコンパイルできませんでした。再確認してください。'));
        reportCheckIssues(compiled.value.issues);
        return null;
      }
      const signingRequired = target === 'windows' && snapshot.project.release?.windowsSigning === 'certificate';
      if (signingRequired && !usableCertificates.some(item => item.thumbprint === certificate))
        throw new Error(t('请读取并选择本次发行使用的本机证书。', 'Load and select the local certificate for this release.', '今回の配布用ローカル証明書を読み込んで選択してください。'));
      const input: BuildInput = {
        projectId: source.project.projectId,
        target,
        ...((target === 'android' || target === 'ios') ? { targetBuilder: mobile[target]?.builder ?? undefined, targetOptions: mobile[target]?.options ?? initialMobileOptions(target, source.project.projectId) } : {}),
        outputDirectory: output,
        releaseVersion: snapshot.project.releaseVersion,
        snapshotId: snapshot.snapshotId,
        savedVersions: documents.filter(document => Object.keys(document.savedFiles).length).map(document => ({
          ref: { kind: 'document', id: document.documentId }, revision: document.savedRevision,
        })),
        keepAssets,
        platformPolicy: steamRequired ? { 'org.galcraft.steam/achievement': 'required' } : {},
        font: { mode: fontMode, fallbackAssetId },
        oldSaveFiles,
        entryMappings,
        windowsSigning: target === 'windows' ? signingRequired ? { mode: 'certificate', certificateThumbprint: certificate } : { mode: 'unsigned' } : undefined,
        live2d: { purpose: live2dPurpose, licenseConfirmed: live2dLicenseConfirmed },
      };
      const planned = await bridge.builds.planBuild(input);
      if (!current()) return null;
      if (!planned.ok) {
        reportCheckIssues([...compiled.value.issues, ...failureIssues(planned)]);
        return null;
      }
      const nextPlan: CheckedRelease = { ...planned.value, input, issues: [...compiled.value.issues, ...planned.value.issues] };
      setPlan(nextPlan);
      setSavedIssues([]);
      reportCheckState(nextPlan.issues, 'complete');
      return nextPlan;
    } finally {
      setChecking(false);
    }
  };
  const buildChecked = async (checked: CheckedRelease) => {
    const id = checked.planId;
    buildRequest.current = id;
    setActiveBuild(checked);
    setBuildCancelled(false);
    try {
      onBuildStarted?.(id, checked.input.target);
      const built = await bridge.builds.build(id).catch((reason: unknown): Result<BuildReceipt> => ({
        ok: false,
        error: {
          code: 'BUILD_REQUEST_FAILED', owner: 'M11', severity: 'error', related: [], actions: ['retry'],
          message: t('未能取得构建回执。请检查输出目录，再决定是否重试。', 'The build receipt could not be retrieved. Check the output directory before retrying.', '構築結果を取得できませんでした。出力先を確認してから再試行してください。'),
          details: { reason: reason instanceof Error ? reason.message : String(reason) },
        },
        issues: [],
      }));
      buildRequest.current = null;
      setActiveBuild(null);
      setCancelPending(false);
      if (!built.ok) {
        const cancelled = built.error.code === 'BUILD_CANCELLED';
        onBuildFailure?.(id, built.error, cancelled, checked.input.target);
        if (cancelled) setBuildCancelled(true);
        else {
          if (built.error.code === 'BUILD_PLAN_STALE') setPlan(null);
          setError(issueText(built.error, locale));
        }
        return;
      }
      pendingResultFocus.current = true;
      setReceipt(built.value);
      setReceiptPlan(id);
      onBuildReceipt?.(id, built.value);
      setCompatibility(null);
      const report = await bridge.builds.compatibility(id);
      if (report.ok) setCompatibility(report.value);
      else setError(issueText(report.error, locale));
    } finally {
      buildRequest.current = null;
      setActiveBuild(null);
      setCancelPending(false);
    }
  };
  const requestBuild = async (checked: CheckedRelease) => {
    const warning = checked.issues.find(issue => issue.code === 'BUILD_OUTPUT_REPLACE');
    if (warning) setReplacement({ checked, warning });
    else await buildChecked(checked);
  };
  const performCheck = async (build: boolean, selection = savedSelection, focusInvalid = true) => {
    const request = {}, input = currentCheckInput.current;
    activeCheck.current = request;
    const current = () => activeCheck.current === request && currentCheckInput.current === input;
    setPlan(null);
    setBuildCancelled(false);
    const invalid = !output.trim()
      ? { field: 'output', message: t('请选择或填写输出目录', 'Choose an output directory', '出力ディレクトリを選択してください') }
      : !selection && !VersionSchema.safeParse(version).success
        ? { field: 'version', message: t('请填写有效版本，例如 0.1.0', 'Enter a version, such as 0.1.0', '0.1.0 などのバージョンを入力してください') }
        : null;
    if (invalid) {
      setFieldErrors({ [invalid.field]: invalid.message });
      if (focusInvalid) showConfiguration(invalid.field);
      else reportCheckIssues([{ code: 'BUILD_CHECK_FAILED', owner: 'M11', severity: 'error', related: [], actions: ['retry'], message: invalid.message }], 'failed');
      return;
    }
    reportCheckState(reportedCheckIssues.current, 'checking');
    const checked = await checkSaved(current, selection).catch(reason => {
      if (!current()) return null;
      const issue: Issue = { code: 'BUILD_CHECK_FAILED', owner: 'M11', severity: 'error', related: [], actions: ['retry'],
        message: reason instanceof Error ? reason.message : String(reason) };
      setSavedIssues([issue]);
      reportCheckState([issue], 'failed');
      throw reason;
    });
    if (!checked || !current()) return;
    if (build && !checked.issues.some(issue => issue.severity === 'error')) await requestBuild(checked);
  };
  const runLocalRelease = (operation: () => Promise<void>) => {
    if (operationPending.current) return;
    const element = document.activeElement;
    if (element instanceof HTMLElement && element !== document.body && element !== document.documentElement) {
      const action = element.getAttribute('data-release-action');
      const selector = action === 'check' || action === 'build' ? `[data-release-action="${action}"]` : null;
      const focus = { element, selector, moved: false, release: () => document.removeEventListener('focusin', moved) };
      const moved = (event: FocusEvent) => {
        if (event.target !== element && event.target !== document.body && event.target !== document.documentElement) focus.moved = true;
      };
      document.addEventListener('focusin', moved);
      setReleaseFocus(focus);
    }
    void run(operation);
  };
  const checkRelease = (build: boolean) => runLocalRelease(() => performCheck(build));
  const latestRecheck = useRef<() => Promise<void>>(() => Promise.resolve());
  latestRecheck.current = () => ready ? run(() => performCheck(false, savedSelection, false)) : Promise.resolve();
  const recheckMounted = useRef(false);
  const recheckPending = useRef<Promise<void> | null>(null);
  const externalRecheck = useCallback(() => {
    if (!recheckMounted.current) return Promise.resolve();
    if (recheckPending.current) return recheckPending.current;
    const pending = latestRecheck.current();
    recheckPending.current = pending;
    void pending.finally(() => { if (recheckPending.current === pending) recheckPending.current = null; });
    return pending;
  }, []);
  useEffect(() => {
    recheckMounted.current = true;
    onRecheckReady?.(externalRecheck);
    return () => { recheckMounted.current = false; onRecheckReady?.(null); };
  }, [onRecheckReady, externalRecheck]);
  const cancelBuild = (id: string) => {
    setCancelPending(true);
    void bridge.builds.cancel(id).then(result => {
      if (buildRequest.current !== id) return;
      if (!result.ok) { setError(issueText(result.error, locale)); setCancelPending(false); }
      else if (result.value && typeof result.value === 'object' && 'local' in result.value && result.value.local === 'alreadyFinished') setCancelPending(false);
    }).catch(reason => {
      if (buildRequest.current === id) { setError(String(reason)); setCancelPending(false); }
    });
  };
  const applyConfiguration = async (resolution?:'draft'|'current') => {
    const docs = unwrap(await bridge.documents.list()), document = docs.find(item => item.files['project.json']);
    if (!document) throw new Error('Project document missing');
    const before = JSON.parse(document.files['project.json']!).data;
    const merge=mergePublishIdentity(identityBaseline.current,{target,steamAppId,version,brandName,brandIcon,executableName,publisher,windowsSigning} as PublishGuiDraft,before,resolution);
    if(merge.conflicts.length&&!resolution){setIdentityConflicts(merge.conflicts);throw new Error(t('这些发行字段已被其他操作修改，请选择保留本次输入或当前内容。','These release fields changed elsewhere. Keep your input or the current values.','配布設定が別の操作で変更されました。入力または現在の値を選択してください。'));}
    const after = ProjectSchema.safeParse(merge.project);
    if (!after.success || !brandName.trim()) throw new Error(t('请填写作品名称、有效版本及合法的 .exe 文件名。','Enter a work name, valid version and a valid .exe filename.','作品名、有効なバージョンと .exe ファイル名を入力してください。'));
    const expected = [{ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision }];
    const edit = unwrap(await bridge.documents.planEdit({ label: t('应用发行配置','Apply release settings','配布設定を適用'), origin: 'field', expected,
      patches: [{ kind: 'json', documentId: document.documentId, changes: PublishHistoryPaths.flatMap(path => {
        const read = (data: unknown) => path.slice(6).split('/').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], data) ?? null;
        const oldValue = read(before), newValue = read(after.data);
        return JSON.stringify(oldValue) === JSON.stringify(newValue) ? [] : [{ path, before: oldValue as import('@galcraft/contracts').Json, after: newValue as import('@galcraft/contracts').Json, op: 'set' as const }];
      }) }],
      preparedAssets: [], requiredRefs: brandIcon ? [{ kind: 'asset', id: brandIcon }] : [] }));
    const receipt = unwrap(await bridge.documents.applyEdit(edit.planId, expected));identityBaseline.current=publishIdentityBase(after.data);setIdentityConflicts([]);setVersion(after.data.releaseVersion);setBrandName(after.data.name);setBrandIcon(after.data.display.icon??'');setSteamAppId(after.data.platform.steamAppId??'');setExecutableName(after.data.release?.executableName??'Game.exe');setPublisher(after.data.release?.publisher??'');setWindowsSigning(after.data.release?.windowsSigning??'unsigned'); draftHistory.current={current:draftHistory.current.current,undo:[],redo:[],restoring:false}; setPlan(null); await changed(receipt);
  };
  const configuration = <div className="publish-configuration-body" ref={configurationRef}>
        <section className="publish-panel publish-configuration">
          <h2 tabIndex={-1}>{t('发行配置', 'Release configuration', '配布設定')}</h2>
          <fieldset className="publish-config-fields" disabled={busy}>
          <div className="publish-targets" role="group" aria-label={t('目标平台', 'Target platform', '対象プラットフォーム')}>
            <Button
              aria-pressed={target === "web"}
              onClick={() => {
                setTarget("web");
                setPlan(null);
              }}
            >
              <Globe size={16} />
              <strong>Web</strong>
              <small>
                {t(
                  "完整静态目录 · HTTP 运行",
                  "Static directory · HTTP",
                  "静的ディレクトリ・HTTP",
                )}
              </small>
            </Button>
            <Button
              aria-pressed={target === "windows"}
              onClick={() => {
                setTarget("windows");
                setPlan(null);
              }}
            >
              <Monitor size={16} />
              <strong>Windows</strong>
              <small>
                {t(
                  "独立 Player · 完整目录",
                  "Standalone Player · full directory",
                  "独立 Player・完全なディレクトリ",
                )}
              </small>
            </Button>
            {(["android", "ios"] as const).map(value => <Button key={value} aria-pressed={target === value} onClick={() => { setTarget(value); setPlan(null); }}><Smartphone size={16}/><strong>{targetLabel(value)}</strong><small>{value === "android" ? "APK / AAB" : "Xcode"}</small></Button>)}
          </div>
          <div className="publish-output-config"><Field name="output" required error={fieldErrors.output} label={t("输出目录", "Output directory", "出力ディレクトリ")}>
            <Input
              value={output}
              onChange={(e) => {
                setOutput(e.target.value); setFieldErrors(previous => ({...previous, output: ''}));
                setPlan(null);
              }}
            />
          </Field>
          <Button
            onClick={() =>
              void run(async () => {
                const path = unwrap(await bridge.projects.chooseDirectory());
                if (path) {
                  setOutput(path); setFieldErrors(previous => ({...previous, output: ''}));
                  setPlan(null);
                }
              })
            }
          >
            <FolderOpen size={15} />
            {t("选择目录", "Choose directory", "ディレクトリを選択")}
          </Button>
          </div>
          <div className="publish-version-config">
          <Field name="version" required error={fieldErrors.version} label={t("发行版本", "Release version", "配布バージョン")}>
            <Input data-local-history={String(version !== source.project.releaseVersion)} readOnly={!!savedSelection} value={savedSelection?.version ?? version} onChange={event => { setVersion(event.target.value); setFieldErrors(previous => ({...previous, version: ''})); setPlan(null); }} />
          </Field>
          <Button disabled={busy} onClick={() => void run(async () => {
            if (savedSelection) { setSavedSelection(null); setPlan(null); return; }
            const docs = unwrap(await bridge.documents.list());
            const document = docs.find(item => item.savedFiles['project.json']);
            if (!document) throw new Error('Saved Project document missing');
            const savedProject = ProjectSchema.parse(JSON.parse(document.savedFiles['project.json']!).data);
            setSavedSelection({ version: savedProject.releaseVersion, revision: document.savedRevision, signing: savedProject.release?.windowsSigning ?? 'unsigned' });
            setFieldErrors(previous => ({ ...previous, version: '' }));
            setPlan(null);
          })}><RotateCcw size={15}/>{savedSelection ? t('返回当前修改', 'Return to working changes', '作業中の変更に戻る') : t('选用上次保存版本', 'Use last saved release', '前回保存したバージョンを使用')}</Button>
          <Button disabled={busy || !!savedSelection || version === source.project.releaseVersion} onClick={() => void run(async () => {
            const docs = unwrap(await bridge.documents.list());
            const document = docs.find(doc => doc.files['project.json']);
            if (!document) throw new Error('Project document missing');
            const project = JSON.parse(document.files['project.json']!).data;
            const expected = [{ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision }];
            if (!VersionSchema.safeParse(version).success) { setFieldErrors({version: t('请填写有效版本，例如 0.1.0', 'Enter a version, such as 0.1.0', '0.1.0 などのバージョンを入力してください')}); return; }
            const edit = unwrap(await bridge.documents.planEdit({ label: t('修改发行版本', 'Change release version', '配布バージョンを変更'), origin: 'field', expected,
              patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/releaseVersion', before: project.releaseVersion, after: version, op: 'set' }] }], preparedAssets: [], requiredRefs: [] }));
            const receipt = unwrap(await bridge.documents.applyEdit(edit.planId, expected));
            identityBaseline.current = { ...identityBaseline.current, releaseVersion: version };
            const currentDraft = draftHistory.current.current;
            if (currentDraft) {
              const nextDraft = { ...currentDraft, identityBase: identityBaseline.current };
              draftHistory.current.current = nextDraft;
              onGuiDraftChange?.(nextDraft);
            }
            setPlan(null); await changed(receipt);
          })} title={t('应用版本到工作区，审阅保存后用于构建','Apply to the workspace; review and save before building','バージョンを作業状態に適用。保存後に構築できます')}><Check size={15}/>{t('应用版本修改', 'Apply version change', 'バージョン変更を適用')}</Button>
          </div>

          {(target === 'android' || target === 'ios') && <MobileTargetOptions target={target} value={mobile[target] ?? { builder: null, options: initialMobileOptions(target, source.project.projectId) }}
            onChange={value => { setMobile(previous => ({ ...previous, [target]: value })); setPlan(null); }} builds={bridge.builds} locale={locale} chooseDirectory={async () => unwrap(await bridge.projects.chooseDirectory())}/>}

          <details className="publish-brand-config">
            <summary>{target === 'windows' ? t('作品名称、图标与 Windows 身份', 'Work name, icon & Windows identity', '作品名・アイコン・Windows の情報') : t('作品名称与图标', 'Work name and icon', '作品名とアイコン')}</summary>
            <Field label={t('作品名称', 'Work name', '作品名')}><Input data-local-history={String(brandName !== source.project.name)} value={brandName} onChange={event => setBrandName(event.target.value)} /></Field>
            {target === 'windows' && <><Field label={t('可执行文件名', 'Executable filename', '実行ファイル名')}><Input data-local-history={String(executableName !== (source.project.release?.executableName ?? 'Game.exe'))} value={executableName} onChange={event => { setExecutableName(event.target.value); setPlan(null); }} /></Field>
            <Field label={t('发行者', 'Publisher', '配布者')}><Input data-local-history={String(publisher !== (source.project.release?.publisher ?? ''))} value={publisher} onChange={event => { setPublisher(event.target.value); setPlan(null); }} /></Field></>}
            <Field label={t('作品图标', 'Work icon', '作品アイコン')}><Choice label={t('作品图标', 'Work icon', '作品アイコン')} value={brandIcon} onChange={setBrandIcon}
              options={[{ value: '', label: t('默认图标', 'Default icon', '既定のアイコン') }, ...assets.filter(asset => asset.kind === 'image').map(asset => ({ value: asset.id, label: asset.name }))]} /></Field>
            {target === 'windows' && <Field label={t('Windows 签名', 'Windows signing', 'Windows 署名')}><Choice label={t('Windows 签名', 'Windows signing', 'Windows 署名')} value={windowsSigning}
              onChange={value => { setWindowsSigning(value as typeof windowsSigning); setPlan(null); }} options={[
                { value: 'unsigned', label: t('明确不签名', 'Leave unsigned', '署名しない') },
                { value: 'certificate', label: t('使用本机证书签名', 'Sign with a local certificate', 'ローカル証明書で署名') },
              ]} /></Field>}
            <Button disabled={!identityDirty || busy} onClick={() => void run(()=>applyConfiguration())}>{t('应用作品身份', 'Apply work identity', '作品情報を適用')}</Button>
            <p>{t('应用后审阅保存，再检查已保存版本。名称和图标更改保留作品的存档身份。', 'Review and save before checking the saved release. Renaming keeps this work’s saved data identity.', '適用後に確認・保存してから配布を確認してください。名前を変更してもセーブの作品識別は維持されます。')}</p>
          </details>
          {target === 'windows' && (savedSelection?.signing ?? windowsSigning) === 'certificate' && <section className="publish-author-signing">
            <h3>{t('本机签名证书', 'Local signing certificate', 'ローカル署名証明書')}</h3>
            {!certificates && <p>{t('先读取本机证书，再选择此发行使用的证书。', 'Load the local certificates first, then choose one for this release.', 'ローカル証明書を読み込み、今回の配布用に選択してください。')}</p>}
            <Button onClick={() => void run(async () => { setCertificates(unwrap(await bridge.builds.signingCertificates())); setPlan(null); })}>{t('读取本机签名证书', 'Load local signing certificates', 'ローカル署名証明書を読み込む')}</Button>
            <Field label={t('本次发行证书', 'Certificate for this release', '今回の配布用証明書')}><Choice label={t('本次发行证书', 'Certificate for this release', '今回の配布用証明書')} value={usableCertificates.some(item => item.thumbprint === certificate) ? certificate : ''}
              disabled={!usableCertificates.length}
              onChange={value => { setCertificate(value); setPlan(null); }} options={[{ value: '', label: t('请选择本机证书', 'Select a local certificate', 'ローカル証明書を選択') },
                ...usableCertificates.map(item => ({ value: item.thumbprint, label: `${item.subject} · ${item.expiresAt.slice(0, 10)} · ${item.thumbprint.slice(-8)}` }))]} /></Field>
            {certificates && !usableCertificates.length && <p role="status">{t('本机没有可用于此发行的签名证书。导入可用证书后重新读取，或调整作品的签名方式。', 'No local certificate is available for this release. Import a usable certificate and reload the list, or change the project’s signing mode.', '今回使用できるローカル証明書がありません。利用可能な証明書を導入して再読み込みするか、作品の署名方式を変更してください。')}</p>}
            <p>{t('证书选择仅用于本次本机发行，不写入作品。签名失败会停止构建；证书信任状态显示在回执。', 'Certificate selection stays on this machine for this build. Signing failure stops the build; the receipt reports trust.', '証明書の選択は今回のローカル構築で使用します。署名失敗時は構築を停止し、信頼状態を結果に表示します。')}</p>
            {certificates?.filter(item=>item.authorUsable===false).map(item=><p key={item.thumbprint} className="field-help">{item.subject} · {t('此身份不可用于作者作品。', 'This identity is unavailable for author releases.', 'この証明書は作者の配布に使用できません。')}</p>)}
          </section>}

          </fieldset>
        </section>
  </div>;
  return (
    <main className="publish-page publish-workflow publish-desktop-workbench">
      <div className="publish-workbench-document">
        <header className="publish-workbench-toolbar"><h1>{t('发布', 'Publish', '配布')}</h1>
          <nav ref={viewNavRef} className="publish-view-nav" aria-label={t('发行工作区', 'Release workspace', '配布ワークスペース')}>
            {views.map(([id, label]) => <Button key={id} tone="quiet" aria-current={id === currentDocument ? 'page' : undefined} onClick={() => openDocument(id)}>{label}</Button>)}
          </nav>
        </header>
        <div className="publish-document-scroll" ref={scrollRef}>
        <section className="publish-panel publish-next-steps" hidden={engineOpen || !!settings}>
          {configuration}
          <section className="publish-saved-state"><h2>{t('已保存内容', 'Saved content', '保存済み内容')}</h2>
          <Badge tone={source.anyDirty ? "warm" : "good"}>
            {source.anyDirty
              ? t("有未保存修改", "Unsaved changes", "未保存の変更")
              : t("已保存", "Saved", "保存済み")}
          </Badge>
          <p>{savedSelection
            ? t(`使用保存版本 ${savedSelection.version}。当前修改保留在工作区。`, `Using saved release ${savedSelection.version}. Working changes remain in the workspace.`, `保存済み ${savedSelection.version} を使用します。作業中の変更は保持されます。`)
            : t('发布使用已保存的作品内容。未保存时，可以审阅保存或选用上次保存版本。', 'Publish uses saved project content. Review and save changes, or choose the last saved release.', '配布には保存済みの作品を使用します。変更を確認して保存するか、前回保存したバージョンを選択してください。')}</p>
          <Button disabled={busy || !source.anyDirty}
            onClick={() =>
              void run(async () => {
                await saveAll();
                const documents=unwrap(await bridge.documents.list()); if(documents.some(document=>document.dirty))return;
                setVerificationPending(false); setSavedSelection(null); await changed();
                await performCheck(false, null);
              })
            }
          >
            {t('审阅保存并重新检查','Review, save and recheck','確認して保存・再確認')}
          </Button>
          </section>
          {identityDirty && <section className="publish-pending-settings" aria-label={t('待应用的发行配置','Pending release settings','未適用の配布設定')}>
            <h2>{t('发行配置尚未应用','Release settings are unapplied','配布設定が未適用です')}</h2>
            <p>{t('应用后通过“保存全部”审阅保存，再检查和构建。','Apply these settings, review Save all, then check and build.','設定を適用して「すべて保存」で確認・保存し、その後に確認と構築を行います。')}</p>
            <p>{pendingIdentity.map(field => ({steamAppId:t('Steam AppID','Steam AppID','Steam AppID'),version:t('发行版本','Release version','配布バージョン'),brandName:t('作品名称','Work name','作品名'),brandIcon:t('作品图标','Work icon','作品アイコン'),executableName:t('可执行文件名','Executable filename','実行ファイル名'),publisher:t('发行者','Publisher','配布者'),windowsSigning:t('Windows 签名','Windows signing','Windows 署名')})[field]).join(' · ')}</p>
            <Button disabled={busy} onClick={() => void run(()=>applyConfiguration())}>{t('应用发行配置','Apply release settings','配布設定を適用')}</Button>
            {!!identityConflicts.length&&<div role="alert"><p>{t('同一字段已有其他修改；本次未应用输入仍然保留。','The same fields changed elsewhere; your unapplied input is retained.','同じ項目が別の操作で変更されました。未適用の入力を保持しています。')}</p><div className="gc-actions"><Button disabled={busy} onClick={()=>void run(()=>applyConfiguration('draft'))}>{t('使用本次输入','Use my input','今回の入力を使う')}</Button><Button disabled={busy} onClick={()=>void run(()=>applyConfiguration('current'))}>{t('保留当前值','Keep current values','現在の値を保持')}</Button></div></div>}
          </section>}
          <section className="publish-target-verification" aria-label={t('目标素材验证','Target asset verification','対象素材の検証')}>
            <h2>{verificationPending?t('验证结果尚未保存','Verification results are unsaved','検証結果は未保存です'):t(`待验证素材 ${unverified.length} 项`,`${unverified.length} assets awaiting verification`,`検証待ち素材 ${unverified.length} 件`)}</h2>
            <p>{t('验证更新作品工作区中的目标能力，审阅保存后重新检查发行。','Verification updates target capabilities in the workspace. Review and save, then check the release again.','検証は作業状態の対象機能を更新します。確認して保存した後、配布を再確認してください。')}</p>
            <Button disabled={busy} onClick={verifyAssets}>{t('验证目标素材','Verify target assets','対象素材を検証')} · {targetLabel(target)}</Button>
            <AssetVerificationStatus progress={verificationProgress} locale={locale}/>
            <VerificationAssetList assets={unverified} target={targetLabel(target)} locale={locale}/>
            {!!verificationIssues.length && <div className="publish-verification-issues" role="region" aria-label={t('素材验证问题','Asset verification issues','素材検証の問題')} tabIndex={0}>{verificationIssues.map((issue,index)=><IssueNotice key={index} issue={issue} locale={locale}/>)}</div>}
          </section>
          <section className="publish-checks" ref={checksRef}><h2 tabIndex={-1}>{t('检查结果', 'Check results', '確認結果')}</h2>
            {ready === false && <p role="status">{t('构建服务尚未就绪', 'Build service unavailable', '構築サービス未準備')}</p>}
            {ready && !checking && !error && !plan && !savedIssues.length && <p>{t('检查后可在这里查看目标能力、阻断项和修复入口。', 'After checking, find target capabilities, blockers and repair actions here.', '確認後、対象機能、問題、修正方法がここに表示されます。')}</p>}
            {buildCancelled && <p role="status">{receipt ? t('构建已取消。上一份有效产物仍可打开。', 'Build cancelled. The previous release is still available.', '構築を中止しました。前回の配布物を引き続き開けます。') : t('构建已取消。', 'Build cancelled.', '構築を中止しました。')}</p>}
            {error && <div className="workbench-error publish-check-error" role="alert" tabIndex={0}><CircleAlert size={16}/><span>{error}</span></div>}
            {!!savedIssues.length && <div className="publish-issue-list" role="region" aria-label={t('保存版本诊断', 'Saved revision diagnostics', '保存済みリビジョンの診断')} tabIndex={0}>
              {savedIssues.map((issue, index) => {
                const issueSource = issue.source;
                const recovery = locateSource && issueSource ? { label: t('定位问题', 'Locate issue', '問題へ移動'), run: () => locateSource(issueSource) }
                  : issue.code.startsWith('BUILD_OUTPUT_') ? { label: t('定位输出目录', 'Locate output directory', '出力ディレクトリへ移動'), run: () => showConfiguration('output') }
                  : locateDependency && issue.actions.includes('supplyDependency') ? { label: t('定位缺少的依赖', 'Locate missing dependency', '不足している依存を表示'), run: () => locateDependency(issue) }
                  : undefined;
                return <IssueNotice key={index} issue={issue} locale={locale} recovery={recovery}/>;
              })}
            </div>}
            {plan && <div className="publish-check-results">
              <p>{t('已冻结保存版本', 'Frozen saved release', '固定済み保存バージョン')} · {plan.input.releaseVersion}</p>
              <Badge tone={canBuild ? 'good' : 'warm'}>{canBuild ? t('检查完成，可以构建', 'Checks complete · ready to build', '確認完了・構築できます') : t('修复阻塞项后重新检查', 'Resolve blockers, then check again', '問題を修正して再確認')}</Badge>
              <p className="publish-diagnostic-summary" role="status">{t(`诊断：${issueCounts.error} 项阻塞 · ${issueCounts.warning} 项警告 · ${issueCounts.info} 项提示`, `Diagnostics: ${issueCounts.error} blockers · ${issueCounts.warning} warnings · ${issueCounts.info} notes`, `診断：問題 ${issueCounts.error} 件・警告 ${issueCounts.warning} 件・情報 ${issueCounts.info} 件`)}</p>
            </div>}

            {plan && <div className="publish-diagnostics">
              {!!plan.issues.length && <>
                {plan.issues.length > 5 && <Field label={t('搜索诊断', 'Search diagnostics', '診断を検索')}>
                  <Input value={issueQuery} onChange={event => setIssueQuery(event.target.value)} />
                </Field>}
                {!!query && <div className="publish-filter-status">
                  <p role="status">{t(`显示 ${visibleIssues.length} / ${plan.issues.length} 项诊断`, `Showing ${visibleIssues.length} of ${plan.issues.length} diagnostics`, `診断 ${plan.issues.length} 件中 ${visibleIssues.length} 件を表示`)}</p>
                  <Button tone="quiet" onClick={() => setIssueQuery('')}>{t('显示全部诊断', 'Show all diagnostics', 'すべての診断を表示')}</Button>
                  {!!hiddenBlockers && <p className="publish-hidden-blockers" role="status">{t(`另有 ${hiddenBlockers} 项阻塞未在搜索结果中显示，仍需修复。`, `${hiddenBlockers} blockers are outside these search results and still need attention.`, `検索結果外に未解決の問題が ${hiddenBlockers} 件あります。`)}</p>}
                </div>}
                <div className="publish-issue-list" role="region" aria-label={t('检查诊断', 'Check diagnostics', '確認の診断')} tabIndex={0}>
                  {visibleIssues.length ? visibleIssues.map(({ issue, index }) => {
                    const settings = issueSettingsSection(issue.code, issue.message);
                    const issueSource = issue.source;
                    return <div className="publish-issue" key={index}>
                      <strong className="publish-issue-severity">{issue.severity === 'error' ? t('阻塞', 'Blocker', '問題') : issue.severity === 'warning' ? t('警告', 'Warning', '警告') : t('提示', 'Note', '情報')}</strong>
                      <IssueNotice issue={issue} locale={locale} recovery={locateSource && issueSource ? { label: t('定位问题', 'Locate issue', '問題へ移動'), run: () => locateSource(issueSource) }
                        : locateDependency && issue.actions.includes('supplyDependency') ? { label: t('定位缺少的依赖', 'Locate missing dependency', '不足している依存を表示'), run: () => locateDependency(issue) } : undefined}/>
                      {settings && <Button onClick={() => locateSettings(settings)}>{t('查看相关设置', 'Review related settings', '関連設定を確認')}</Button>}
                    </div>;
                  }) : <p>{t('没有匹配的诊断。', 'No matching diagnostics.', '一致する診断はありません。')}</p>}
                </div>
              </>}
              {!!plan.capabilityResults?.length && <details className="publish-capabilities">
                <summary>{t(`目标能力详情 · ${plan.capabilityResults.length} 项`, `Target capability details · ${plan.capabilityResults.length}`, `対象機能の詳細・${plan.capabilityResults.length} 件`)}</summary>
                <div className="publish-capability-list" role="region" aria-label={t('目标能力检查', 'Target capability checks', '対象機能の確認')} tabIndex={0}>
                  {plan.capabilityResults.map((capability, index) => <div className="publish-capability" key={index}>
                    <p><strong>{capability.treatment === 'native' ? t('原生支持', 'Native support', '標準対応') : capability.treatment === 'converted' ? t('已转换', 'Converted', '変換済み') : capability.treatment === 'skipped' ? t('已跳过', 'Skipped', 'スキップ済み') : t('阻塞', 'Blocked', '問題')}</strong>{capability.reason && <> · {capability.reason}</>}</p>
                    <code>{capability.provider} / {capability.feature}</code>
                  </div>)}
                </div>
              </details>}
            </div>}
          </section>
          <section className="publish-result" ref={resultRef}><h2 tabIndex={-1}>{t('构建结果', 'Build result', '構築結果')}</h2>
            {!receipt ? <p>{t('构建完成后，在这里打开发行目录并进行本机体验。', 'After building, open the release directory and play locally here.', '構築後、ここから配布先を開いてローカルでプレイできます。')}</p> : <div className="publish-receipt">
              <strong>{receipt.releaseVersion} · {targetLabel(receipt.target)}</strong>
              {receiptPlan !== plan?.planId && <p>{t('上次构建结果 · 当前配置尚未重新构建', 'Previous build · current configuration has not been rebuilt', '前回の構築結果・現在の設定では未構築')}</p>}
              <p><Badge tone={receipt.localTest.result === 'passed' ? 'good' : receipt.localTest.result === 'failed' ? 'warm' : ''}>{t('本机体验', 'Local playtest', 'ローカルプレイ')} · {localTestLabel(receipt.localTest.result, locale)}</Badge></p>
              <div className="gc-actions publish-result-actions">
                <Button disabled={busy} onClick={() => void run(async () => { unwrap(await bridge.files.openBuild(receiptPlan!)); })}><FolderOpen size={16}/>{t('打开输出目录', 'Open output directory', '出力先を開く')}</Button>
                  {(receipt.target === 'web' || receipt.target === 'windows') && <Button disabled={busy} onClick={() => void run(async () => { setReceipt(unwrap(await bridge.builds.test(receiptPlan!))); })}>{t('本机体验', 'Play locally', 'ローカルでプレイ')}</Button>}
                <Button disabled={busy} tone="quiet" onClick={() => void run(async () => { unwrap(await bridge.builds.instructions(receiptPlan!)); })}>{t('查看交付说明', 'Open instructions', '配布説明を開く')}</Button>
              </div>
              <details><summary>{t('发行文件详情', 'Release file details', '配布ファイルの詳細')}</summary><dl className="publish-file-details">
                <dt>{t('输出目录', 'Output directory', '出力ディレクトリ')}</dt><dd>{receipt.outputDirectory}</dd>
                <dt>{t('交付物', 'Handoff', '配布物')}</dt><dd>{receipt.handoff.path}</dd>
                <dt>{t('说明文件', 'Instructions', '説明ファイル')}</dt><dd>{receipt.instructionsPath}</dd>
                {receipt.targetSigning&&<><dt>{t('目标签名','Target signing','対象の署名')}</dt><dd>{receipt.targetSigning.mode==='notApplied'?t('工程未执行签名','Project exported without signing','署名せずプロジェクトを出力'):receipt.targetSigning.mode==='test'?t('本地测试签名','Local test signing','ローカルテスト署名'):t('作者发布签名','Author release signing','作者の配布用署名')} {receipt.targetSigning.identity??''}</dd></>}
                {receipt.signature && <><dt>{t('Windows 签名', 'Windows signature', 'Windows 署名')}</dt><dd>{receipt.signature.status === 'unsigned' ? t('未签名', 'Unsigned', '未署名')
                  : `${receipt.signature.subject} · ${receipt.signature.trust === 'trusted' ? t('受信任', 'Trusted', '信頼済み') : t('证书未受信任', 'Certificate not trusted', '証明書は未信頼')}`}</dd></>}
              </dl></details>
            </div>}
          {compatibility && <section aria-label={t('旧档兼容报告', 'Save compatibility report', 'セーブ互換性レポート')}>
            <h2>{t('旧档兼容报告', 'Save compatibility report', 'セーブ互換性レポート')}</h2>
            {!!compatibility.missingSamples.length && <p>{t('未验证样本', 'Unverified samples', '未検証サンプル')}: {compatibility.missingSamples.join(', ')}</p>}
            {compatibility.fileIssues.map((entry, index) => <p key={index} role="alert">{entry.file}: {entry.issues.map(issue => issueText(issue, locale)).join('; ')}</p>)}
            {compatibility.samples.map((sample, index) => <article key={index}>
              <strong>{sample.source.kind} · {sample.fromRelease} → {sample.toRelease} · {sample.result}</strong>
              <p>{sample.source.file}</p><p>{sample.source.id}</p>
              <p>{sample.longTermBasis === 'provided' ? t('使用包内长期资料', 'Uses supplied long-term data', '同梱の長期データを使用') : t('使用作品初值 · 未覆盖真实长期资料', 'Uses project defaults · actual long-term data untested', '作品の初期値を使用・実際の長期データは未検証')}</p>
              {sample.issues.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}
            </article>)}
          </section>}
          </section>
        </section>
        <section className="publish-settings-document" hidden={engineOpen || !settings}>
          <fieldset disabled={busy}>
          <div className="publish-advanced" ref={advancedRef}>
            <section className="publish-settings-section" data-publish-settings="assets" hidden={settings !== "assets"}><h3>{t('素材与字体', 'Assets & fonts', '素材とフォント')}</h3>
          <Field label={t('字体处理', 'Font packaging', 'フォントの配布')}>
            <Choice label={t('字体处理', 'Font packaging', 'フォントの配布')} value={fontMode}
              onChange={value => { setFontMode(value as typeof fontMode); setPlan(null); }}
              options={[{ value: 'full', label: t('完整字体', 'Full fonts', '完全なフォント') },
                { value: 'subsetStatic', label: t('静态文字子集＋完整回退', 'Static subset + full fallback', '静的文字のサブセット＋完全な代替フォント') }]} />
          </Field>
          {fontMode === 'subsetStatic' && <Field label={t('动态文字回退字体', 'Dynamic text fallback', '動的テキストの代替フォント')}>
            <Choice label={t('动态文字回退字体', 'Dynamic text fallback', '動的テキストの代替フォント')} value={fallbackAssetId ?? ''}
              onChange={value => { setFallbackAssetId(value || null); setPlan(null); }}
              options={[{ value: '', label: t('随包完整 Noto 中日文字体', 'Bundled full Noto Chinese/Japanese', '同梱の完全な Noto 中国語・日本語フォント') },
                ...assets.filter(asset => asset.kind === 'font').map(asset => ({ value: asset.id, label: asset.name }))]} />
          </Field>}
          <h4>{t('显式保留素材', 'Retain additional assets', '追加素材を保持')}</h4>
            <p>{t('仅加入已选资源的当前采用版本；完整作品备份另外保留全部版本。', 'Include selected assets at their adopted versions. Full project backups retain all versions.', '選択素材の採用済みバージョンを含めます。作品全体のバックアップは全バージョンを保持します。')}</p>
            <div className="publish-asset-list">{!assets.length && <p>{t('没有可额外保留的素材', 'No additional assets available', '追加できる素材はありません')}</p>}{assets.map(asset => <label key={asset.id} className="publish-check-option">
              <input type="checkbox" checked={keepAssets.includes(asset.id)} onChange={event => { setKeepAssets(current => event.target.checked ? [...current, asset.id] : current.filter(id => id !== asset.id)); setPlan(null); }} />{asset.name}
            </label>)}</div>

          <Button disabled={busy} onClick={verifyAssets}>{t('验证目标素材', 'Verify target assets', '対象の素材を検証')}</Button>
          <AssetVerificationStatus progress={verificationProgress} locale={locale}/>
          {!!verificationIssues.length && <div className="publish-verification-issues" role="region" aria-label={t('素材验证问题','Asset verification issues','素材検証の問題')} tabIndex={0}>{verificationIssues.map((issue,index)=><IssueNotice key={index} issue={issue} locale={locale}/>)}</div>}
          <p>
            {t(
              "依赖、目标能力、素材与旧存档由真实构建服务检查。",
              "The build service checks dependencies, target capabilities, assets and old saves.",
              "構築サービスが依存関係、機能、素材、旧セーブを確認します。",
            )}
          </p>
            </section>
            <section className="publish-settings-section" data-publish-settings="compatibility" hidden={settings !== "compatibility"}><h3>{t('旧档兼容性', 'Save compatibility', '旧セーブの互換性')}</h3>
          <Button disabled={busy} onClick={() => void run(async () => {
            setOldSaveFiles(unwrap(await bridge.builds.chooseOldSaves())); setPlan(null);
          })}>{t('选择代表旧档', 'Select representative saves', '代表的な旧セーブを選択')}</Button>
          <p>{oldSaveFiles.length ? t(`已选择 ${oldSaveFiles.length} 份旧档`, `${oldSaveFiles.length} saves selected`, `${oldSaveFiles.length} 件の旧セーブを選択済み`) : t('未选择旧档 · 兼容性未验证', 'No old saves selected · compatibility unverified', '旧セーブ未選択・互換性未検証')}</p>
          {!!oldSaveFiles.length && <details><summary>{t('已选旧档文件', 'Selected save files', '選択した旧セーブファイル')}</summary>{oldSaveFiles.map(file => <p key={file}>{file}</p>)}</details>}
          <h4>{t('旧入口映射', 'Old entry mappings', '旧エントリの対応付け')}</h4>
            <p>{t('仅在作者确认对应关系后，为删除或迁移的旧语句添加映射。', 'Map removed or moved statements after confirming their intended destinations.', '削除・移動した文の移行先を確認して対応付けます。')}</p>
            {entryMappings.map((mapping, index) => <fieldset className="publish-mapping" key={index}>
              {([['oldRelease', t('旧发行版本', 'Old release', '旧配布バージョン')], ['oldSceneId', t('旧场景 ID', 'Old scene ID', '旧シーン ID')],
                ['oldStatementId', t('旧语句 ID', 'Old statement ID', '旧文 ID')], ['newSceneId', t('目标场景 ID', 'Target scene ID', '移行先シーン ID')],
                ['newStatementId', t('目标语句 ID', 'Target statement ID', '移行先文 ID')], ['reason', t('映射原因', 'Reason', '理由')]] as const).map(([key, label]) =>
                <Field key={key} label={label}><Input value={mapping[key]} onChange={event => { setEntryMappings(current => current.map((item, position) => position === index ? { ...item, [key]: event.target.value } : item)); setPlan(null); }} /></Field>)}
              <Button onClick={() => { setEntryMappings(current => current.filter((_, position) => position !== index)); setPlan(null); }}>{t('删除映射', 'Remove mapping', '対応付けを削除')}</Button>
            </fieldset>)}
            <Button onClick={() => { setEntryMappings(current => [...current, { oldRelease: '', oldSceneId: '', oldStatementId: '', newSceneId: '', newStatementId: '', reason: '' }]); setPlan(null); }}>{t('添加入口映射', 'Add entry mapping', 'エントリを対応付ける')}</Button>

            </section>
            <section className="publish-settings-section" data-publish-settings="platform" hidden={settings !== "platform"}><h3>{t('平台选项', 'Platform options', 'プラットフォームの設定')}</h3>
          <SteamAppIdEditor value={steamAppId} savedValue={source.project.platform.steamAppId} locale={locale} busy={busy} change={setSteamAppId} apply={async appId => {
            const documents = unwrap(await bridge.documents.list()), document = documents.find(item => item.documentId === source.projectDocumentId);
            if (!document || document.revision !== source.projectRevision) throw new Error(t('作品版本已变化，请刷新后复核 AppID。当前输入已保留。','The work changed. Refresh and review the AppID; input is retained.','作品が変更されました。更新して AppID を確認してください。入力を保持しています。'));
            const expected = [{ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision }];
            const edit = unwrap(await bridge.documents.planEdit({label:t('修改 Steam AppID','Change Steam AppID','Steam AppID を変更'),origin:'field',expected,patches:[{kind:'json',documentId:document.documentId,changes:[{path:'/data/platform/steamAppId',before:source.project.platform.steamAppId,after:appId,op:'set'}]}],preparedAssets:[],requiredRefs:[]}));
            const receipt = unwrap(await bridge.documents.applyEdit(edit.planId,expected)); setPlan(null); await changed(receipt);
          }}/>
          <label className="publish-check-option"><input type="checkbox" checked={steamRequired} onChange={event => { setSteamRequired(event.target.checked); setPlan(null); }} />
            {t('本次发行必须支持剧情中的 Steam 成就', 'Require Steam achievements used in the story', '使用する Steam 実績を今回の配布で必須にする')}
          </label>
          {assets.some(asset => asset.kind === 'live2d') && <fieldset className="publish-live2d">
            <legend>Live2D · Cubism Web R4 / MotionSync R2</legend>
            <Button disabled={busy} onClick={() => void run(async () => { unwrap(await services.bridge.engines!.importLive2D(false)); setPlan(null); await changed(); })}>
              {t('导入并锁定 R4 SDK', 'Import and lock R4 SDK', 'R4 SDK を取り込み固定')}</Button>
            <Button disabled={busy} onClick={() => void run(async () => { unwrap(await services.bridge.engines!.importLive2D(true)); setPlan(null); await changed(); })}>
              {t('导入并锁定 R4＋R2 SDK', 'Import and lock R4 + R2 SDKs', 'R4＋R2 SDK を取り込み固定')}</Button>
            <Field label={t('使用目的', 'Intended use', '利用目的')}><Choice label={t('使用目的', 'Intended use', '利用目的')} value={live2dPurpose} onChange={value => { setLive2dPurpose(value as typeof live2dPurpose); setPlan(null); }} options={[{value: 'distribution', label: t('正式发行', 'Distribution', '配布')}, {value: 'localTest', label: t('仅本地验收', 'Local testing only', 'ローカル検証専用')}]} /></Field>
            {live2dPurpose === 'distribution' ? <label className="publish-check-option"><input type="checkbox" checked={live2dLicenseConfirmed} onChange={event => { setLive2dLicenseConfirmed(event.target.checked); setPlan(null); }} />
              {t('已确认本作品适用的 SDK 发布资格', 'I have confirmed the SDK release eligibility for this work', 'この作品に適用される SDK の配布資格を確認しました')}</label> :
              <p>{t('产物说明会注明仅用于本地验收。', 'The package instructions will identify it as local testing only.', 'パッケージの説明にローカル検証専用と記載します。')}</p>}
          </fieldset>}
            </section>
          </div>
          </fieldset>
          {error && <p role="alert" className="workbench-error">{error}</p>}
          <footer><Button onClick={returnToRelease}>{t('返回检查与构建', 'Back to check & build', '確認と構築へ戻る')}</Button></footer>
        </section>
      {engineOpen && <section className="publish-engine-document" aria-label={t('引擎版本与历史', 'Engine version & history', 'エンジンバージョンと履歴')}>
        <header className="publish-engine-heading"><h2>{t('引擎版本与历史', 'Engine version & history', 'エンジンバージョンと履歴')}</h2><Button tone="quiet" onClick={returnToRelease}>{t('返回发行配置', 'Back to release configuration', '配布設定へ戻る')}</Button></header>
        <p>{t('当前引擎', 'Current engine', '現在のエンジン')} · <strong>{source.project.engineVersion}</strong></p>
        {source.anyDirty && <p role="status">{t('请先保存作品修改，再准备升级副本。', 'Save project changes before preparing an upgrade copy.', '更新用コピーを準備する前に変更を保存してください。')}</p>}
            <Field label={t('目标引擎', 'Target engine', '対象エンジン')}>
              <Choice label={t('目标引擎', 'Target engine', '対象エンジン')} value={upgradeVersion}
                onChange={value => { setUpgradeVersion(value); setUpgrade(null); }}
                options={[{ value: '', label: t('选择已安装版本', 'Select installed version', 'インストール済みバージョンを選択') },
                  ...engines.map(engine => ({ value: engine.version, label: engine.version === source.project.engineVersion ? `${engine.version} · ${t('检查当前版本', 'Check current version', '現在のバージョンを確認')}` : engine.version }))]} />
            </Field>
            {upgradeVersion === source.project.engineVersion && <p>{t('使用当前已安装引擎检查旧作品，在副本验证后确认；作品与依赖版本保持不变。', 'Validate an existing project with the installed engine in a copy, then confirm. Project and dependency versions stay unchanged.', 'インストール済みエンジンで既存作品のコピーを検証して確定します。作品と依存バージョンは変わりません。')}</p>}
            {upgradeVersion && upgradeVersion !== source.project.engineVersion && !engines.find(engine => engine.version === upgradeVersion)?.conversions.some(item => item.from === source.project.engineVersion) &&
              <p>{t('该版本未声明当前版本的转换路径，无法切换。', 'This engine declares no conversion from the current version.', '現在のバージョンからの変換経路がありません。')}</p>}
            {upgrade && <div>
              <p>{upgrade.from === upgrade.to ? `${upgrade.to} · ${t('当前版本检查', 'Current version check', '現在のバージョン確認')}` : `${upgrade.from} → ${upgrade.to}`}</p><p>{t('原作品副本', 'Original project copy', '元の作品コピー')}: {upgrade.originalCopy}</p>
              <ul>{upgrade.changes.map(change => <li key={change.file}>{change.file} · {change.description}</li>)}</ul>
              {upgrade.validation?.checks.map((check, index) => <p key={index}>{check.target} · {check.kind} · {check.result === 'pass' ? t('通过', 'Passed', '成功') : check.result === 'fail' ? t('失败', 'Failed', '失敗') : t('未执行', 'Not run', '未実行')}{check.issues.map(issue => ` · ${issueText(issue, locale)}`).join('')}</p>)}
            </div>}
            <h3>{t('切换历史', 'Version history', '変更履歴')}</h3>
            {upgrades.filter(item => item.state === 'committed').map(item => <div key={item.id}>
              <p>{item.from === item.to ? `${item.to} · ${t('当前版本检查', 'Current version check', '現在のバージョン確認')}` : `${item.from} → ${item.to}`} · {item.originalCopy}</p>
              <Button disabled={busy} onClick={() => void run(async () => {
                const result = await bridge.upgrades.restore(item.id);
                unwrap(result); setUpgrade(null); setPlan(null); await changed();
                setUpgrades(unwrap(await bridge.upgrades.history()));
                if (result.ok && result.warnings.length) setError(result.warnings.map(warning => warning.message).join('\n'));
              })}>{t('备份当前作品并恢复切换前副本', 'Back up current project and restore original', '現在の作品をバックアップして元に戻す')}</Button>
            </div>)}
        {!upgrades.some(item => item.state === 'committed') && <p>{t('尚无引擎切换历史。', 'No engine changes yet.', 'エンジン変更の履歴はありません。')}</p>}
        <footer className="dialog-actions publish-engine-actions">
          {error && <p role="alert" className="workbench-error">{error}</p>}
          <div className="gc-actions"><Button onClick={returnToRelease}>{t('完成', 'Done', '完了')}</Button>
            <Button tone={upgrade ? undefined : "primary"} disabled={busy || !upgradeVersion || source.anyDirty} onClick={() => void run(async () => {
              const documents = unwrap(await bridge.documents.list());
              const operationId = createId();
              setUpgradeOperationId(operationId);
              try {
                setUpgrade(unwrap(await bridge.upgrades.plan({ projectId: source.project.projectId, operationId, toVersion: upgradeVersion,
                  expected: documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })), representativeSaves: oldSaveFiles })));
              } finally { setUpgradeOperationId(null); }
            })}>{upgradeVersion === source.project.engineVersion ? t('准备副本并检查', 'Prepare and check copy', 'コピーを準備して確認') : t('准备升级副本并验证', 'Prepare and validate upgrade copy', '更新用コピーを準備して検証')}</Button>
            {upgradeOperationId && <Button onClick={() => { void bridge.upgrades.cancel(upgradeOperationId).then(result => {
              if (!result.ok) setError(issueText(result.error, locale));
            }); }}>{t('取消升级准备', 'Cancel upgrade preparation', '更新準備を中止')}</Button>}
          {upgrade && <>
              <Button tone="primary" disabled={busy || !upgrade.validation || upgrade.validation.checks.some(check => check.result !== 'pass')} onClick={() => void run(async () => {
                const result = await bridge.upgrades.commit(upgrade.id);
                unwrap(result); setUpgrade(null); setPlan(null); await changed();
                setUpgrades(unwrap(await bridge.upgrades.history()));
                if (result.ok && result.warnings.length) setError(result.warnings.map(warning => warning.message).join('\n'));
              })}>{upgrade.from === upgrade.to ? t('确认当前版本检查', 'Confirm current version check', '現在のバージョン確認を確定') : t('确认升级作品', 'Confirm project upgrade', '作品の更新を確定')}</Button>
          </>}
          </div>
        </footer>
      </section>}

        </div>
        <footer ref={actionStripRef} className="publish-action-strip" hidden={engineOpen || !!settings} aria-label={t('发行操作','Release actions','配布操作')}>
          <p role="status"><strong>{targetLabel(activeBuild?.input.target ?? target)} · {activeBuild?.input.releaseVersion ?? plan?.input.releaseVersion ?? savedSelection?.version ?? version}</strong>
            <span>{cancelPending ? t('正在请求取消…', 'Requesting cancellation…', '中止を要求しています…')
              : activeBuild ? t('正在构建…', 'Building…', '構築中…')
              : checking ? t('正在检查保存版本…', 'Checking saved release…', '保存済みバージョンを確認中…')
              : ready === null ? t('正在读取构建服务状态…', 'Reading build service status…', '構築サービスの状態を読み込み中…')
              : ready === false ? t('构建服务尚未就绪', 'Build service unavailable', '構築サービス未準備')
              : buildCancelled ? t('构建已取消', 'Build cancelled', '構築を中止しました')
              : plan ? canBuild ? receiptPlan === plan.planId ? t('构建完成', 'Build complete', '構築完了') : t('检查通过，可以构建', 'Checks passed · ready to build', '確認済み・構築できます') : t(`存在 ${issueCounts.error} 项阻塞`, `${issueCounts.error} blockers`, `問題 ${issueCounts.error} 件`)
              : savedIssues.length ? t('检查发现待处理问题', 'Checks found issues', '問題が見つかりました')
              : !savedSelection && (source.anyDirty || identityDirty) ? t('请保存修改或选用上次保存版本', 'Save changes or choose the last saved release', '変更を保存するか、前回の保存済みバージョンを選択してください')
              : t('已保存内容用于检查与构建', 'Checks and builds use saved content', '保存済みの内容を確認・構築します')}</span></p>
          <div className="gc-actions publish-build-actions">
            {activeBuild ? <Button disabled={cancelPending} onClick={() => cancelBuild(activeBuild.planId)}>{t('取消构建', 'Cancel build', '構築を中止')}</Button> : <>
              <Button data-release-action="check" disabled={busy || !ready} onClick={() => checkRelease(false)}>{t('仅检查', 'Check only', '確認のみ')}</Button>
              <Button data-release-action="build" tone="primary" disabled={busy || !ready} onClick={() => {
                if (plan && canBuild && receiptPlan !== plan.planId) runLocalRelease(() => requestBuild(plan));
                else checkRelease(true);
              }}>{plan && canBuild && receiptPlan !== plan.planId ? t(`构建 ${targetLabel(target)}`, `Build ${targetLabel(target)}`, `${targetLabel(target)} を構築`) : t('检查并构建', 'Check and build', '確認して構築')}<ArrowRight size={15}/></Button>
            </>}
          </div>
        </footer>
      </div>
      {replacement && <Modal title={t('替换现有发行产物？', 'Replace the existing release?', '既存の配布物を置き換えますか？')} close={() => setReplacement(null)}>
        <p>{t('构建成功后会替换此目录的发行产物。', 'A successful build will replace the release in this directory.', '構築が成功すると、このディレクトリの配布物を置き換えます。')}</p>
        <dl className="publish-replacement-details">
          <dt>{t('输出目录', 'Output directory', '出力ディレクトリ')}</dt><dd>{replacement.checked.input.outputDirectory}</dd>
          {typeof replacement.warning.messageParams?.previousVersion === 'string' && <><dt>{t('现有发行版本', 'Existing release', '既存の配布バージョン')}</dt><dd>{replacement.warning.messageParams.previousVersion}</dd></>}
          <dt>{t('本次构建版本', 'New release', '今回の配布バージョン')}</dt><dd>{replacement.checked.input.releaseVersion} · {targetLabel(replacement.checked.input.target)}</dd>
        </dl>
        <footer className="dialog-actions">
          <Button onClick={() => setReplacement(null)}>{t('取消', 'Cancel', 'キャンセル')}</Button>
          <Button tone="danger" disabled={busy} onClick={() => {
            const checked = replacement.checked;
            setReplacement(null);
            void run(() => buildChecked(checked));
          }}>{t('确认替换并构建', 'Replace and build', '置き換えて構築')}</Button>
        </footer>
      </Modal>}
    </main>
  );
}
