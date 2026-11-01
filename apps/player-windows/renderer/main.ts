import { createId, issueFromError, issueDetails } from '@galcraft/contracts';
import type { PlayerHost } from '@galcraft/contracts';
import { mountRelease, readRelease } from '@galcraft/player-ui';
import '@galcraft/player-ui/player.css';
import './player.css';

declare global { interface Window { playerHost: PlayerHost;
  reportCompatibility?: (files: { file: string; bytes: number[] }[], signal?: AbortSignal) => Promise<import('@galcraft/contracts').CompatibilityReport>;
  validateScenarios?: Awaited<ReturnType<typeof mountRelease>>['validateScenarios'];
} }
const root = document.getElementById('app')!;
const base = new URL('../../../', document.baseURI);
void readRelease(base).then(async ({ manifest, snapshot }) => {
  document.title = snapshot.project.name;
  const validation = new URL(location.href).searchParams.has('galcraft-validation');
  const player = await mountRelease(root, base, window.playerHost, snapshot, manifest,
    validation ? { projectId: snapshot.projectId, kind: 'sample', instance: createId() } : undefined);
  if (validation) window.reportCompatibility = (files, signal) => player.reportCompatibility(files.map(file => ({ ...file, bytes: new Uint8Array(file.bytes) })), signal);
  if (validation) window.validateScenarios = player.validateScenarios;
}).catch(error => {
  const locale = document.documentElement.lang || navigator.language, t = (zh: string, en: string, ja: string) => locale.startsWith('en') ? en : locale.startsWith('ja') ? ja : zh;
  const panel = document.createElement('section'), message = document.createElement('p'), retry = document.createElement('button'), details = document.createElement('details'), summary = document.createElement('summary'), technical = document.createElement('pre');
  panel.className = 'player-load-error'; message.role = 'alert'; message.textContent = t('作品无法加载。请确认发行文件完整、保留原目录结构，然后重新加载。', 'The game could not load. Check that all release files are present in their original folders, then reload.', '作品を読み込めません。配布ファイルと元のフォルダー構成を確認し、再読み込みしてください。');
  retry.type = 'button'; retry.textContent = t('重新加载作品', 'Reload game', '作品を再読み込み'); retry.onclick = () => location.reload();
  summary.textContent = t('诊断详情', 'Diagnostic details', '診断の詳細'); technical.textContent = issueDetails(issueFromError(error, 'M07')); details.append(summary, technical); panel.append(message, retry, details); root.replaceChildren(panel);
});
