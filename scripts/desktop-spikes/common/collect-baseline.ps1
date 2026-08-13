param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'evidence/baseline.local.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Evidence.psm1') -Force

$started = [datetime]::UtcNow
$evidence = New-SpikeEvidence -SpikeId 'windows-environment-baseline' -StartedAtUtc $started
$names = @('node', 'pnpm', 'python', 'py', 'rustc', 'cargo', 'opencode', 'git')
$components = @()
foreach ($name in $names) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  $version = $null
  if ($command) {
    try { $version = (& $name --version 2>&1 | Select-Object -First 1) } catch { $version = $_.Exception.Message }
  }
  $components += [ordered]@{
    name = $name
    available = [bool]$command
    path = if ($command) { Protect-EvidenceText $command.Source } else { $null }
    version = Protect-EvidenceText $version
  }
}

$webViewRoot = 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application'
$webViewVersions = @()
if (Test-Path -LiteralPath $webViewRoot) {
  $webViewVersions = @(Get-ChildItem -LiteralPath $webViewRoot -Directory | Where-Object Name -Match '^\d+\.' | Select-Object -ExpandProperty Name)
}
$components += [ordered]@{
  name = 'webview2'
  available = ($webViewVersions.Count -gt 0)
  path = $webViewRoot
  versions = $webViewVersions
}

$evidence.components = $components
$evidence.status = 'changes-required'
$evidence.assertions = @(
  [ordered]@{ id = 'windows-x64'; status = if ($evidence.environment.processArchitecture -eq 'X64') { 'pass' } else { 'fail' }; details = "Process architecture: $($evidence.environment.processArchitecture)" },
  [ordered]@{ id = 'baseline-not-clean-vm'; status = 'changes-required'; details = 'This evidence was collected on the current Windows development machine, not a clean Win10/Win11 VM.' }
)
$evidence.limitations = @('Clean Windows 10 22H2 and clean Windows 11 VM evidence must be collected separately before approval.')
Write-SpikeEvidence -Evidence $evidence -Path $OutputPath
Write-Output "WROTE $(Resolve-Path -LiteralPath $OutputPath)"
