import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(import.meta.dirname, '../../..');
const output = join(repo, 'test-results/latest/authoring-operations/entry-pause');
const expected = 'A successfully decoded scene-entry image reaches holding with an advancing positive clock; F8 hides it and freezes the same controller, phase and clock; Escape resumes from that position and the entry finishes naturally into the pending input.';

/** Uses the mounted production Player and its own frame loop; no clock or phase mutation. */
export async function verifySceneEntryEmergencyPause(page, screenshots) {
  const root = page.locator('.emergency-story-player');
  const cover = page.locator('.gc-emergency');
  const read = () => page.evaluate(() => {
    const { mounted } = document.querySelector('.emergency-story-player').emergencyFixture;
    const entry = mounted.view.options.entryPresentation;
    const element = document.querySelector('.gc-scene-entry');
    return { elapsed: entry.elapsed, phase: entry.currentPhase, active: entry.active, paused: entry.paused, skipped: entry.skipped,
      sameController: window.entryPauseController === entry,
      sameElement: !!window.entryPauseElement && window.entryPauseElement === element,
      visibility: element ? getComputedStyle(element).visibility : null,
      runtimeEntry: mounted.session.inspect().state?.entryPresentation ?? null };
  });
  const loadedResponse = page.waitForResponse(response => new URL(response.url()).searchParams.has('gc-entry'));
  const fixture = await page.evaluate(() => {
    const f = document.querySelector('.emergency-story-player').emergencyFixture;
    const { mounted } = f, snapshot = mounted.view.options.snapshot;
    const image = snapshot.assets.find(asset => asset.kind === 'image' && f.media[asset.assetId]);
    if (!image) throw new Error('The entry fixture requires an existing real image asset.');
    const cut = { preset: 'cut', durationMs: 0, resourceId: null, easing: { family: 'linear', direction: 'in' }, direction: 'left' };
    const holdMs = 2400;
    snapshot.scenes[0].scene.presentation = { title: null, interlude: { image: { assetId: image.assetId, variantId: image.variantId }, fit: 'cover', voice: null, holdMs, oldStageExit: cut, enter: cut, exit: cut, newStageEnter: cut, allowSkip: true } };
    window.entryPauseController = mounted.view.options.entryPresentation;
    window.entryPauseStart = 'pending';
    void mounted.view.newGame().then(() => { window.entryPauseStart = 'resolved'; }, error => { window.entryPauseStart = String(error); });
    return { sceneId: snapshot.scenes[0].scene.id, assetId: image.assetId, variantId: image.variantId, uri: new URL(f.media[image.assetId], location.href).href, holdMs };
  });
  const response = await loadedResponse;
  const media = { url: response.url(), status: response.status(), contentType: response.headers()['content-type'], bytes: (await response.body()).length };
  assert.equal(media.status, 200);
  assert.match(media.contentType, /^image\//);
  assert(media.bytes > 1024, 'The entry must fetch real image bytes.');
  await root.locator('.gc-scene-entry').waitFor();
  await page.waitForFunction(() => {
    const entry = document.querySelector('.emergency-story-player').emergencyFixture.mounted.view.options.entryPresentation;
    if (entry.currentPhase === 'failed') throw new Error(document.querySelector('.gc-entry-controls')?.textContent ?? 'Scene entry failed');
    return entry.currentPhase === 'holding' && entry.elapsed > 200;
  });
  const decoded = await page.evaluate(() => {
    const entry = window.entryPauseController;
    window.entryPauseElement = document.querySelector('.gc-scene-entry');
    return entry.loaded.map(item => ({ width: item.image.width, height: item.image.height }));
  });
  assert.equal(decoded.length, 1);
  assert(decoded[0].width > 0 && decoded[0].height > 0);
  const runningBefore = await read();
  await page.waitForTimeout(160);
  const runningAfter = await read();
  assert.equal(runningBefore.phase, 'holding');
  assert.equal(runningAfter.phase, 'holding');
  assert(runningAfter.elapsed > runningBefore.elapsed && runningBefore.elapsed > 0, 'The real frame clock must advance before F8.');
  assert.equal(runningAfter.paused, false);
  assert.equal(runningAfter.skipped, false);
  if (screenshots) await page.screenshot({ path: join(screenshots, 'entry-playing.png') });
  await root.locator('.gc-scene-entry').focus();
  await page.keyboard.press('F8');
  await cover.waitFor();
  const coveredBefore = await read();
  assert.equal(coveredBefore.phase, 'holding');
  assert(coveredBefore.elapsed >= runningAfter.elapsed && coveredBefore.elapsed > 0);
  assert.equal(coveredBefore.paused, true);
  assert.equal(coveredBefore.visibility, 'hidden');
  assert.equal(coveredBefore.sameController, true);
  assert.equal(coveredBefore.sameElement, true);
  const coverStartedAt = Date.now();
  await page.waitForTimeout(550);
  const coveredAfter = await read();
  assert.deepEqual(coveredAfter, coveredBefore, 'The same successful entry must retain its exact phase, time and runtime position under F8.');
  const coveredForMs = Date.now() - coverStartedAt;
  if (screenshots) await page.screenshot({ path: join(screenshots, 'entry-covered.png') });
  await page.keyboard.press('Escape');
  await cover.waitFor({ state: 'detached' });
  const restored = await read();
  assert.equal(restored.phase, 'holding');
  assert.equal(restored.sameController, true);
  assert.equal(restored.sameElement, true);
  assert.equal(restored.paused, false);
  assert.equal(restored.skipped, false);
  assert.equal(restored.visibility, 'visible');
  assert(restored.elapsed >= coveredAfter.elapsed && restored.elapsed - coveredAfter.elapsed < 250, 'Resume must retain the entry position without resetting or counting the covered interval.');
  await page.waitForFunction(frozen => {
    const entry = window.entryPauseController;
    return entry.currentPhase === 'holding' && entry.elapsed > frozen + 100;
  }, coveredAfter.elapsed);
  const resumed = await read();
  await root.locator('.gc-scene-entry').waitFor({ state: 'detached' });
  await root.locator('input').first().waitFor();
  const completed = await read();
  assert.equal(completed.phase, 'entered');
  assert.equal(completed.active, false);
  assert.equal(completed.skipped, false);
  assert.equal(completed.sameController, true);
  assert.equal(completed.runtimeEntry?.completed, true);
  assert.equal(await page.evaluate(() => window.entryPauseStart), 'resolved');
  if (screenshots) await page.screenshot({ path: join(screenshots, 'entry-completed-input.png') });
  return { fixture, media, decoded, runningBefore, runningAfter, coveredBefore, coveredAfter, coveredForMs, restored, resumed, completed, naturalCompletion: true };
}

async function main() {
  await mkdir(output, { recursive: true });
  const base = process.env.GALCRAFT_STORYBOOK_URL ?? 'http://127.0.0.1:6013';
  const record = { id: 'AO-T10/entry-pause', requirementIds: ['AO-F16', 'AO-C03'],
    specification: ['docs/ui/player.md'],
    target: 'playerWeb', environment: { os: process.platform, browser: 'Microsoft Edge headless', storybook: base, player: 'Shared production mountPlayer + PreviewHost isolated sample domain + SceneEntryPresentation', input: 'Playwright keyboard through browser protocol' },
    dataset: 'Official standard template, existing same-origin practice PNG; actual scene-start callback and production frame loop; no paid service or generation call.',
    steps: ['Start a new game with a real image interlude; require HTTP 200, decoded image, holding phase and a positive advancing clock.', 'Send F8 while the scene entry has focus; observe the same controller and exact phase/clock for at least 550 ms.', 'Send Escape; require the original position to resume, time to advance again, and natural completion into the pending input without a skip.'],
    expected, actual: null, result: 'failed', evidence: ['packages/player-ui/src/entry-pause.acceptance.mjs', 'apps/studio/renderer/stories/PlayerEmergency.stories.tsx', 'test-results/latest/authoring-operations/entry-pause/report.json', 'test-results/latest/authoring-operations/entry-pause/entry-playing.png', 'test-results/latest/authoring-operations/entry-pause/entry-covered.png', 'test-results/latest/authoring-operations/entry-pause/entry-completed-input.png'],
    owner: 'M07/M08', executedAt: new Date().toISOString(), blockingIssue: null, errors: [],
    reusedEvidence: { path: 'test-results/latest/authoring-emergency/report.json', scope: 'The ten checks other than Actual scene entry presentation remain the existing evidence. This record supersedes only that entry check.' } };
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    record.environment.version = browser.version();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => record.errors.push(String(error)));
    await page.goto(`${base}/iframe.html?id=product-player-emergency--authored-page&viewMode=story`);
    await page.waitForSelector('[data-emergency-ready="true"]');
    record.actual = await verifySceneEntryEmergencyPause(page, output);
    assert.deepEqual(record.errors, []);
    record.result = 'passed';
  } catch (error) {
    record.blockingIssue = error.stack;
    throw error;
  } finally {
    await writeFile(join(output, 'report.json'), JSON.stringify(record, null, 2));
    await browser.close();
    console.log(JSON.stringify({ result: record.result, output, failure: record.blockingIssue }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
