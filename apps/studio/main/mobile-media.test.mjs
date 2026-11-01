import { expect, it } from 'vitest';
import { mobileMediaIssue } from './mobile-media.mjs';
it('requires a declared mobile format and keeps platform providers on their own validation path', () => {
  const image = { id: 'ImageA', name: 'Title', kind: 'image' }, png = { entry: 'title.png', files: [{ path: 'title.png', mime: 'image/png' }] };
  expect(mobileMediaIssue(image, png, 'android')).toBeNull(); expect(mobileMediaIssue(image, png, 'ios')).toBeNull();
  expect(mobileMediaIssue({ ...image, kind: 'audio' }, { ...png, files: [{ path: 'title.png', mime: 'audio/ogg' }] }, 'ios')).toMatchObject({ code: 'ASSET_MOBILE_FORMAT' });
  expect(mobileMediaIssue({ ...image, kind: 'effect' }, { ...png, groupCapabilities: { resolver: 'example.plugin/group' } }, 'ios')).toBeNull();
});
