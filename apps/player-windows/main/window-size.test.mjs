import { expect, test } from 'vitest';
import { initialPlayerContentSize } from './window-size.mjs';

test.each([
  [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }],
  [{ width: 1600, height: 1000 }, { width: 1152, height: 720 }],
  [{ width: 1024, height: 768 }, { width: 960, height: 720 }],
  [{ width: 2560, height: 1080 }, { width: 1280, height: 540 }],
  [{ width: 1080, height: 1920 }, { width: 405, height: 720 }],
])('starts the %j work with matching client proportions', (canvas, expected) => {
  expect(initialPlayerContentSize(canvas)).toEqual(expected);
});
