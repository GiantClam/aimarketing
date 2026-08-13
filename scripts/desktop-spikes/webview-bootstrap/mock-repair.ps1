param(
  [Parameter(Mandatory)][string]$Sentinel,
  [switch]$Fail
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Fail) {
  Write-Error 'Simulated WebView2 repair failure.'
  exit 31
}

$parent = Split-Path -Parent $Sentinel
if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
[IO.File]::WriteAllText($Sentinel, 'repaired', [Text.UTF8Encoding]::new($false))
Write-Output 'Simulated WebView2 repair completed.'

