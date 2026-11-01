import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { _electron } from 'playwright';

const root = resolve(import.meta.dirname, '../../../..'), output = join(root, 'test-results/latest/d28/diagnostics');
const profile = join(root, 'tmp/testing/d28-diagnostics', crypto.randomUUID()), invalid = join(profile, 'invalid-project');
await mkdir(invalid, { recursive: true }); await mkdir(output, { recursive: true });
await writeFile(join(invalid, 'project.json'), '{"schemaVersion":');
const electron = createRequire(join(root, 'apps/studio/package.json'))('electron');
let app, page;
const report = { target: 'D28-E01', environment: 'Real Electron / real detached Studio service / preload / actual malformed project.json on disk', data: invalid, expected: 'Persistent specific failure at 900px with Inspector hidden; keyboard details and actual project-folder recovery', actual: [], result: 'failed', evidence: output, owner: 'M01', at: new Date().toISOString() };
try {
  app = await _electron.launch({ executablePath: electron, args: [join(root, 'apps/studio')], cwd: root, env: { ...process.env, GALCRAFT_USER_DATA: profile } });
  page = await app.firstWindow(); page.setDefaultTimeout(30000);
  await page.locator('.gc-workbench').waitFor();
  await app.evaluate(({ BrowserWindow, dialog }, invalid) => { BrowserWindow.getAllWindows()[0].setSize(900, 800); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [invalid] }); }, invalid);
  await page.getByRole('button', { name: /打开作品|打开本机作品/ }).first().click();
  const notice = page.locator('.gc-wb-notice .gc-issue-notice'); await notice.waitFor();
  assert.equal(await page.locator('.gc-workbench').getAttribute('data-inspector-visible'), 'false');
  await page.waitForTimeout(5200); assert.equal(await notice.isVisible(), true);
  const details = notice.locator('summary'); await details.focus(); await details.press('Enter');
  const issue = JSON.parse(await notice.locator('pre').innerText());
  assert.equal(issue.severity, 'error'); assert(issue.code && issue.message && issue.owner && issue.actions);
  assert.match(await notice.innerText(), /project|JSON|作品/i);
  await page.screenshot({ path: join(output, 'native-900-invalid-project.png') });
  let calls = 0;
  await app.evaluate(({ dialog }) => { globalThis.d28RecoveryCalls = 0; dialog.showOpenDialog = async () => { globalThis.d28RecoveryCalls++; return { canceled: true, filePaths: [] }; }; });
  await notice.getByRole('button', { name: '重新选择作品目录' }).click();
  calls = await app.evaluate(() => globalThis.d28RecoveryCalls); assert.equal(calls, 1);
  report.actual.push({ width: 900, inspectorVisible: false, persistedOver5Seconds: true, keyboardDetails: true, issue, actualRecoveryDialogCalls: calls, result: 'passed' });
  report.result = 'passed';
} catch (error) { report.error = error.stack; if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: join(output, 'native-failure.png') }).catch(() => {}); } process.exitCode = 1; }
finally { if (page) await page.evaluate(() => window.studioBridge.service.stop()).catch(() => {}); if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await writeFile(join(output, 'native.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
