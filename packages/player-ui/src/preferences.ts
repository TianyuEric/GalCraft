import { BuiltinPlayerMenuLocales, EmergencyKeySchema, type PlayerHost, type ProjectLanguages, type Result } from '@galcraft/contracts';
import { fail, ok } from './common.js';

export const emergencyShortcutKeys = [...Array.from({length:12},(_,index)=>`F${index+1}`), ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(key=>`Key${key}`), ...'0123456789'.split('').map(key=>`Digit${key}`)];

export type PlayerPreferences = {
  schemaVersion: 1; revision: number; textSpeed: number; fontScale: number; textboxOpacity: number;
  historyOpacity: number; volumes: Record<'master'|'bgm'|'sfx'|'voice'|'ui'|'video', number>;
  autoWaitMs: number; skipScope: 'read'|'all'; pauseOnBlur: boolean; reducedMotion: boolean;
  effects: boolean; statusIcons: boolean; avatar: boolean; chapterNotice: boolean;
  toolbarLocked: boolean; fullscreen: boolean; wheelUp: 'history'|'none'; wheelDown: 'advance'|'none';
  rightButton: 'escape'|'none'; escapeStory: 'toggleUI'; movieSkip: boolean; filmMode: boolean;
  emergencyKey: string | null;
  menuLocale: string; voiceLocale: string; interruptOnSilent: boolean; duckBgm: boolean;
  confirmations: Record<'overwrite'|'load'|'newGame'|'title'|'exit', boolean>;
};

export function effectivePlayerLanguages(languages: ProjectLanguages) {
  const menus = languages.menus.filter(locale => (BuiltinPlayerMenuLocales as readonly string[]).includes(locale));
  return { menus, menuDefault: menus.includes(languages.menuDefault) ? languages.menuDefault : menus[0] ?? 'zh-CN',
    voices: languages.voices, voiceDefault: languages.voices.length ? languages.voiceDefault : '' };
}
export type PlayerLanguages = ReturnType<typeof effectivePlayerLanguages>;
export function normalizeLanguagePreferences(value: PlayerPreferences, languages?: PlayerLanguages): PlayerPreferences {
  if (!languages) return value;
  return { ...value, menuLocale: languages.menus.includes(value.menuLocale) ? value.menuLocale : languages.menuDefault,
    voiceLocale: languages.voices.includes(value.voiceLocale) ? value.voiceLocale : languages.voiceDefault };
}

export function defaultPreferences(menuLocale: string, voiceLocale: string, reducedMotion = false): PlayerPreferences {
  return { schemaVersion: 1, revision: 0, textSpeed: 30, fontScale: 1, textboxOpacity: .9,
    historyOpacity: .7, volumes: { master: 100, bgm: 100, sfx: 100, voice: 100, ui: 100, video: 100 },
    autoWaitMs: 1500, skipScope: 'read', pauseOnBlur: true, reducedMotion,
    effects: true, statusIcons: true, avatar: true, chapterNotice: true, toolbarLocked: true,
    fullscreen: false, wheelUp: 'history', wheelDown: 'advance', rightButton: 'escape',
    escapeStory: 'toggleUI', movieSkip: true, filmMode: true, emergencyKey: null, menuLocale, voiceLocale,
    interruptOnSilent: true, duckBgm: false,
    confirmations: { overwrite: true, load: true, newGame: true, title: true, exit: true } };
}

export function validatePreferences(value: PlayerPreferences): Result<PlayerPreferences> {
  // Existing player profiles inherit the work's shortcut until the player chooses an override.
  value = { ...value, emergencyKey: value.emergencyKey ?? null };
  const range = (number: number, min: number, max: number) => Number.isFinite(number) && number >= min && number <= max;
  const defaults=defaultPreferences('zh-CN','');
  const invalidType=Object.entries(defaults).some(([key,expected])=>{if(key==='emergencyKey')return value.emergencyKey!==null&&!EmergencyKeySchema.safeParse(value.emergencyKey).success;if(expected===null)return false;const actual=(value as unknown as Record<string,unknown>)[key];return typeof expected==='object'?actual===null||typeof actual!=='object'||Array.isArray(actual)||Object.entries(expected).some(([child,type])=>typeof (actual as Record<string,unknown>)[child]!==typeof type):typeof actual!==typeof expected;});
  if(invalidType||!['read','all'].includes(value.skipScope)||!['history','none'].includes(value.wheelUp)||!['advance','none'].includes(value.wheelDown)||!['escape','none'].includes(value.rightButton)||value.escapeStory!=='toggleUI')return fail('PREFERENCES_INVALID','玩家设置包含不支持的值');
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !range(value.textSpeed, 1, 120) || !range(value.fontScale, .75, 2) ||
    !range(value.textboxOpacity, 0, 1) || !range(value.historyOpacity, 0, 1) ||
    !range(value.autoWaitMs, 0, 10000) || Object.values(value.volumes).some(number => !range(number, 0, 100)))
    return fail('PREFERENCES_INVALID', '玩家设置超出支持范围');
  return ok(value);
}

export function applyVolumes(host: Pick<PlayerHost, 'platform'>, preferences: PlayerPreferences): ReturnType<PlayerHost['platform']> {
  return host.platform('audio.preferences', { volumes: preferences.volumes, duckBgm: preferences.duckBgm });
}
