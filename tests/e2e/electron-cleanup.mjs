import { spawnSync } from 'node:child_process';

function processes() {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress'], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Could not inspect test process tree');
  return JSON.parse(result.stdout);
}

/** Close an isolated test app, including unsaved test drafts and Chromium children. */
export async function closeTestStudio(application) {
  if (!application) return;
  if (process.platform === 'win32') {
    // Playwright launches through cmd.exe here. Killing only that PID leaves Electron running.
    const child = application.process();
    if (child.pid) {
      const before = processes(), owned = new Set([child.pid]);
      for (let size = 0; size !== owned.size;) { size = owned.size; for (const entry of before) if (owned.has(entry.ParentProcessId)) owned.add(entry.ProcessId); }
      const identities = before.filter(entry => owned.has(entry.ProcessId));
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      // taskkill may report a child that exited during traversal. Verify actual survivors.
      const survivors = () => processes().filter(entry => identities.some(original => original.ProcessId === entry.ProcessId && original.CreationDate === entry.CreationDate));
      for (const entry of survivors()) spawnSync('taskkill', ['/PID', String(entry.ProcessId), '/T', '/F'], { windowsHide: true });
      const remaining = survivors();
      if (remaining.length) throw new Error(`Test process tree still running: ${remaining.map(entry => entry.ProcessId).join(', ')}`);
      await application.close().catch(() => {});
      return { rootPid: child.pid, observed: identities.map(entry => entry.ProcessId), remaining: [] };
    }
  } else {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
  await application.close().catch(() => {});
}
