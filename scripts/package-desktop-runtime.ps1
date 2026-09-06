param(
  [string]$SourceRoot = "apps/desktop/dist-runtime",
  [string]$OutputDir = ".artifacts/desktop-release",
  [switch]$SkipDownloads,
  [switch]$SkipPythonDependencies,
  [switch]$RequireSignature
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$source = if ([IO.Path]::IsPathRooted($SourceRoot)) { (Resolve-Path -LiteralPath $SourceRoot).Path } else { (Resolve-Path (Join-Path $root $SourceRoot)).Path }
$output = if ([IO.Path]::IsPathRooted($OutputDir)) { [IO.Path]::GetFullPath($OutputDir) } else { [IO.Path]::GetFullPath((Join-Path $root $OutputDir)) }
$stage = Join-Path ([IO.Path]::GetTempPath()) ("coworkany-runtime-package-" + [guid]::NewGuid().ToString("N"))
$zip = Join-Path $output "CoworkAny-Runtime-x64.zip"
$mirrors = @("aliyun", "tencent", "tsinghua", "official")
$manifestPath = Join-Path $source "runtime/runtime-manifest.json"

# Match the installer's fallback for stripped-down Windows PowerShell hosts.
if ($null -eq (Get-Command Get-FileHash -ErrorAction SilentlyContinue)) {
  function Get-FileHash {
    param([Parameter(Mandatory = $true)][string]$LiteralPath, [string]$Algorithm = "SHA256")
    $stream = [IO.File]::OpenRead($LiteralPath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
      [pscustomobject]@{ Algorithm = $Algorithm; Hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
    } finally { $sha.Dispose(); $stream.Dispose() }
  }
}

function Assert-SafeRelativePath([string]$value) {
  $normalized = $value.Replace('\', '/')
  if ([string]::IsNullOrWhiteSpace($value) -or [IO.Path]::IsPathRooted($value) -or $normalized.StartsWith('/') -or ($normalized -split '/') -contains '..') {
    throw "runtime_package_unsafe_relative_path:$value"
  }
}

function Verify-Asset([object]$asset, [string]$rootPath) {
  Assert-SafeRelativePath ([string]$asset.relativePath)
  $target = Join-Path $rootPath $asset.relativePath
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "runtime_package_asset_missing:$($asset.id)" }
  $item = Get-Item -LiteralPath $target
  if ($asset.bytes -and [int64]$asset.bytes -ne [int64]$item.Length) { throw "runtime_package_asset_size_mismatch:$($asset.id)" }
  $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne ([string]$asset.sha256).ToLowerInvariant()) { throw "runtime_package_asset_hash_mismatch:$($asset.id)" }
}

function Download-Asset([object]$asset, [string]$rootPath) {
  $target = Join-Path $rootPath $asset.relativePath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  $lastError = $null
  foreach ($mirror in $mirrors) {
    $url = [string]$asset.urls.$mirror
    if ([string]::IsNullOrWhiteSpace($url)) { continue }
    $tmp = "$target.download.$([guid]::NewGuid().ToString('N'))"
    try {
      Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 120
      $hash = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($hash -ne ([string]$asset.sha256).ToLowerInvariant()) { throw "sha256 mismatch from $mirror" }
      if ($asset.bytes -and [int64]$asset.bytes -ne [int64](Get-Item -LiteralPath $tmp).Length) { throw "size mismatch from $mirror" }
      Move-Item -LiteralPath $tmp -Destination $target -Force
      return
    } catch {
      $lastError = $_
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
  }
  throw "runtime_package_download_failed:$($asset.id):$lastError"
}

function Test-StandardPythonLayout([string]$pythonRoot) {
  if (Get-ChildItem -LiteralPath $pythonRoot -Filter "*._pth" -File -ErrorAction SilentlyContinue) { return $false }
  foreach ($required in @("python.exe", "python313.dll", "Lib/os.py", "Lib/venv/__init__.py", "Lib/ensurepip/__init__.py")) {
    if (-not (Test-Path -LiteralPath (Join-Path $pythonRoot $required) -PathType Leaf)) { return $false }
  }
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & (Join-Path $pythonRoot "python.exe") -s -E -c 'import sys, struct, venv, ensurepip; assert sys.version_info[:3] == (3, 13, 6) and struct.calcsize(chr(80)) == 8 and not sys.flags.isolated and not sys.flags.safe_path' 2>&1 | Out-Null
    return $LASTEXITCODE -eq 0
  } catch { return $false }
  finally { $ErrorActionPreference = $previousErrorAction }
}

function Test-StandardPythonProbe([string]$python) {
  $probe = @'
import os, sys, pip, venv, ensurepip
assert not sys.flags.isolated and not sys.flags.safe_path
assert os.path.dirname(os.path.abspath(__file__)) in sys.path
'@
  $probeFile = Join-Path ([IO.Path]::GetTempPath()) ("coworkany-python-probe-" + [guid]::NewGuid().ToString("N") + ".py")
  [IO.File]::WriteAllText($probeFile, $probe, [Text.UTF8Encoding]::new($false))
  try {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $probeOutput = @(& $python -s -E $probeFile 2>&1)
    $probeExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
  } finally {
    Remove-Item -LiteralPath $probeFile -Force -ErrorAction SilentlyContinue
  }
  if ($probeExitCode -ne 0) {
    $probeOutput | ForEach-Object { Write-Warning ("runtime_package_python_probe: " + $_) }
    return $false
  }
  return $true
}

function Test-PythonRequirements([string]$python, [string]$requirements) {
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $python -s -E -m pip --isolated install --no-index --no-deps --dry-run --disable-pip-version-check -r $requirements 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { return $false }
    & $python -s -E -m pip --isolated check 2>&1 | Out-Null
    return $LASTEXITCODE -eq 0
  } finally { $ErrorActionPreference = $previousErrorAction }
}

function Prepare-OfflinePython([string]$rootPath) {
  # Replacement is confined to this packager's disposable copy, never SourceRoot.
  if ([IO.Path]::GetFullPath($rootPath) -ne [IO.Path]::GetFullPath($stage)) { throw "runtime_package_python_stage_required" }
  $pythonRoot = Join-Path $rootPath "runtime/python"
  $python = Join-Path $pythonRoot "python.exe"
  if (-not (Test-StandardPythonLayout $pythonRoot)) {
    $archive = Join-Path $pythonRoot "python.3.13.6.nupkg"
    $unpacked = Join-Path $rootPath ("python-nuget-" + [guid]::NewGuid().ToString("N"))
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $unpacked)
    $tools = Join-Path $unpacked "tools"
    if (-not (Test-StandardPythonLayout $tools)) { throw "runtime_package_python_distribution_unsupported:nuget_layout" }
    Copy-Item -LiteralPath $archive -Destination (Join-Path $tools "python.3.13.6.nupkg")
    Remove-Item -LiteralPath $pythonRoot -Recurse -Force
    Move-Item -LiteralPath $tools -Destination $pythonRoot
    Remove-Item -LiteralPath $unpacked -Recurse -Force
  }
  # Generic command alias for upstream scripts; this copy lives only in staging.
  Copy-Item -LiteralPath $python -Destination (Join-Path $pythonRoot "python3.exe") -Force
  if (-not (Test-StandardPythonProbe $python)) { throw "runtime_package_python_distribution_unsupported:script_probe" }
  $requirements = Join-Path $rootPath "skills/ppt-master/requirements.txt"
  if (-not (Test-Path -LiteralPath $requirements -PathType Leaf)) { throw "runtime_package_python_bootstrap_assets_missing" }
  if (Test-PythonRequirements $python $requirements) { return }
  if ($SkipPythonDependencies) { throw "runtime_package_python_dependencies_skipped" }
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $bootstrapOutput = @(& $python -s -E -m ensurepip --upgrade 2>&1)
  $bootstrapExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
  if ($bootstrapExitCode -ne 0) {
    $bootstrapOutput | Select-Object -Last 12 | ForEach-Object { Write-Warning ("runtime_package_python_pip_bootstrap: " + $_) }
    throw "runtime_package_python_pip_bootstrap_failed"
  }
  $indexes = @(
    "https://mirrors.aliyun.com/pypi/simple",
    "https://mirrors.cloud.tencent.com/repository/pypi/simple",
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "https://pypi.org/simple"
  )
  $installed = $false
  foreach ($index in $indexes) {
    try {
      $previousErrorAction = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      $pipOutput = @(& $python -s -E -m pip --isolated install --disable-pip-version-check --no-input --no-warn-script-location --prefix $pythonRoot --timeout 60 --retries 1 --index-url $index -r $requirements 2>&1)
      $pipExitCode = $LASTEXITCODE
      $ErrorActionPreference = $previousErrorAction
      if ($pipExitCode -eq 0) { $installed = $true; break }
      $pipOutput | Select-Object -Last 12 | ForEach-Object { Write-Warning ("runtime_package_python_pip[$index]: " + $_) }
    } catch {
      Write-Warning ("runtime_package_python_pip[$index]: " + $_.Exception.Message)
    }
  }
  if (-not $installed) { throw "runtime_package_python_dependencies_failed" }
  if (-not (Test-PythonRequirements $python $requirements)) {
    throw "runtime_package_python_dependencies_failed"
  }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "runtime_package_manifest_missing:$manifestPath" }
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
if ([int]$manifest.schemaVersion -ne 1 -or [string]$manifest.platform -ne "windows" -or [string]$manifest.architecture -ne "x64") { throw "runtime_package_manifest_target_invalid" }
if ([string]$manifest.integrity.hashAlgorithm -ne "sha256" -or [string]$manifest.integrity.signatureAlgorithm -ne "ed25519") { throw "runtime_package_manifest_integrity_invalid" }
if ($RequireSignature -and ([string]::IsNullOrWhiteSpace([string]$manifest.integrity.signature) -or -not [bool]$manifest.integrity.required)) { throw "runtime_package_manifest_signature_required" }
$pythonAssets = @($manifest.assets | Where-Object { $_.id -eq "python-nuget-amd64" -and $_.relativePath -eq "runtime/python/python.3.13.6.nupkg" -and $_.extractPath -eq "runtime/python" })
if ($pythonAssets.Count -ne 1 -or @($manifest.assets | Where-Object { $_.id -in @("python-embed-amd64", "python-get-pip") }).Count -gt 0) { throw "runtime_package_python_distribution_unsupported:restage_with_cpython_nuget" }

New-Item -ItemType Directory -Force -Path $stage, $output | Out-Null
try {
  Copy-Item -LiteralPath (Join-Path $source "runtime") -Destination (Join-Path $stage "runtime") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $source "skills") -Destination (Join-Path $stage "skills") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $source "agents") -Destination (Join-Path $stage "agents") -Recurse -Force
  Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $stage "runtime-manifest.json") -Force
  Copy-Item -LiteralPath (Join-Path $source "install-desktop-runtime.ps1") -Destination (Join-Path $stage "install-desktop-runtime.ps1") -Force
  if (Test-Path -LiteralPath (Join-Path $source "runtime-manifest-crypto.mjs") -PathType Leaf) { Copy-Item -LiteralPath (Join-Path $source "runtime-manifest-crypto.mjs") -Destination (Join-Path $stage "runtime-manifest-crypto.mjs") -Force }
  foreach ($asset in @($manifest.assets)) {
    $target = Join-Path $stage $asset.relativePath
    if (Test-Path -LiteralPath $target -PathType Leaf) { Verify-Asset $asset $stage; continue }
    if ($SkipDownloads) { throw "runtime_package_asset_missing_offline:$($asset.id)" }
    Download-Asset $asset $stage
    Verify-Asset $asset $stage
  }
  Prepare-OfflinePython $stage
  if (Test-Path -LiteralPath $zip -PathType Leaf) { Remove-Item -LiteralPath $zip -Force }
  Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $stage -Force | Select-Object -ExpandProperty FullName) -DestinationPath $zip -CompressionLevel Optimal
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($zip)
  try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    foreach ($required in @("runtime-manifest.json", "install-desktop-runtime.ps1", "runtime/", "skills/", "agents/")) {
      if (-not ($entries | Where-Object { $_ -eq $required -or $_.StartsWith($required) })) { throw "runtime_package_archive_missing:$required" }
    }
  } finally { $archive.Dispose() }
  Get-Item -LiteralPath $zip | Select-Object FullName, Length, LastWriteTime
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
