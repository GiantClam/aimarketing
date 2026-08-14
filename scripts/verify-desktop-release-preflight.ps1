param(
  [string]$PnpmAuditJson,
  [string]$ReleaseDir = "apps/desktop/src-tauri/target/release"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$powershell = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if ([string]::IsNullOrWhiteSpace($powershell)) { throw "desktop_release_preflight_powershell_missing" }
if ([string]::IsNullOrWhiteSpace($node)) { throw "desktop_release_preflight_node_missing" }
if ([string]::IsNullOrWhiteSpace($PnpmAuditJson)) { throw "desktop_release_preflight_dependency_report_required" }

function Resolve-RootedPath([string]$path) {
  if ([IO.Path]::IsPathRooted($path)) { return [IO.Path]::GetFullPath($path) }
  return [IO.Path]::GetFullPath((Join-Path $repoRoot $path))
}

function Invoke-JsonCommand([string]$label, [string]$command, [string[]]$arguments) {
  $output = @(& $command @arguments 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "desktop_release_preflight_${label}_failed" }
  $text = ($output | Out-String).Trim()
  try { return $text | ConvertFrom-Json } catch { throw "desktop_release_preflight_${label}_invalid_json" }
}

function Invoke-PowerShellCheck([string]$label, [string]$scriptName, [string[]]$arguments = @()) {
  $scriptPath = Join-Path $PSScriptRoot $scriptName
  $baseArguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath)
  return Invoke-JsonCommand $label $powershell ($baseArguments + $arguments)
}

function Assert-Pass([string]$label, [object]$result) {
  if ([string]$result.status -ne "pass") { throw "desktop_release_preflight_${label}_incomplete" }
}

$checks = [ordered]@{}
$checks.packages = Invoke-PowerShellCheck "packages" "verify-desktop-packages.ps1"
$checks.sizeBudget = Invoke-PowerShellCheck "size_budget" "verify-desktop-size-budget.ps1"
$checks.portableCopy = Invoke-PowerShellCheck "portable_copy" "verify-desktop-portable-copy.ps1"
$checks.releaseAuditArguments = @("-RequireAuthenticode", "-RequireSignedManifest", "-RequireDependencyAudit", "-PnpmAuditJson", $PnpmAuditJson)
$checks.releaseAudit = Invoke-PowerShellCheck "release_audit" "verify-desktop-release-audit.ps1" $checks.releaseAuditArguments
$checks.signing = Invoke-PowerShellCheck "signing" "sign-windows-release.ps1" @("-VerifyOnly", "-RequireManifestSignature", "-ReleaseDir", $ReleaseDir)
$checks.bundleBoundary = Invoke-JsonCommand "bundle_boundary" $node @(Join-Path $PSScriptRoot "verify-desktop-bundle-boundaries.mjs")
$checks.networkBoundary = Invoke-JsonCommand "network_boundary" $node @(Join-Path $PSScriptRoot "verify-desktop-network-boundary.mjs")

Assert-Pass "release_audit" $checks.releaseAudit
Assert-Pass "signing" $checks.signing
if ([string]$checks.portableCopy.status -ne "ok") { throw "desktop_release_preflight_portable_copy_incomplete" }
if (@($checks.bundleBoundary.violations).Count -gt 0) { throw "desktop_release_preflight_bundle_boundary_incomplete" }
if (@($checks.networkBoundary.violations).Count -gt 0) { throw "desktop_release_preflight_network_boundary_incomplete" }

ConvertTo-Json -InputObject ([ordered]@{
  status = "pass"
  releaseDir = Resolve-RootedPath $ReleaseDir
  checks = $checks
}) -Depth 16
