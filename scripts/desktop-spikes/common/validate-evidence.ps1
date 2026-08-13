param(
  [Parameter(Mandatory)][string]$Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Evidence.psm1') -Force

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$evidence = Get-Content -Raw -Encoding utf8 -LiteralPath $resolvedPath | ConvertFrom-Json -DateKind String
$validation = Test-SpikeEvidence -Evidence $evidence
if (-not $validation.Valid) {
  throw "Evidence validation failed: $($validation.Errors -join ', ')"
}

Write-Output "VALID $resolvedPath"
