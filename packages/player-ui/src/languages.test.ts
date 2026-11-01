import { expect, it } from 'vitest';
import { ProjectLanguagesSchema, type PlayerHost } from '@galcraft/contracts';
import { FixtureDomains } from '@galcraft/contracts/fixtures';
import { defaultPreferences, effectivePlayerLanguages } from './preferences.js';
import { PlayerDataService } from './data.js';

const languages = ProjectLanguagesSchema.parse({ menus: ['en', 'ja'], menuDefault: 'ja', textDefault: 'zh-CN', voices: ['zh-CN'], voiceDefault: 'zh-CN' });
it('requires defaults inside independently declared language lists and permits silent works', () => {
  expect(ProjectLanguagesSchema.safeParse({ ...languages, menuDefault: 'zh-CN' }).success).toBe(false);
  expect(ProjectLanguagesSchema.safeParse({ ...languages, voiceDefault: 'ja' }).success).toBe(false);
  expect(ProjectLanguagesSchema.safeParse({ ...languages, voices: [] }).success).toBe(true);
  expect(ProjectLanguagesSchema.safeParse({ ...languages, menus: [] }).success).toBe(false);
  expect(ProjectLanguagesSchema.safeParse({ ...languages, voices: ['zh-CN', 'zh-CN'] }).success).toBe(false);
});
it('normalizes stored, changed and reopened preferences to the work language lists', async () => {
  const memory = new Map<string, Uint8Array>(); let revision = 0;
  const ok = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
  const host = { target: 'web', storage: { read: async (key: string) => ok(memory.get(key) ?? null),
    commit: async (input: { writes: { key: string; bytes: Uint8Array }[] }) => { for (const item of input.writes) memory.set(item.key, item.bytes); return ok({ revision: ++revision }); } } } as unknown as PlayerHost;
  const domain = FixtureDomains[0]!, prefix = `player/${domain.projectId}/player/default/`;
  memory.set(prefix+'preferences', new TextEncoder().encode(JSON.stringify(defaultPreferences('fr', 'ja'))));
  const make = () => new PlayerDataService(host, domain, languages.menuDefault, languages.voiceDefault, false, effectivePlayerLanguages(languages));
  const data = make(), opened = await data.open();
  expect(opened.ok && [opened.value.preferences.menuLocale, opened.value.preferences.voiceLocale]).toEqual(['ja', 'zh-CN']);
  const changed = await data.savePreferences({ ...data.current()!.preferences, menuLocale: 'en', voiceLocale: 'ja' }, 0);
  expect(changed.ok && [changed.value.menuLocale, changed.value.voiceLocale]).toEqual(['en', 'zh-CN']);
  const reopened = await make().open(); expect(reopened.ok && reopened.value.preferences.menuLocale).toBe('en');
  const silent = new PlayerDataService(host, domain, 'ja', 'zh-CN', false, effectivePlayerLanguages({ ...languages, voices: [] }));
  const silenced = await silent.open(); expect(silenced.ok && silenced.value.preferences.voiceLocale).toBe('');
});
