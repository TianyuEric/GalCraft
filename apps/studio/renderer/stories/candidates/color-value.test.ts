import { describe, expect, it } from 'vitest';
import { parseColorString, rgbToHex, colorToString } from '../../components/editor-fields/vendor/dice-color-picker.js';

describe('Dice candidate color boundary', () => {
  it('preserves exact RGB and alpha through controlled string values', () => {
    for (const value of ['#b5c9e7','#24364bb3','#abcdef80','#00000000','#ffffff']) {
      expect(rgbToHex(parseColorString(value)!)).toBe(value);
    }
  });
  it('expands short HEX rather than silently turning it black', () => {
    expect(rgbToHex(parseColorString('#abc')!)).toBe('#aabbcc');
  });
  it('rejects incomplete input and out-of-range channels', () => {
    for (const value of ['#12','rgb(999,0,0)','rgba(1,2,3,2)','hsl(0,101%,50%)','hsla(0,20%,50%,2)']) expect(parseColorString(value)).toBeNull();
  });
  it('treats 360 degrees as red and retains alpha in formatted output', () => {
    expect(rgbToHex(parseColorString('hsl(360,100%,50%)')!)).toBe('#ff0000');
    expect(colorToString(parseColorString('#abcdef80')!,'rgb')).toMatch(/^rgba\(171, 205, 239,/);
  });
});
