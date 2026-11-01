import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
/** Windows commit is a host metric; remote service RAM cannot stand in for it. */
export async function inspectLocalCommit(baseUrl) {
  const host = new URL(baseUrl).hostname;
  if (process.platform !== 'win32' || !['127.0.0.1', 'localhost', '[::1]'].includes(host)) return undefined;
  const command = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GalCraftMemory {
  [StructLayout(LayoutKind.Sequential)] public struct Info {
    public uint cb;
    public UIntPtr CommitTotal, CommitLimit, CommitPeak, PhysicalTotal, PhysicalAvailable, SystemCache, KernelTotal, KernelPaged, KernelNonpaged, PageSize;
    public uint HandleCount, ProcessCount, ThreadCount;
  }
  [DllImport("psapi.dll", SetLastError=true)] public static extern bool GetPerformanceInfo(ref Info info, uint size);
}
'@
$memoryInfo = New-Object GalCraftMemory+Info
$memorySize = [uint32][Runtime.InteropServices.Marshal]::SizeOf($memoryInfo)
$memoryInfo.cb = $memorySize
if (-not [GalCraftMemory]::GetPerformanceInfo([ref]$memoryInfo, $memorySize)) { throw 'GetPerformanceInfo failed' }
@{ usedBytes = $memoryInfo.CommitTotal.ToUInt64() * $memoryInfo.PageSize.ToUInt64(); limitBytes = $memoryInfo.CommitLimit.ToUInt64() * $memoryInfo.PageSize.ToUInt64(); checkedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress`;
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000, maxBuffer: 16384 });
  const snapshot = JSON.parse(stdout);
  if (!Number.isFinite(snapshot.usedBytes) || !Number.isFinite(snapshot.limitBytes)) throw new Error('Windows did not return commit counters.');
  return snapshot;
}
