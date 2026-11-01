import type { BuildReceipt } from '@galcraft/contracts';

export function localTestLabel(result: BuildReceipt['localTest']['result'], locale: string): string {
  const labels = {
    passed: ['已通过', 'Passed', '成功'],
    failed: ['未通过', 'Failed', '失敗'],
    notExecuted: ['未执行', 'Not run', '未実行'],
  };
  return labels[result][locale === 'en' ? 1 : locale === 'ja' ? 2 : 0]!;
}

/** Only offer settings that can act on an actual publishing diagnostic. */
export function issueSettingsSection(code: string, message = ''): 'assets' | 'compatibility' | 'platform' | null {
  if (['BUILD_FONT_FALLBACK', 'BUILD_FONT_SUBSET'].includes(code)) return 'assets';
  if (code === 'COMPATIBILITY_FILE') return 'compatibility';
  if (code === 'BUILD_LIVE2D_RUNTIME') return 'platform';
  if (code === 'BUILD_CAPABILITY' && message.startsWith('org.galcraft.steam/')) return 'platform';
  return null;
}
