import { useState } from 'react';
import { issueFromError, type Issue, type ResourceSnapshot, type ResourceReleaseReceipt } from '@galcraft/contracts';
import type { TaskItem } from '@galcraft/authoring/production';
import type { ProductionBridge } from './bridge.js';
import { Button } from '../../components/controls.js';
import { IssueNotice } from '../../components/issue-notice.js';
import { progressCount, progressPhase } from './task-progress.js';
import { unwrap } from './bridge.js';
import './task-execution-status.css';

const bytes = (value: number | null) => value === null ? '—' : `${(value / 1024 ** 3).toFixed(2)} GiB`;
export function TaskItemFeedback({ item, taskId, bridge, locale }: { item: TaskItem; taskId: string; bridge: Pick<ProductionBridge, 'inspectTaskResources' | 'releaseTaskResources'>; locale: string }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null), [release, setRelease] = useState<ResourceReleaseReceipt | null>(null);
  const [error, setError] = useState<Issue | null>(null), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const receipt = release ?? item.resourceRelease;
  const run = async (releasing: boolean) => { setBusy(true); setError(null); try {
    if (releasing) { const result = unwrap(await bridge.releaseTaskResources({ taskId, itemId: item.id })); setRelease(result); setSnapshot(result.after ?? result.before); setConfirm(false); }
    else setSnapshot(unwrap(await bridge.inspectTaskResources({ taskId, itemId: item.id })));
  } catch (reason) { setError(issueFromError(reason, 'M10')); } finally { setBusy(false); } };
  const renderSnapshot = (value: ResourceSnapshot) => <div className="task-resource-snapshot"><p>{value.serviceUrl} · {t('报告时间', 'Reported at', '報告日時')} {value.checkedAt}</p><dl>
    <dt>{t('整个实例队列', 'Entire instance queue', 'インスタンス全体のキュー')}</dt><dd>{t(`运行 ${value.queue.running.length} · 等待 ${value.queue.pending.length}`, `${value.queue.running.length} running · ${value.queue.pending.length} pending`, `実行 ${value.queue.running.length}・待機 ${value.queue.pending.length}`)}</dd>
    <dt>{t('服务 RAM 可用 / 总量', 'Service RAM free / total', 'サービス RAM 空き / 合計')}</dt><dd>{bytes(value.system.ramFree)} / {bytes(value.system.ramTotal)}</dd>
    {value.hostCommit && <><dt>{t('本机 Windows 提交量 / 上限', 'Local Windows commit / limit', 'ローカル Windows コミット量 / 上限')}</dt><dd>{bytes(value.hostCommit.usedBytes)} / {bytes(value.hostCommit.limitBytes)} · {value.hostCommit.checkedAt}</dd></>}
    {value.devices.map((device, index) => <div key={index}><dt>{device.name} · {t('显存可用 / 总量', 'VRAM free / total', 'VRAM 空き / 合計')}</dt><dd>{bytes(device.vramFree)} / {bytes(device.vramTotal)}</dd><dt>{t('Torch 可用 / 总量', 'Torch free / total', 'Torch 空き / 合計')}</dt><dd>{bytes(device.torchVramFree)} / {bytes(device.torchVramTotal)}</dd></div>)}
  </dl>{value.issues.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}</div>;
  return <div className="task-item-feedback">
    {item.progress.phase && <p>{progressPhase(item.progress, locale)}{item.progress.nodeName || item.progress.nodeType ? ` · ${item.progress.nodeName ?? item.progress.nodeType}` : ''}</p>}
    {['running', 'fetching', 'submitting'].includes(item.state) && <p>{progressCount(item.progress, locale)}{item.progress.elapsedMs !== undefined ? ` · ${t('已耗时', 'Elapsed', '経過')} ${(item.progress.elapsedMs / 1000).toFixed(1)} ${t('秒', 's', '秒')}` : ''}{item.progress.updatedAt ? ` · ${t('更新于', 'Updated', '更新')} ${item.progress.updatedAt}` : ''}</p>}
    {item.progress.cachedNodes?.length ? <p>{t(`已复用 ${item.progress.cachedNodes.length} 个缓存节点`, `${item.progress.cachedNodes.length} cached nodes reused`, `${item.progress.cachedNodes.length} 個のキャッシュノードを再利用`)}</p> : null}
    {item.resourceWait && <p role="status">{item.resourceWait === 'busy' ? t('等待整个服务实例的队列空闲后交接资源。', 'Waiting for the entire service queue to become idle before resource handoff.', 'リソース引き継ぎのため、サービス全体のキューの空きを待っています。') : item.resourceWait === 'policyConflict' ? t('同实例的连接资源策略冲突，请统一连接配置。', 'Connections to this instance have conflicting resource policies. Align their configurations.', '同じインスタンスの接続でリソース方針が競合しています。設定を統一してください。') : t('资源释放尚未核实，请检查指标与服务详情后处理。', 'Resource release is unverified. Review metrics and service details before resolving it.', 'リソース解放が未確認です。指標とサービスの詳細を確認してください。')}</p>}
    {item.issues.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}
    {item.remoteError && <details><summary>{t('失败节点与服务异常', 'Failed node and service exception', '失敗ノードとサービス例外')}</summary><p>{t('节点', 'Node', 'ノード')} {item.remoteError.nodeId ?? '—'} · {item.remoteError.nodeType ?? '—'} · {item.remoteError.exceptionType ?? '—'}</p><pre>{[item.remoteError.message, ...item.remoteError.traceback].join('\n')}</pre><p>promptId: {item.remoteError.promptId} · {item.remoteError.observedAt}</p></details>}
    {item.configSnapshot?.protocol === 'comfyUI' && <details><summary>{t('实例资源与释放', 'Instance resources and release', 'インスタンスのリソースと解放')}</summary><p>{t('检查与释放作用于此连接指向的整个 ComfyUI 实例。共享实例由作者手动释放。', 'Inspection and release apply to the entire ComfyUI instance used by this connection. Shared instances are released manually by the author.', '確認と解放は接続先の ComfyUI インスタンス全体に作用します。共有インスタンスは作者が手動で解放します。')}</p><div className="gc-actions"><Button disabled={busy} onClick={() => void run(false)}>{t('检查资源', 'Inspect resources', 'リソースを確認')}</Button><Button disabled={busy} onClick={() => setConfirm(true)}>{t('释放实例资源', 'Release instance resources', 'インスタンスのリソースを解放')}</Button></div>
      {confirm && <div><p>{t('确认释放整个实例中已加载的模型和执行缓存？队列忙碌时保持等待；下次制作可能需要重新加载模型。', 'Release loaded models and execution caches for this entire instance? A busy queue prevents release; the next task may need to reload models.', 'インスタンス全体の読み込み済みモデルと実行キャッシュを解放しますか？キューが使用中の場合は解放せず、次回はモデルの再読み込みが必要になる場合があります。')}</p><div className="gc-actions"><Button disabled={busy} onClick={() => setConfirm(false)}>{t('取消', 'Cancel', 'キャンセル')}</Button><Button disabled={busy} onClick={() => void run(true)}>{t('确认释放', 'Confirm release', '解放を確認')}</Button></div></div>}
      {error && <IssueNotice issue={error} locale={locale}/>}
      {snapshot && renderSnapshot(snapshot)}
      {receipt && <section><p role="status">{({ busy: t('队列忙碌，未释放', 'Queue busy; not released', 'キュー使用中・未解放'), idle: t('实例已空闲', 'Instance idle', 'インスタンス待機中'), observed: t('已观察到资源释放', 'Resource release observed', 'リソース解放を観測'), unverified: t('已接收请求，释放尚未核实', 'Request accepted; release unverified', '要求受付済み・解放未確認') })[receipt.status]}</p>{receipt.issues.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}<details><summary>{t('释放前后指标', 'Before and after metrics', '解放前後の指標')}</summary>{renderSnapshot(receipt.before)}{receipt.after && renderSnapshot(receipt.after)}</details></section>}
    </details>}
  </div>;
}
