import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ReleaseSignatureSchema, WindowsSigningSchema } from '@galcraft/contracts';

const execute = promisify(execFile);
async function powershell(source, variables = {}, signal) {
  if (process.platform !== 'win32') throw new Error('Windows certificate signing requires a Windows host');
  const encoded = Buffer.from(`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); try { Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1'); ${source} } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`, 'utf16le').toString('base64');
  try {
    const result = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true, encoding: 'utf8', signal, env: { ...process.env, ...variables },
    });
    return JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
  } catch (error) { throw new Error(error.stderr?.trim() || error.message); }
}

/** Return public certificate metadata only. Private keys stay in the Windows certificate store. */
export async function authorSigningCertificates() {
  return powershell(`$items=@(Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3' } | ForEach-Object {
    $reason=if($_.Subject -eq 'CN=GalCraft'){'GalCraft publisher identity is reserved for GalCraft distribution.'}elseif(-not $_.HasPrivateKey){'Private key is unavailable.'}elseif($_.NotAfter -le (Get-Date) -or $_.NotBefore -gt (Get-Date)){'Certificate is outside its validity period.'}else{$null}
    @{thumbprint=$_.Thumbprint;subject=$_.Subject;validFrom=$_.NotBefore.ToUniversalTime().ToString('o');expiresAt=$_.NotAfter.ToUniversalTime().ToString('o');authorUsable=($null -eq $reason);blockedReason=$reason}
  }); ConvertTo-Json -InputObject $items -Compress`);
}

export async function signAuthorExecutable(file, rawSelection, signal) {
  const selection = WindowsSigningSchema.parse(rawSelection);
  if (selection.mode === 'unsigned') return { status: 'unsigned' };
  const result = await powershell(`
    $certificate=Get-Item -LiteralPath ('Cert:\\CurrentUser\\My\\'+$env:GALCRAFT_AUTHOR_CERTIFICATE)
    if ($certificate.Subject -eq 'CN=GalCraft') { throw 'GalCraft publisher identity is reserved for GalCraft distribution; choose an author certificate.' }
    if (-not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date) -or $certificate.EnhancedKeyUsageList.ObjectId -notcontains '1.3.6.1.5.5.7.3.3') { throw 'Selected code signing certificate is unavailable or expired' }
    $result=Set-AuthenticodeSignature -LiteralPath $env:GALCRAFT_AUTHOR_EXECUTABLE -Certificate $certificate -HashAlgorithm SHA256
    $checked=Get-AuthenticodeSignature -LiteralPath $env:GALCRAFT_AUTHOR_EXECUTABLE
    $untrustedRoot=$checked.Status -eq 'UnknownError' -and $checked.StatusMessage -eq ([System.ComponentModel.Win32Exception]::new(-2146762487).Message)
    if (-not $checked.SignerCertificate -or $checked.SignerCertificate.Thumbprint -ne $env:GALCRAFT_AUTHOR_CERTIFICATE -or ($checked.Status -notin @('Valid','NotTrusted') -and -not $untrustedRoot)) { throw ('Signature verification failed: '+$checked.Status+' '+$checked.StatusMessage) }
    @{status='signed';subject=$checked.SignerCertificate.Subject;certificateThumbprint=$checked.SignerCertificate.Thumbprint;trust=$(if($checked.Status -eq 'Valid'){'trusted'}else{'untrusted'})} | ConvertTo-Json -Compress
  `, { GALCRAFT_AUTHOR_EXECUTABLE: file, GALCRAFT_AUTHOR_CERTIFICATE: selection.certificateThumbprint }, signal);
  return ReleaseSignatureSchema.parse(result);
}
