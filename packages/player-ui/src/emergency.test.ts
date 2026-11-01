import { describe, expect, it } from 'vitest';
import { emergencyActionAllowed } from './emergency.js';
import { defaultPreferences, validatePreferences } from './preferences.js';

describe('emergency execution boundary', () => {
  it('allows local interaction and restoration while rejecting story, data and plugin effects', () => {
    expect(emergencyActionAllowed({ kind: 'setLocal' })).toBe(true);
    expect(emergencyActionAllowed({ kind: 'official', action: { kind: 'emergency', enabled: false } })).toBe(true);
    for (const kind of ['advance', 'start', 'continue', 'quickSave', 'quickLoad', 'saveSlot', 'loadSlot', 'selectOption', 'submitInput', 'enterFlow', 'jumpHistory', 'returnTitle', 'plugin', 'open']) {
      expect(emergencyActionAllowed({ kind })).toBe(false);
      expect(emergencyActionAllowed({ kind: 'official', action: { kind } })).toBe(false);
    }
  });
  it('inherits the work shortcut in existing profiles and validates player overrides', () => {
    const preferences = defaultPreferences('zh-CN', '');
    expect(preferences.emergencyKey).toBeNull();
    const legacy = { ...preferences }; delete (legacy as Partial<typeof legacy>).emergencyKey;
    expect(validatePreferences(legacy)).toMatchObject({ ok: true, value: { emergencyKey: null } });
    expect(validatePreferences({ ...preferences, emergencyKey: 'KeyJ' }).ok).toBe(true);
    expect(validatePreferences({ ...preferences, emergencyKey: 'Escape' }).ok).toBe(false);
  });
});
