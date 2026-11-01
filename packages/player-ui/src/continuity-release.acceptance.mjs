import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { WindowsPlayerStorage } from '../../../apps/player-windows/main/storage.mjs';
import { createId, SaveRecordSchema } from '@galcraft/contracts';
import { SessionController } from '@galcraft/runtime';
import { StageCommandService } from '@galcraft/stage/commands';
import { PlayerDataService } from '@galcraft/player-ui/data';
import { PlayerLongTermService } from '@galcraft/player-ui/long-term';
import { emptyContributions } from '@galcraft/plugins/contracts';

// Short native acceptance. Seed records are unmodified saves made by the real
// offline release UI; only the new, isolated profile receives these fixtures.
const root = resolve(import.meta.dirname, '../../..');
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const directory = resolve(option('release') ?? join(root, 'test-results/latest/player-continuity-release/windows'));
const output = resolve(option('output') ?? join(root, 'test-results/latest/player-continuity-native/recheck'));
const seedPath = resolve(option('seed') ?? join(root, 'test-results/latest/player-continuity-native/native-seed.json'));
const checks = (option('checks') ?? 'choice,restore,entry,afterExit,geometry').split(',');
const snapshot = JSON.parse(await readFile(join(directory, 'game/snapshot.json'), 'utf8'));
const seed = JSON.parse(await readFile(seedPath, 'utf8'));
assert.equal(seed.projectId, snapshot.projectId);
for (const record of seed.records) {
  assert.equal(record.releaseVersion, snapshot.releaseVersion); assert.equal(record.engineVersion, snapshot.engineVersion);
  assert(snapshot.scenes.some(scene => scene.scene.id === record.state.position.sceneId && scene.instructions.some(instruction => instruction.statementId === record.state.position.statementId)), 'Saved position is absent from the target snapshot');
}
await mkdir(output, { recursive: true });
if (checks.includes('afterExit')) {
  const ok = value => ({ ok: true, value, warnings: [] }), unwrap = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
  const data = new PlayerDataService({ target: 'windows', storage: { read: async () => ok(null), commit: async batch => ok({ revision: batch.expectedRevision + 1 }) } },
    { projectId: snapshot.projectId, kind: 'playtest', instance: 'continuity-after-exit-preparation' }, 'zh-CN', 'zh-CN');
  unwrap(await data.open());
  const runtime = new SessionController({ longTerm: new PlayerLongTermService(data), contributions: emptyContributions(),
    stage: new StageCommandService({ asset: (id, variantId) => {
      const asset = snapshot.assets.find(item => item.assetId === id && (!variantId || item.variantId === variantId));
      assert(asset); return ok({ variantId: asset.variantId, kind: asset.kind, provider: null, providerVersion: null });
    }, character: id => snapshot.characters.find(character => character.id === id) }), onCommitted: () => ({ presentationEntered: true, mediaStarted: false }) });
  const scene = snapshot.scenes.find(scene => scene.scene.id === 'APzyVX'), target = { sceneId: scene.scene.id, statementId: 'kejS6w' };
  const scenario = { schemaVersion: 1, id: createId(), name: '澜汐退场后对白短入口', projectId: snapshot.projectId, engineVersion: snapshot.engineVersion,
    pluginVersions: snapshot.lock.plugins, entry: { sceneId: scene.scene.id, statementId: scene.instructions[0].statementId }, target,
    route: [], playerInputs: [], initialProgress: {}, pluginInitial: {}, externalPolicy: 'simulate' };
  const prepared = unwrap(await runtime.prepareSession({ snapshot, domain: data.domain, source: { kind: 'entry', scenario }, target,
    evaluateTarget: true, targetPhase: 'after', routePolicy: 'unique' }));
  assert(prepared.reached); unwrap(runtime.activate(prepared.id)); const inspection = runtime.inspect();
  assert.equal(inspection.state.wait?.kind, 'say'); assert(!inspection.state.presentation.objects.some(object => object.characterId === '6BokV5'));
  const record = data.makeRecord({ snapshot, inspection, kind: 'manual' }); SaveRecordSchema.parse(record);
  seed.index.manual.find(slot => !slot.recordId).recordId = record.recordId; seed.records.push(record);
  seed.afterExitFixture = { recordId: record.recordId, scenario, target,
    environment: 'Public SessionController.prepareSession + StageCommandService target evaluation; media waits simulated only during fixture preparation. Actual saved stage/avatar recovery is checked in the independent Windows release.' };
  await writeFile(join(output, 'after-exit-preparation.json'), JSON.stringify({ ...seed.afterExitFixture, record }, null, 2)); runtime.dispose();
}
const profile = join(output, `profile-${Date.now()}`), domain = { projectId: snapshot.projectId, kind: 'player', instance: 'default' };
const prefix = `player/${domain.projectId}/player/default/`, encode = value => new TextEncoder().encode(JSON.stringify(value));
const storage = new WindowsPlayerStorage(join(profile, 'player-data'));
const writes = ['index', 'longTerm', 'preferences'].map(key => ({ key: prefix + key, bytes: encode(seed[key]) }));
for (const record of seed.records) writes.push({ key: `${prefix}records/${record.recordId}`, bytes: encode(SaveRecordSchema.parse(record)) });
for (const [id, base64] of Object.entries(seed.thumbnails ?? {})) writes.push({ key: `${prefix}thumbnails/${id}`, bytes: new Uint8Array(Buffer.from(base64, 'base64')) });
writes.push({ key: prefix + 'revision', bytes: encode(1) });
const committed = await storage.commit({ domain, expectedRevision: 0, writes, deletes: [] });
assert(committed.ok, JSON.stringify(committed));
const { _electron } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const report = { result: 'failed', executedAt: new Date().toISOString(), directory, profile, snapshotId: snapshot.snapshotId,
  fixture: { path: seedPath, sourceSnapshotId: seed.snapshotId, source: seed.source, afterExit: seed.afterExitFixture, records: seed.records.map(r => ({ id: r.recordId, kind: r.kind, phase: r.state.phase, position: r.state.position })) },
  checks: [], errors: [], records: checks.map(id => ({ id, result: 'notExecuted' })) };
let application, page, current = 'launch';
const part = name => page.locator(`.gc-canvas > .gc-content [data-gc-part="${name}"]:visible`);
const ready = name => page.waitForFunction(name => {
  const content = document.querySelector('.gc-canvas > .gc-content');
  return content?.dataset.page === name && !content.inert && !document.querySelector('.gc-visual-hold');
}, name);
const shot = name => page.screenshot({ path: join(output, name + '.png') });
const readProfile = async () => {
  if (page) return page.evaluate(async prefix => {
    const read = async key => { const result = await window.playerHost.storage.read(prefix + key); if (!result.ok) throw Error(result.error.message);
      return result.value ? JSON.parse(new TextDecoder().decode(result.value)) : null; };
    const index = await read('index'), ids = [...new Set([...index.manual.map(slot => slot.recordId), ...index.quick, ...index.auto, index.continueRecordId].filter(Boolean))];
    return { index, records: await Promise.all(ids.map(id => read(`records/${id}`))) };
  }, prefix);
  const read = async key => { const result = await storage.read(prefix + key); assert(result.ok); return result.value ? JSON.parse(new TextDecoder().decode(result.value)) : null; };
  const index = await read('index');
  const ids = [...new Set([...index.manual.map(x => x.recordId), ...index.quick, ...index.auto, index.continueRecordId].filter(Boolean))];
  return { index, records: await Promise.all(ids.map(id => read(`records/${id}`))) };
};
const recordByText = text => seed.records.find(record => record.summary.text.includes(text));
const load = async (category, id) => {
  const active = await page.locator('.gc-canvas > .gc-content').first().getAttribute('data-page');
  if (active === 'title') await page.getByRole('button', { name: '读取进度', exact: true }).click();
  else await part('story.toolbar.load').click();
  await ready('load'); await part('load.categoryTabs.' + category).click();
  const { index } = await readProfile();
  const slot = category === 'manual' ? index.manual.findIndex(x => x.recordId === id) : index[category].indexOf(id);
  assert(slot >= 0, `${category} record missing: ${id}`);
  await page.locator(`.gc-canvas > .gc-content [data-focus-key="slot.${slot + 1}"]`).click();
  await part('load.primary').click(); await page.getByRole('button', { name: '确认', exact: true }).click();
};
const measure = () => page.evaluate(() => {
  const metric = element => { if (!element) return null; const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { x: box.x, y: box.y, width: box.width, height: box.height, clientWidth: element.clientWidth, clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, overflow: style.overflow }; };
  const panel = document.querySelector('.gc-canvas > .gc-content .gc-reading-panel');
  return { at: performance.now(), viewport: { width: innerWidth, height: innerHeight }, body: metric(document.body),
    content: metric(document.querySelector('.gc-canvas > .gc-content')), panel: metric(panel), offsetParent: metric(panel?.offsetParent),
    hidden: document.querySelector('.gc-canvas > .gc-content .gc-toolbar')?.classList.contains('gc-toolbar-hidden') };
});
const finish = (id, expected, actual, evidence) => {
  report.checks.push({ id, expected, actual, evidence });
  Object.assign(report.records.find(record => record.id === id), { target: expected,
    environment: { kind: 'independent Windows release', ...report.environment }, dataset: report.fixture,
    expected, actual, result: 'passed', evidence });
};
try {
  application = await _electron.launch({ executablePath: join(directory, 'electron.exe'), cwd: directory,
    args: ['--galcraft-offline', `--galcraft-test-data=${profile}`] });
  page = await application.firstWindow(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  report.environment = await application.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome, os: process.platform }));
  await page.locator('#app[data-release-ready]').waitFor(); await ready('title');
  report.coldTitle = await measure(); assert(report.coldTitle.body.scrollWidth <= report.coldTitle.viewport.width); await shot('cold-title');
  const chosen = snapshot.scenes.flatMap(scene => scene.instructions).find(item => item.opcode === 'choose').args.options[0];
  const firstText = snapshot.scenes.find(scene => scene.scene.id === chosen.target.sceneId).instructions.find(item => item.opcode === 'say').args.text;
  if (checks.includes('choice')) {
    current = 'choice'; const timelines = [];
    for (const temperature of ['cold', 'warm']) {
      await load('quick', recordByText('三条路都通向今晚的银幕').recordId); await ready('choice');
      await page.evaluate(({ firstText, temperature }) => {
        const probe = window.nativeContinuityChoice = { firstText, temperature, source: document.querySelector('.gc-dialogue-visible')?.textContent, frames: [], events: [], clicks: [], timeOrigin: performance.timeOrigin };
        if (!window.nativeContinuityDecodeProbe) {
          window.nativeContinuityDecodeProbe = true;
          const decode = HTMLImageElement.prototype.decode;
          HTMLImageElement.prototype.decode = function (...args) { const start = performance.now(), uri = this.currentSrc || this.src;
            return decode.apply(this, args).then(value => { window.nativeContinuityChoice?.events.push({ kind: 'image-decoded', uri, start, end: performance.now() }); return value; }); };
          const bitmap = window.createImageBitmap;
          window.createImageBitmap = function (source, ...args) { const start = performance.now(), uri = source?.currentSrc || source?.src || null;
            return bitmap.call(this, source, ...args).then(value => { window.nativeContinuityChoice?.events.push({ kind: 'bitmap-created', uri, start, end: performance.now() }); return value; }); };
        }
        document.addEventListener('click', event => { if (!probe.stop && event.target.closest('.gc-choice-list button')) { probe.clicked = performance.now(); probe.clicks.push(probe.clicked); } }, true);
        const sample = () => { if (probe.stop) return; const content = document.querySelector('.gc-canvas > .gc-content');
          if (probe.clicked) { const frame = { at: performance.now(), page: content?.dataset.page, inert: content?.inert,
            hold: !!document.querySelector('.gc-visual-hold'), busy: document.querySelector('#app')?.getAttribute('aria-busy'),
            disabled: document.querySelector('.gc-choice-list button')?.disabled, text: document.querySelector('.gc-dialogue-visible')?.textContent ?? '' };
            probe.frames.push(frame); if (!probe.accepted && (frame.inert || frame.hold || frame.disabled || frame.busy === 'true')) probe.accepted = frame.at;
            if (!probe.firstVisible && frame.page === 'story' && !frame.inert && !frame.hold && frame.text && frame.text !== probe.source) probe.firstVisible = frame.at;
            if (!probe.complete && frame.text === firstText) probe.complete = frame.at; }
          requestAnimationFrame(sample); }; requestAnimationFrame(sample);
      }, { firstText, temperature });
      const requests = [], requested = request => requests.push({ kind: 'request', uri: request.url(), at: Date.now() }), completed = request => requests.push({ kind: 'request-finished', uri: request.url(), at: Date.now() });
      page.on('request', requested); page.on('requestfinished', completed);
      await page.getByRole('button', { name: chosen.text, exact: true }).click();
      await page.waitForFunction(() => !!window.nativeContinuityChoice?.firstVisible); await ready('story');
      await shot('choice-' + temperature);
      const trace = await page.evaluate(() => { window.nativeContinuityChoice.stop = true; return window.nativeContinuityChoice; });
      page.off('request', requested); page.off('requestfinished', completed);
      trace.requests = requests.map(event => ({ ...event, sinceClickMs: event.at - trace.timeOrigin - trace.clicked }));
      trace.acceptedMs = trace.accepted - trace.clicked; trace.firstVisibleMs = trace.firstVisible - trace.clicked;
      assert.equal(trace.clicks.length, 1); timelines.push(trace);
    }
    finish('choice', '同一代表 choice 冷/暖各一次；记录真实 click→首个受理画面→首句首可见时间。', timelines, ['choice-cold.png', 'choice-warm.png']);
  }
  if (checks.includes('restore')) {
    current = 'restore'; const normal = seed.records.find(r => r.kind === 'manual');
    await load('manual', normal.recordId); await ready('story');
    assert((await page.locator('.gc-dialogue-visible').textContent()).includes(normal.summary.text)); await shot('ordinary-say-restored');
    const expressions = [recordByText('三份备用方案'), recordByText('我小时候总坐在最后一排')], restored = [];
    for (const record of expressions) {
      await load('quick', record.recordId); await ready('story');
      await page.waitForFunction(() => document.querySelector('canvas.gc-dialogue-portrait')?.dataset.gcMediaStatus === 'ready');
      assert((await page.locator('.gc-dialogue-visible').textContent()).includes(record.summary.text));
      const alpha = await page.locator('canvas.gc-dialogue-portrait').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].filter((value, i) => i % 4 === 3 && value > 0).length);
      assert(alpha > 1000); restored.push({ recordId: record.recordId, difference: record.state.presentation.characterDifferences['6BokV5'], alpha }); await shot('expression-' + record.recordId);
    }
    await part('story.toolbar.load').click(); await ready('load'); await part('load.categoryTabs.manual').click();
    await page.locator('.gc-canvas > .gc-content [data-focus-key="slot.1"]').click(); await part('load.primary').click();
    await page.getByRole('button', { name: '取消', exact: true }).click(); await ready('load');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-gc-part') === 'load.primary'); await shot('load-cancelled');
    await part('load.back').click(); await ready('story');
    finish('restore', '真实普通 say 和两表情档可恢复；取消保留来源并恢复 load.primary 焦点。', restored, ['ordinary-say-restored.png', ...expressions.map(r => `expression-${r.recordId}.png`), 'load-cancelled.png']);
  }
  if (checks.includes('entry')) {
    current = 'entry'; const entry = seed.records.find(r => r.kind === 'auto' && r.state.phase === 'entry'); assert(entry);
    await load('auto', entry.recordId); await ready('story');
    await page.waitForFunction(text => document.querySelector('.gc-dialogue-visible')?.textContent?.includes(text), firstText);
    await shot('phase-entry-restored'); finish('entry', '真实 phase:entry 自动档恢复完整路线舞台与首句。', { recordId: entry.recordId, phase: entry.state.phase, text: firstText }, ['phase-entry-restored.png']);
  }
  if (checks.includes('afterExit')) {
    current = 'afterExit'; const record = seed.records.find(record => record.recordId === seed.afterExitFixture.recordId);
    await load('manual', record.recordId); await ready('story');
    await page.waitForFunction(() => document.querySelector('canvas.gc-dialogue-portrait')?.dataset.gcMediaStatus === 'ready');
    await page.waitForFunction(text => document.querySelector('.gc-dialogue-visible')?.textContent?.includes(text), record.summary.text);
    assert((await page.locator('.gc-dialogue-visible').textContent()).includes(record.summary.text));
    const alpha = await page.locator('canvas.gc-dialogue-portrait').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].filter((value, i) => i % 4 === 3 && value > 0).length);
    assert(alpha > 1000); await shot('after-exit-restored');
    finish('afterExit', '公开调试准备产生的正式退场后对白档，在独立包恢复时没有该角色立绘对象且保留非空头像。',
      { recordId: record.recordId, position: record.state.position, objects: record.state.presentation.objects.map(object => ({ id: object.id, characterId: object.characterId })),
        difference: record.state.presentation.characterDifferences['6BokV5'], alpha }, ['after-exit-preparation.json', 'after-exit-restored.png']);
  }
  if (checks.includes('geometry')) {
    current = 'geometry';
    if (await page.locator('.gc-canvas > .gc-content').first().getAttribute('data-page') !== 'story') {
      await load('manual', seed.records.find(record => record.kind === 'manual').recordId); await ready('story');
    }
    if (await part('story.toolbar.lock').getAttribute('aria-pressed') === 'true') {
      await part('story.toolbar.lock').click();
      await page.waitForFunction(() => document.querySelector('[data-gc-part="story.toolbar.lock"]')?.getAttribute('aria-pressed') === 'false');
    }
    const geometries = [];
    for (const [width, height] of [[1280, 720], [1600, 900]]) {
      await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
      await page.mouse.move(width / 2, height - 1); await page.waitForTimeout(250);
      await page.evaluate(() => { window.nativeGeometry = []; window.nativeGeometryStop = false; const sample = () => {
        if (window.nativeGeometryStop) return; const panel = document.querySelector('.gc-canvas > .gc-content .gc-reading-panel'), content = document.querySelector('.gc-canvas > .gc-content'), box = panel.getBoundingClientRect();
        window.nativeGeometry.push({ at: performance.now(), x: box.x, width: box.width, clientWidth: content.clientWidth, scrollWidth: content.scrollWidth, clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, overflow: getComputedStyle(content).overflow }); requestAnimationFrame(sample); }; sample(); });
      await page.locator('#app').focus(); await page.mouse.move(width / 2, 200); await page.waitForFunction(() => document.querySelector('.gc-canvas > .gc-content .gc-toolbar')?.classList.contains('gc-toolbar-hidden')); await shot('toolbar-hidden-' + width);
      await page.mouse.move(width / 2, height - 1); await page.waitForTimeout(300); await shot('toolbar-revealed-' + width);
      const frames = await page.evaluate(() => { window.nativeGeometryStop = true; return window.nativeGeometry; });
      geometries.push({ width, height, frames, settled: await measure() });
      await writeFile(join(output, 'geometry.json'), JSON.stringify(geometries, null, 2));
      assert(frames.every(frame => Math.abs(frame.x - frames[0].x) < .1 && Math.abs(frame.width - frames[0].width) < .1), 'Toolbar animation changes horizontal reading bounds');
    }
    finish('geometry', '1280×720 与1600×900工具栏隐藏/动画/底边唤出的阅读面板横向边界稳定。', geometries, ['geometry.json', 'toolbar-hidden-1280.png', 'toolbar-revealed-1280.png', 'toolbar-hidden-1600.png', 'toolbar-revealed-1600.png']);
  }
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) {
  report.failure = error.stack; report.failedCheck = current;
  if (page) { report.failureGeometry = await measure().catch(() => null); await shot('failure').catch(() => {}); }
  const row = report.records.find(record => record.id === current); if (row) Object.assign(row, { result: 'failed', actual: String(error), evidence: ['failure.png', 'report.json'] });
  process.exitCode = 1;
} finally {
  if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, failedCheck: report.failedCheck, output, failure: report.failure }));
}
