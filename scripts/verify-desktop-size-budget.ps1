param(
  [string]$NormalZip = ".artifacts/desktop-release/CoworkAny-Windows-x64-normal.zip",
  [string]$PortableZip = ".artifacts/desktop-release/CoworkAny-Windows-x64-portable.zip",
  [string]$RuntimeZip = ".artifacts/desktop-runtime-release-retry/CoworkAny-Runtime-x64.zip",
  [string]$BudgetConfig = "scripts/desktop-size-budget.json"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$budgetPath = (Resolve-Path (Join-Path $root $BudgetConfig)).Path
$budget = Get-Content -Raw -Encoding UTF8 $budgetPath | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Resolve-RequiredFile([string]$path, [string]$label) {
  $full = [IO.Path]::GetFullPath((Join-Path $root $path))
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "desktop_size_budget_missing:${label}:$full" }
  return $full
}

function Get-Component([string]$path) {
  $normalized = $path.Replace('\', '/').ToLowerInvariant()
  if ($normalized -match '(^|/)runtime/node/') { return "node" }
  if ($normalized -match '(^|/)runtime/opencode/') { return "opencode" }
  if ($normalized -match '(^|/)runtime/python/') { return "python" }
  if ($normalized -match '(^|/)runtime/fonts/') { return "fonts" }
  if ($normalized -match '(^|/)runtime/embedding/') { return "embedding" }
  if ($normalized -match '(^|/)skills/') { return "skills" }
  return "application"
}

function Measure-Archive([string]$path, [string]$kind) {
  $archive = [IO.Compression.ZipFile]::OpenRead($path)
  try {
    $groups = @{}
    $uncompressed = [int64]0
    foreach ($entry in $archive.Entries) {
      if ($entry.Length -le 0) { continue }
      $component = Get-Component $entry.FullName
      if (-not $groups.ContainsKey($component)) { $groups[$component] = [int64]0 }
      $groups[$component] += [int64]$entry.Length
      $uncompressed += [int64]$entry.Length
    }
    $result = [ordered]@{
      kind = $kind
      archive = $path
      compressedBytes = (Get-Item -LiteralPath $path).Length
      uncompressedBytes = $uncompressed
      components = [ordered]@{}
    }
    foreach ($name in @("application", "node", "opencode", "python", "fonts", "embedding", "skills")) {
      $result.components[$name] = if ($groups.ContainsKey($name)) { $groups[$name] } else { [int64]0 }
    }
    return $result
  } finally { $archive.Dispose() }
}

function Assert-Budget([object]$measurement) {
  $zipBudget = if ($measurement.kind -eq "runtime") { [int64]$budget.runtimeZipBytes } else { [int64]$budget.mainZipBytes }
  if ([int64]$measurement.compressedBytes -gt $zipBudget) { throw "desktop_size_budget_exceeded:$($measurement.kind):zip:$($measurement.compressedBytes)>$zipBudget" }
  if ($measurement.kind -ne "runtime" -and [int64]$measurement.uncompressedBytes -gt [int64]$budget.extractedProgramBytes) { throw "desktop_size_budget_exceeded:$($measurement.kind):extracted:$($measurement.uncompressedBytes)>$($budget.extractedProgramBytes)" }
  foreach ($name in $measurement.components.Keys) {
    $limit = [int64]$budget.components.$name
    if ([int64]$measurement.components[$name] -gt $limit) { throw "desktop_size_budget_exceeded:$($measurement.kind):${name}:$($measurement.components[$name])>$limit" }
  }
}

$measurements = @(
  (Measure-Archive (Resolve-RequiredFile $NormalZip "normal_zip") "normal"),
  (Measure-Archive (Resolve-RequiredFile $PortableZip "portable_zip") "portable"),
  (Measure-Archive (Resolve-RequiredFile $RuntimeZip "runtime_zip") "runtime")
)
foreach ($measurement in $measurements) { Assert-Budget $measurement }
ConvertTo-Json -InputObject ([ordered]@{ budget = $budget; measurements = $measurements }) -Depth 8
