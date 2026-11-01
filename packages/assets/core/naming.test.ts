import { describe, expect, it } from 'vitest';
import { suggestedAssetName, availableAssetName, validAssetFileName, assetNameParts, retainsAssetExtension } from './naming.js';
describe('readable asset names', () => {
  it('retains the original suffix for rename, including multi-dot names and extensionless assets', () => {
    expect(assetNameParts('雨站.final.OGG')).toEqual({stem:'雨站.final',extension:'.OGG'});
    expect(retainsAssetExtension('雨站.final.OGG','音乐.OGG')).toBe(true);
    expect(retainsAssetExtension('雨站.ogg','音乐.mp3')).toBe(false);
    expect(retainsAssetExtension('雨站.ogg','音乐')).toBe(false);
    expect(retainsAssetExtension('立绘','角色.png')).toBe(false);
    expect(retainsAssetExtension('立绘','角色')).toBe(true);
  });
  it('uses scene, character and purpose with a unique ordinal', () => {
    expect(suggestedAssetName({usage:'figure',sceneName:'雨站',characterName:'林舟',extension:'png'},['雨站_林舟_立绘_001.png'])).toBe('雨站_林舟_立绘_002.png');
    expect(availableAssetName('林舟_001.png',['林舟_001.PNG','林舟_002.png'])).toBe('林舟_003.png');
  });
  it('preserves readable Unicode while removing filename separators from suggestions', () => {
    const name = suggestedAssetName({usage:'bgm',sceneName:'雨/站',extension:'.mp3'});
    expect(name).toBe('雨_站_音乐_001.mp3');expect(validAssetFileName(name)).toBe(true);
    expect(validAssetFileName('../林舟.png')).toBe(false);expect(validAssetFileName('NUL.png')).toBe(false);
  });
});
