param(
  [string]$SourceRoot = "apps/desktop/dist-runtime",
  [string]$OutputDir = ".artifacts/desktop-release",
  [switch]$SkipDownloads,
  [switch]$SkipPythonDependencies
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$source = (Resolve-Path (Join-Path $root $SourceRoot)).Path
$output = [IO.Path]::GetFullPath((Join-Path $root $OutputDir))
$stage = Join-Path ([IO.Path]::GetTempPath()) ("aimarketing-runtime-package-" + [guid]::NewGuid().ToString("N"))
$zip = Join-Path $output "AIMarketing-Runtime-x64.zip"
$mirrors = @("aliyun", "tencent", "tsinghua", "official")
$manifestPath = Join-Path $source "runtime/runtime-manifest.json"

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

function Enable-EmbeddedPythonSitePackages([string]$pythonRoot) {
  $pth = Get-ChildItem -LiteralPath $pythonRoot -Filter "*._pth" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $pth) { $pth = Get-ChildItem -LiteralPath $pythonRoot -Filter "*.pth" -File -ErrorAction SilentlyContinue | Select-Object -First 1 }
  if (-not $pth) { throw "runtime_package_python_pth_missing" }
  $lines = @(Get-Content -LiteralPath $pth.FullName -Encoding UTF8)
  if ($lines -notcontains "Lib\site-packages") { $lines += "Lib\site-packages" }
  if ($lines -notcontains "import site") { $lines += "import site" }
  [IO.File]::WriteAllLines($pth.FullName, $lines, [Text.UTF8Encoding]::new($false))
}

function Test-EmbeddedPythonPptProbe([string]$python) {
  $probe = @'
import os, tempfile, zipfile
import pptx, xlsxwriter, pathops, uharfbuzz, fitz, mammoth, markdownify, ebooklib, nbconvert, openpyxl, PIL, numpy, requests, bs4, curl_cffi, edge_tts, flask, google.genai
from pptx import Presentation
from pptx.util import Inches
presentation = Presentation()
presentation.slide_width = Inches(13.333333)
presentation.slide_height = Inches(7.5)
slide = presentation.slides.add_slide(presentation.slide_layouts[6])
shape = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(10), Inches(1.2))
run = shape.text_frame.paragraphs[0].add_run()
run.text = "AIMarketing PPT offline probe"
run.font.name = "Microsoft YaHei"
descriptor, output = tempfile.mkstemp(suffix=".pptx")
os.close(descriptor)
try:
    presentation.save(output)
    assert os.path.getsize(output) > 0
    with zipfile.ZipFile(output) as package:
        assert "ppt/slides/slide1.xml" in package.namelist()
finally:
    if os.path.exists(output): os.remove(output)
'@
  $probeFile = Join-Path ([IO.Path]::GetTempPath()) ("aimarketing-python-probe-" + [guid]::NewGuid().ToString("N") + ".py")
  [IO.File]::WriteAllText($probeFile, $probe, [Text.UTF8Encoding]::new($false))
  try {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $probeOutput = @(& $python $probeFile 2>&1)
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

function Prepare-OfflinePython([string]$rootPath) {
  $pythonRoot = Join-Path $rootPath "runtime/python"
  $python = Join-Path $pythonRoot "python.exe"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    $archive = Get-ChildItem -LiteralPath $pythonRoot -Filter "python-*-embed-amd64.zip" -File | Select-Object -First 1
    if (-not $archive) { throw "runtime_package_python_archive_missing" }
    Expand-Archive -LiteralPath $archive.FullName -DestinationPath $pythonRoot -Force
  }
  Enable-EmbeddedPythonSitePackages $pythonRoot
  if (Test-EmbeddedPythonPptProbe $python) { return }
  if ($SkipPythonDependencies) { throw "runtime_package_python_dependencies_skipped" }
  $getPip = Join-Path $pythonRoot "get-pip.py"
  $requirements = Join-Path $rootPath "skills/ppt-master/requirements.txt"
  if (-not (Test-Path -LiteralPath $getPip -PathType Leaf) -or -not (Test-Path -LiteralPath $requirements -PathType Leaf)) { throw "runtime_package_python_bootstrap_assets_missing" }
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $bootstrapOutput = @(& $python $getPip --disable-pip-version-check --no-warn-script-location 2>&1)
  $bootstrapExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
  if ($bootstrapExitCode -ne 0) {
    $bootstrapOutput | Select-Object -Last 12 | ForEach-Object { Write-Warning ("runtime_package_python_pip_bootstrap: " + $_) }
    throw "runtime_package_python_pip_bootstrap_failed"
  }
  $sitePackages = Join-Path $pythonRoot "Lib/site-packages"
  New-Item -ItemType Directory -Force -Path $sitePackages | Out-Null
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
      $pipOutput = @(& $python -m pip install --disable-pip-version-check --no-input --no-warn-script-location --target $sitePackages --timeout 60 --retries 1 --index-url $index -r $requirements 2>&1)
      $pipExitCode = $LASTEXITCODE
      $ErrorActionPreference = $previousErrorAction
      if ($pipExitCode -eq 0) { $installed = $true; break }
      $pipOutput | Select-Object -Last 12 | ForEach-Object { Write-Warning ("runtime_package_python_pip[$index]: " + $_) }
    } catch {
      Write-Warning ("runtime_package_python_pip[$index]: " + $_.Exception.Message)
    }
  }
  if (-not $installed) { throw "runtime_package_python_dependencies_failed" }
  if (-not (Test-EmbeddedPythonPptProbe $python)) {
    Write-Warning ("runtime_package_python_site_packages_missing=" + (-not (Test-Path -LiteralPath (Join-Path $sitePackages 'pptx'))))
    throw "runtime_package_python_dependencies_failed"
  }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "runtime_package_manifest_missing:$manifestPath" }
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
if ([int]$manifest.schemaVersion -ne 1 -or [string]$manifest.platform -ne "windows" -or [string]$manifest.architecture -ne "x64") { throw "runtime_package_manifest_target_invalid" }
if ([string]$manifest.integrity.hashAlgorithm -ne "sha256") { throw "runtime_package_manifest_integrity_invalid" }

New-Item -ItemType Directory -Force -Path $stage, $output | Out-Null
try {
  Copy-Item -LiteralPath (Join-Path $source "runtime") -Destination (Join-Path $stage "runtime") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $source "skills") -Destination (Join-Path $stage "skills") -Recurse -Force
  Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $stage "runtime-manifest.json") -Force
  Copy-Item -LiteralPath (Join-Path $source "install-desktop-runtime.ps1") -Destination (Join-Path $stage "install-desktop-runtime.ps1") -Force
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
    foreach ($required in @("runtime-manifest.json", "install-desktop-runtime.ps1", "runtime/", "skills/")) {
      if (-not ($entries | Where-Object { $_ -eq $required -or $_.StartsWith($required) })) { throw "runtime_package_archive_missing:$required" }
    }
  } finally { $archive.Dispose() }
  Get-Item -LiteralPath $zip | Select-Object FullName, Length, LastWriteTime
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
