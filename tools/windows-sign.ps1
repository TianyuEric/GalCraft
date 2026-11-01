param(
  [ValidateSet('prepare', 'sign', 'inspect')][string]$Mode = 'prepare',
  [string]$Path,
  [string]$Thumbprint = $env:GALCRAFT_SIGN_THUMBPRINT
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
# Node may inherit PowerShell 7's module search path; load the Windows host's certificate provider explicitly.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
if ($Mode -eq 'prepare') {
  $taskCertificate = Get-ChildItem -Path Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq 'CN=GalCraft' -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(30) -and
      @($_.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.3' }).Count -gt 0 } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
  if (!$taskCertificate) {
    Import-Module (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\PKI\PKI.psd1')
    $taskCertificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=GalCraft' `
      -FriendlyName 'GalCraft local code signing' -CertStoreLocation Cert:\CurrentUser\My `
      -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable `
      -NotAfter (Get-Date).AddYears(3)
  }
  $taskChain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  $taskTrusted = $taskChain.Build($taskCertificate)
  [pscustomobject]@{ subject = $taskCertificate.Subject; thumbprint = $taskCertificate.Thumbprint; expires = $taskCertificate.NotAfter.ToUniversalTime().ToString('o'); publicTrust = $taskTrusted; chainStatus = @($taskChain.ChainStatus | ForEach-Object { [string]$_.Status }) } | ConvertTo-Json -Compress
  exit
}
if ($Mode -eq 'sign') {
  if (!$Thumbprint) { throw 'Prepare the GalCraft signing certificate first.' }
  $taskCertificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$Thumbprint"
  if ($taskCertificate.Subject -ne 'CN=GalCraft') { throw 'The local signing certificate must use CN=GalCraft.' }
  for ($signAttempt = 0; $signAttempt -lt 8; $signAttempt++) {
    try {
      $taskSignature = Set-AuthenticodeSignature -LiteralPath $Path -Certificate $taskCertificate -HashAlgorithm SHA256
      break
    } catch [System.IO.IOException] {
      # Newly emitted installers can remain briefly locked by a Windows file reader.
      if (($_.Exception.HResult -band 0xffff) -notin @(32, 33) -or $signAttempt -eq 7) { throw }
      Start-Sleep -Milliseconds (500 * ($signAttempt + 1))
    }
  }
} else {
  $taskSignature = Get-AuthenticodeSignature -LiteralPath $Path
}
if (!$taskSignature.SignerCertificate -or $taskSignature.Status -in 'NotSigned', 'HashMismatch') { throw "Authenticode signature unavailable: $($taskSignature.Status) $($taskSignature.StatusMessage)" }
if ($Thumbprint -and $taskSignature.SignerCertificate.Thumbprint -ne $Thumbprint) { throw 'The executable was signed by a different certificate.' }
[pscustomobject]@{ path = $taskSignature.Path; subject = $taskSignature.SignerCertificate.Subject; status = [string]$taskSignature.Status; statusMessage = $taskSignature.StatusMessage; publicTrust = ($taskSignature.Status -eq 'Valid') } | ConvertTo-Json -Compress
