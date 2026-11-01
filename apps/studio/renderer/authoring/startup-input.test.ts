import { describe, expect, it } from 'vitest';
import { parseStartupNumber, volumePercent } from './startup-input.js';

describe('startup media input', () => {
  it('rejects silent end-of-media starts while allowing the full end boundary', () => {
    expect(parseStartupNumber('30', { step: .01, total: 30, beforeTotal: true })).toBeUndefined();
    expect(parseStartupNumber('29.99', { step: .01, total: 30, beforeTotal: true })).toBe(29.99);
    expect(parseStartupNumber('30', { step: .01, start: 0, total: 30 })).toBe(30);
    expect(parseStartupNumber('0', { step: .01, start: 0, total: 30 })).toBeUndefined();
  });
  it('keeps blank unfinished values distinct from optional complete-media ends', () => {
    expect(parseStartupNumber('')).toBeUndefined();
    expect(parseStartupNumber('', { nullable: true })).toBeNull();
    expect(parseStartupNumber('-1')).toBeUndefined();
    expect(parseStartupNumber('250.5')).toBeUndefined();
  });
  it('round-trips normal volume percentages without floating point validation errors', () => {
    for (const value of [.29, .57, .58, .295]) {
      const percent = volumePercent(value);
      expect(parseStartupNumber(String(percent), { step: .01, max: 100 })).toBe(percent);
      expect(percent / 100).toBeCloseTo(value);
    }
  });
});
