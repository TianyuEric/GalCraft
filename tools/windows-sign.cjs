const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async function sign(configuration) {
  // Engine packages are frozen before electron-builder copies them. The new
  // engine is signed by package-studio before its manifest is finalized.
  const relative = path.relative(path.resolve(__dirname, '../out/studio'), path.resolve(configuration.path));
  if (relative.split(path.sep).includes('engines')) return;
  const record = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'windows-sign.ps1'), '-Mode', 'sign', '-Path', configuration.path], { windowsHide: true, encoding: 'utf8' }));
  const evidence = process.env.GALCRAFT_SIGN_EVIDENCE ?? path.join(__dirname, '../test-results/latest/sh9-platform-packaging/signing');
  fs.mkdirSync(evidence, { recursive: true });
  fs.appendFileSync(path.join(evidence, 'signing-events.jsonl'), JSON.stringify(record) + '\n');
  if (/uninstaller/i.test(path.basename(configuration.path))) fs.copyFileSync(configuration.path, path.join(evidence, 'signed-uninstaller.exe'));
};
