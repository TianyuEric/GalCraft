param([string]$Target)

$stream = [System.IO.File]::Open($Target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
try {
  [Console]::Out.WriteLine('ready')
  [Console]::Out.Flush()
  [Console]::In.ReadLine() | Out-Null
} finally {
  $stream.Dispose()
}
