import '@galcraft/player-ui/player.css';
import './smoke.css';
import type { Instruction, Json, PlayerHost, Result, Snapshot } from '@galcraft/contracts';
import { FixtureIds as F, FixtureSnapshot, fixtureId as id } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate, applyReadingPreset } from '@galcraft/templates';
import { mountPlayer } from '../src/bootstrap.js';

const ok = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw Error(`${result.error.code}: ${result.error.message}`); return result.value; };
const instruction = (number: number, opcode: string, args: Json): Instruction => ({
  statementId: id(0x5000 + number), opcode, args, condition: null, specVersion: '0.1.0',
  continuation: opcode === 'say' || opcode === 'choose' ? 'wait' : 'continue', skippable: true,
  source: { documentId: F.streetDocument, statementId: id(0x5000 + number), revision: 1 },
});
const template = createOfficialTemplate({ kind: 'standard' });
const snapshot: Snapshot = structuredClone(FixtureSnapshot);
snapshot.template = template;
snapshot.project.player.autosave = false;
snapshot.lock.plugins = [];
snapshot.lock.template = template.dependencies.find(item => item.kind === 'template')!;
snapshot.pluginDocuments = {};
const background = structuredClone(snapshot.assets.find(item => item.assetId === F.background)!);
const blue = { ...structuredClone(background), assetId: id(0x5100) };
const figure = { ...structuredClone(background), assetId: id(0x5101), metadata: { width: 160, height: 240 } };
snapshot.assets = [background, blue, figure];
const fade = { preset: 'fade', resourceId: null, durationMs: 500, easing: { family: 'linear', direction: 'in' }, direction: 'left' };
const lines = Array.from({ length: 36 }, (_, index) => instruction(index + 3, 'say', {
  speaker: index % 2 === 0 ? { kind: 'character', id: F.an } : { kind: 'narrator' },
  text: `阅读记录 ${String(index + 1).padStart(2, '0')}：同一个固定阅读布局承载对白与旁白，回看记录时保留读者的位置。`,
}));
snapshot.scenes[0]!.instructions = [instruction(1, 'changeBg', { assetId: background.assetId, fit: 'cover' }),
  instruction(2, 'changeFigure', { objectId: id(0x5200), characterId: F.an, assetId: figure.assetId,
    station: 'center', portrait: { enabled: true, crop: { x: 0, y: 0, width: 1, height: .5 } } }),
  ...lines, instruction(39, 'changeBg', { assetId: blue.assetId, fit: 'cover', transition: { enter: fade, exit: fade } }),
  instruction(40, 'say', { speaker: { kind: 'narrator' }, text: '场景切换后的背景经过五百毫秒淡入。' }),
  instruction(41, 'choose', { options: [
    { id: F.chooseStreet, text: '进入分支 A', target: { sceneId: F.bookshop, labelId: null } },
    { id: F.chooseBookshop, text: '进入分支 B', target: { sceneId: F.bookshop, labelId: null } },
  ], previewDefault: null }),
];
snapshot.scenes[0]!.labels = {};
snapshot.scenes[1]!.instructions = [instruction(42, 'say', { speaker: { kind: 'narrator' }, text: '已经进入所选分支。' })];
snapshot.scenes[1]!.labels = {};
snapshot.documents = [];
const svg = (width: number, height: number, body: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
const pictures = new Map([
  [background.assetId, svg(1920, 1080, '<rect width="1920" height="1080" fill="#b22323"/>')],
  [blue.assetId, svg(1920, 1080, '<rect width="1920" height="1080" fill="#2339b2"/>')],
  [figure.assetId, svg(160, 240, '<rect width="160" height="240" fill="#eac7a9"/><circle cx="80" cy="58" r="42" fill="#fff"/>')],
]);
const values = new Map<string, Uint8Array>();
const host: PlayerHost = {
  target: 'web', resources: { resolve: async assetId => ok({ uri: pictures.get(assetId)!, mime: 'image/svg+xml', bytes: 1, rangeSupported: false, release() {} }) },
  storage: { read: async key => ok(values.get(key) ?? null), commit: async batch => {
    for (const item of batch.writes) values.set(item.key, item.bytes);
    for (const key of batch.deletes) values.delete(key);
    return ok({ revision: batch.expectedRevision + 1 });
  } },
  transfer: { importFile: async () => ok(null), exportFile: async () => ok(undefined) },
  viewport: () => ({ width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, orientation: 'landscape' }),
  subscribeLifecycle: () => () => {}, subscribeInput: () => () => {}, close: async () => ok(undefined),
  platform: async capability => ok(capability === 'window.fullscreen' ? { enabled: false } : null),
};
const mounted = unwrap(await mountPlayer(document.getElementById('app')!, host, snapshot));
const preferences = mounted.data.current()!.preferences;
unwrap(await mounted.data.savePreferences({ ...preferences, textSpeed: 120, toolbarLocked: true,
  confirmations: { overwrite: false, load: false, newGame: false, title: false, exit: false } }, preferences.revision));
const next = async () => {
  const current = mounted.session.inspect()!;
  if (current.state.wait?.kind === 'say') {
    unwrap(await mounted.session.updateTextProgress({ token: current.token!, textShown: 10000 }));
    unwrap(mounted.session.updateReadingViewport({ token: current.token!, textAnchor: 0, atEnd: true }));
    unwrap(await mounted.session.dispatch({ kind: 'advance', token: current.token! }));
    await mounted.view.options.waitForStage(); mounted.view.render();
  }
};
Object.assign(window, { acceptance: {
  mounted, next, backgroundId: blue.assetId, transitionStatementId: id(0x5026),
  preset: (value: 'portrait' | 'clear') => { applyReadingPreset(mounted.view.options.snapshot.template, value); mounted.view.render(); },
  locale: async (menuLocale: string) => { const current = mounted.data.current()!.preferences;
    unwrap(await mounted.data.savePreferences({ ...current, menuLocale }, current.revision)); mounted.view.render(); },
  render: () => mounted.view.render(),
  inspect: () => mounted.session.inspect(),
} });
document.documentElement.dataset.ready = 'true';
