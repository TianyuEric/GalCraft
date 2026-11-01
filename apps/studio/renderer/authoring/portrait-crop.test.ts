import { describe, expect, it } from 'vitest';
import { assetPagination } from './asset-pagination.js';
import { constrainPortraitCrop, movePortraitCrop, resizePortraitCrop } from './portrait-crop.js';

describe('portrait crop interaction geometry', () => {
  const crop = { x: .2, y: .1, width: .4, height: .3 };
  it('moves without changing size and stops at every image edge', () => {
    expect(movePortraitCrop(crop, -1, -1)).toEqual({ ...crop, x: 0, y: 0 });
    expect(movePortraitCrop(crop, 1, 1)).toEqual({ ...crop, x: .6, y: .7 });
  });
  it('resizes each corner while keeping the opposite corner fixed', () => {
    const nw = resizePortraitCrop(crop, 'nw', .1, .1); expect(nw.x).toBeCloseTo(.3); expect(nw.y).toBeCloseTo(.2); expect(nw.x + nw.width).toBeCloseTo(.6); expect(nw.y + nw.height).toBeCloseTo(.4);
    const ne = resizePortraitCrop(crop, 'ne', .1, -.05); expect(ne.x).toBe(.2); expect(ne.y + ne.height).toBeCloseTo(.4); expect(ne.width).toBeCloseTo(.5);
    const sw = resizePortraitCrop(crop, 'sw', -.1, .1); expect(sw.x + sw.width).toBeCloseTo(.6); expect(sw.y).toBe(.1); expect(sw.height).toBeCloseTo(.4);
    const se = resizePortraitCrop(crop, 'se', .1, .1); expect(se.x).toBe(.2); expect(se.y).toBe(.1); expect(se.width).toBeCloseTo(.5); expect(se.height).toBeCloseTo(.4);
  });
  it('prevents corner crossing and keeps numeric crop values within the canvas', () => {
    const tiny = resizePortraitCrop(crop, 'nw', 2, 2); expect(tiny.width).toBeCloseTo(.01); expect(tiny.height).toBeCloseTo(.01);
    expect(resizePortraitCrop(crop, 'se', 2, 2)).toEqual({ ...crop, width: .8, height: .9 });
    expect(constrainPortraitCrop({ x: .9, y: .9, width: .5, height: .35 })).toEqual({ x: .5, y: .65, width: .5, height: .35 });
  });
});

describe('asset page navigation', () => {
  it('shows boundaries, current page and nearby pages for a long library', () => {
    expect(assetPagination(400, 160, 40)).toMatchObject({ current: 5, pages: 10, visible: [1, 3, 4, 5, 6, 7, 10], previous: true, next: true });
  });
  it('disables unavailable navigation on empty and final pages', () => {
    expect(assetPagination(0, 0, 40)).toMatchObject({ current: 1, pages: 1, previous: false, next: false });
    expect(assetPagination(81, 80, 40)).toMatchObject({ current: 3, pages: 3, visible: [1, 2, 3], next: false });
  });
});
