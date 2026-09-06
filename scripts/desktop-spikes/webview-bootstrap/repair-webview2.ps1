param(
  [string]$Sentinel,
  [string[]]$InstallerUrls = @(
    'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
  )
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$clientGuid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$registryPaths = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$clientGuid",
  "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$clientGuid"
)

function Test-WebView2Runtime {
  foreach ($path in $registryPaths) {
    if (Test-Path -LiteralPath $path) { return $true }
  }
  $runtimeRoot = 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application'
  return [bool](Get-ChildItem -LiteralPath $runtimeRoot -Directory -ErrorAction SilentlyContinue | Where-Object Name -Match '^\d+\.' | Select-Object -First 1)
}

if (Test-WebView2Runtime) {
  Write-Output 'WebView2 runtime is already available; no repair performed.'
  exit 0
}

$downloadRoot = Join-Path ([IO.Path]::GetTempPath()) "coworkany-webview2-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $downloadRoot | Out-Null
$installer = Join-Path $downloadRoot 'MicrosoftEdgeWebview2Setup.exe'
try {
  $downloaded = $false
  foreach ($url in $InstallerUrls) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
      if ((Get-Item -LiteralPath $installer).Length -gt 0) {
        $downloaded = $true
        break
      }
    } catch {
      Write-Warning "WebView2 source failed: $url ($($_.Exception.Message))"
    }
  }
  if (-not $downloaded) { throw 'All configured WebView2 installer sources failed.' }

  $signature = Get-AuthenticodeSignature -LiteralPath $installer
  $publisher = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { '' }
  if ($signature.Status -ne 'Valid' -or $publisher -notmatch '(?i)Microsoft Corporation') {
    throw "WebView2 installer signature is not a valid Microsoft signature (status=$($signature.Status))."
  }

  $process = Start-Process -FilePath $installer -ArgumentList '/silent', '/install' -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "WebView2 installer exited with code $($process.ExitCode)." }
  if (-not (Test-WebView2Runtime)) { throw 'WebView2 is still unavailable after installation.' }
} finally {
  if (Test-Path -LiteralPath $downloadRoot) {
    Remove-Item -LiteralPath $downloadRoot -Recurse -Force
  }
}

Write-Output 'WebView2 repair completed and post-install probe passed.'
