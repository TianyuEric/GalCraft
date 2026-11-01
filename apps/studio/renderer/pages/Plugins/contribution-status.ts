import type { PluginManifest } from '@galcraft/plugins/contracts';

/** Editor diagnostics describe only the environment they can observe. */
export function contributionStatus(manifest: PluginManifest, item: { key: string; kind: string }, enabled: boolean,
  inspection?: { manifest: PluginManifest | null; definedKeys: string[]; activeKeys: string[] }) {
  if (!enabled) return 'disabled';
  const exact = inspection?.manifest?.version === manifest.version;
  if (exact && inspection.activeKeys.includes(item.key)) return 'active';
  if (exact && inspection.definedKeys.includes(item.key)) return 'definition';
  if (['resource', 'generationProvider', 'textPreparation', 'resourceProcessor', 'publishCheck'].includes(item.kind)
    || item.kind === 'tool' && manifest.externalTools?.includes(item.key)) return 'services';
  if (['stage', 'system', 'platform', 'command', 'condition'].includes(item.kind)) return 'runtime';
  return 'missing';
}

export const contributionStatusLabels = {
  disabled: ['作品未启用此版本', 'Version not enabled in project', '作品でこのバージョンは無効'],
  active: ['编辑端已加载', 'Editor loaded', '編集環境に読み込み済み'],
  definition: ['定义已读取', 'Definition loaded', '定義を読み込み済み'],
  services: ['主进程服务 · 按需调用', 'Host service · on demand', 'ホストサービス · 必要時に呼び出し'],
  runtime: ['演出运行时 · 按需加载', 'Runtime · on demand', '実行環境 · 必要時に読み込み'],
  missing: ['编辑端未加载', 'Editor not loaded', '編集環境で未読み込み'],
} as const;
