import type { PsdArtwork, PsdLayer, PsdTeachingSource } from '../psd-import-model.js';

// Prepared transparent teaching layers. The warm variants already include the effect pixels.
const artwork = (key: string, uri: string, width: number, height: number, bytes: number): PsdArtwork => ({ key, uri, width, height, bytes });
const blue = artwork('light-blue', new URL('./light-blue.png', import.meta.url).href, 350, 524, 7326);
const rose = artwork('light-rose', new URL('./light-rose.png', import.meta.url).href, 350, 524, 7315);
const roseV2 = artwork('light-rose-v2', new URL('./light-rose-v2.png', import.meta.url).href, 350, 524, 7452);
const amber = artwork('light-amber', new URL('./light-amber.png', import.meta.url).href, 350, 524, 7391);
const portrait = artwork('portrait', new URL('./portrait.png', import.meta.url).href, 270, 500, 9116);
const letter = artwork('letter', new URL('./letter.png', import.meta.url).href, 145, 165, 1232);
const letterWarm = artwork('letter-warm', new URL('./letter-warm.png', import.meta.url).href, 145, 165, 2921);
const letterAlt = artwork('letter-alt', new URL('./letter-alt.png', import.meta.url).href, 145, 165, 1230);
const letterAltWarm = artwork('letter-alt-warm', new URL('./letter-alt-warm.png', import.meta.url).href, 145, 165, 2923);
const lantern = artwork('lantern', new URL('./lantern.png', import.meta.url).href, 145, 165, 1243);
const lanternWarm = artwork('lantern-warm', new URL('./lantern-warm.png', import.meta.url).href, 145, 165, 2925);
const warm = artwork('warm-effect', new URL('./warm-effect.png', import.meta.url).href, 145, 165, 1612);
const dissolve = artwork('dissolve', new URL('./dissolve.png', import.meta.url).href, 145, 165, 1695);
const guide = artwork('guide', new URL('./guide.png', import.meta.url).href, 96, 96, 226);

export function teachingPsdLayers(revision: PsdTeachingSource['revision']): PsdLayer[] {
  const revised = revision === 'v2';
  return [
    revised
      ? { key: 'amber', path: '光景/琥珀', group: '光景', name: '琥珀', visible: true, x: 65, y: 95, artwork: amber }
      : { key: 'blue', path: '光景/青蓝', group: '光景', name: '青蓝', visible: true, x: 65, y: 95, artwork: blue },
    { key: 'rose', path: '光景/玫紫', group: '光景', name: '玫紫', visible: true, x: 65, y: 95, artwork: revised ? roseV2 : rose },
    { key: 'portrait', path: '人物', name: '人物', visible: true, x: revised ? 114 : 105, y: 118, artwork: portrait },
    { key: 'letter', path: '道具/书信', group: '道具', name: '书信', visible: true, x: 270, y: 331, artwork: letter, mergedArtwork: letterWarm },
    ...(revised ? [{ key: 'letter-alt', path: '道具/书信', group: '道具', name: '书信', visible: true, x: 266, y: 325,
      artwork: letterAlt, mergedArtwork: letterAltWarm }] : []),
    { key: 'lantern', path: '道具/提灯', group: '道具', name: '提灯', visible: true, x: 263, y: 340, artwork: lantern, mergedArtwork: lanternWarm },
    { key: 'warm-effect', path: '暖光', name: '暖光', visible: true, x: 268, y: 333, artwork: warm,
      effect: { name: '滤色', targetGroup: '道具' } },
    { key: 'dissolve', path: '颗粒', name: '颗粒', visible: true, x: 266, y: 325, artwork: dissolve,
      effect: { name: '溶解', targetGroup: '道具', skipOnlyReason: '溶解依赖源稿的随机抖动，此教学图层只能跳过。' } },
    { key: 'guide', path: '草稿/定位线', group: '草稿', name: '定位线', visible: false, x: 192, y: 312, artwork: guide },
  ];
}
