param(
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [string]$OfflineZip,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
$mirrors = @("aliyun", "tencent", "tsinghua", "official")
$manifest = Get-Content -Raw -Encoding UTF8 $ManifestPath | ConvertFrom-Json
$installRootResolved = [IO.Path]::GetFullPath($InstallRoot)
$stageRoot = Join-Path ([IO.Path]::GetTempPath()) ("aimarketing-runtime-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

function Assert-SafeRelativePath([string]$value, [string]$label) {
  if ([string]::IsNullOrWhiteSpace($value)) { throw "runtime_manifest_${label}_missing" }
  $normalized = $value.Replace('\', '/')
  if ([IO.Path]::IsPathRooted($value) -or $normalized.StartsWith('/') -or ($normalized -split '/') -contains '..') {
    throw "runtime_manifest_${label}_unsafe"
  }
}

function Assert-RuntimeManifestSchema() {
  if ($null -eq $manifest -or [int]$manifest.schemaVersion -ne 1) { throw "runtime_manifest_schema_unsupported" }
  if ([string]$manifest.platform -ne 'windows' -or [string]$manifest.architecture -ne 'x64') { throw "runtime_manifest_target_unsupported" }
  if ($null -eq $manifest.compatibility -or [string]$manifest.compatibility.architecture -ne 'x64') { throw "runtime_manifest_compatibility_missing" }
  if ($null -eq $manifest.integrity -or [string]$manifest.integrity.hashAlgorithm -ne 'sha256') { throw "runtime_manifest_integrity_schema_missing" }
  $assets = @($manifest.assets)
  if ($assets.Count -eq 0) { throw "runtime_manifest_assets_missing" }
  foreach ($asset in $assets) {
    if ([string]::IsNullOrWhiteSpace([string]$asset.id)) { throw "runtime_manifest_asset_id_missing" }
    if ([string]$asset.kind -notin @('archive', 'file')) { throw "runtime_manifest_asset_kind_invalid:$($asset.id)" }
    Assert-SafeRelativePath ([string]$asset.relativePath) "asset_path"
    if ($asset.kind -eq 'archive') { Assert-SafeRelativePath ([string]$asset.extractPath) "extract_path" }
    if ([string]$asset.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "runtime_manifest_asset_hash_invalid:$($asset.id)" }
    if ($null -ne $asset.bytes -and ([int64]$asset.bytes -le 0)) { throw "runtime_manifest_asset_size_invalid:$($asset.id)" }
    if ($null -eq $asset.urls) { throw "runtime_manifest_asset_sources_missing:$($asset.id)" }
  }
}

Assert-RuntimeManifestSchema
if ($ValidateOnly) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
  Write-Output (ConvertTo-Json @{ status = "valid"; manifestId = $manifest.manifestId; platform = $manifest.platform; architecture = $manifest.architecture } -Compress)
  return
}

function Seed-BundledRuntime() {
  $bundledRuntimeRoot = Split-Path -Parent ([IO.Path]::GetFullPath($ManifestPath))
  if (-not (Test-Path -LiteralPath $bundledRuntimeRoot -PathType Container)) { return }
  $bundledRoot = Split-Path -Parent $bundledRuntimeRoot
  $bundledRuntime = Join-Path $bundledRoot "runtime"
  if (Test-Path -LiteralPath $bundledRuntime -PathType Container) {
    New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot "runtime") | Out-Null
    foreach ($name in @("node", "opencode", "lancedb", "fonts", "embedding")) {
      $source = Join-Path $bundledRuntime $name
      if (Test-Path -LiteralPath $source -PathType Container) { Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot "runtime") -Recurse -Force }
    }
  }
  $bundledSkills = Join-Path $bundledRoot "skills"
  if (Test-Path -LiteralPath $bundledSkills -PathType Container) { Copy-Item -LiteralPath $bundledSkills -Destination (Join-Path $stageRoot "skills") -Recurse -Force }
}

function Assert-Asset([object]$asset, [string]$root) {
  $target = Join-Path $root $asset.relativePath
  # A healthy system Node may already be staged as an executable even when
  # the fallback archive is not needed. Keep the capability probe idempotent.
  if ($asset.id -eq "node-embed-amd64" -and (Test-Path -LiteralPath (Join-Path $root "runtime/node/node.exe") -PathType Leaf)) { return }
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "runtime asset missing: $($asset.id)" }
  $item = Get-Item -LiteralPath $target
  if ($asset.bytes -and [int64]$asset.bytes -ne [int64]$item.Length) { throw "runtime asset size mismatch: $($asset.id)" }
  $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $asset.sha256.ToLowerInvariant()) { throw "runtime asset sha256 mismatch: $($asset.id)" }
}

function Expand-ArchiveAssets() {
  foreach ($asset in $manifest.assets) {
    if ($asset.kind -ne "archive") { continue }
    $archive = Join-Path $stageRoot $asset.relativePath
    $target = Join-Path $stageRoot $asset.extractPath
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
      # A compatible bundled/system runtime may have satisfied this asset
      # before download. In that case there is nothing left to extract.
      $alreadyExtracted = if ($asset.id -eq "node-embed-amd64") {
        Test-Path -LiteralPath (Join-Path $stageRoot "runtime/node/node.exe") -PathType Leaf
      } elseif ($asset.id -eq "python-embed-amd64") {
        Test-Path -LiteralPath (Join-Path $stageRoot "runtime/python/python.exe") -PathType Leaf
      } else { $false }
      if ($alreadyExtracted) { continue }
      throw "runtime archive missing: $($asset.id)"
    }
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
  }
  $nodeRoot = Join-Path $stageRoot "runtime/node"
  $nestedNode = Get-ChildItem -LiteralPath $nodeRoot -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "node.exe") -PathType Leaf } | Select-Object -First 1
  if ($nestedNode) {
    Get-ChildItem -LiteralPath $nestedNode.FullName -Force | Move-Item -Destination $nodeRoot -Force
    Remove-Item -LiteralPath $nestedNode.FullName -Recurse -Force
  }
}

function Install-OpenCodePackage([switch]$Offline) {
  $target = Join-Path $stageRoot "runtime/opencode/opencode.exe"
  if (Test-Path -LiteralPath $target -PathType Leaf) { return }
  if ($Offline) { throw "offline_opencode_missing" }
  $nodeRoot = Join-Path $stageRoot "runtime/node"
  $npm = Join-Path $nodeRoot "npm.cmd"
  if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) { throw "npm unavailable for OpenCode bootstrap" }
  $prefix = Join-Path $stageRoot "runtime/opencode/npm-root"
  New-Item -ItemType Directory -Force -Path $prefix | Out-Null
  $registries = @(
    "https://registry.npmmirror.com",
    "https://mirrors.cloud.tencent.com/npm/",
    "https://mirrors.tuna.tsinghua.edu.cn/npm/",
    "https://registry.npmjs.org"
  )
  $installed = $false
  foreach ($registry in $registries) {
    try {
      & $npm install --prefix $prefix --no-save --no-fund --no-audit --fetch-timeout 30000 --fetch-retries 1 --registry $registry opencode-ai@latest 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) { $installed = $true; break }
    } catch { }
  }
  if (-not $installed) { throw "OpenCode package installation failed on configured registries" }
  $candidate = Join-Path $prefix "node_modules/opencode-ai/bin/opencode.exe"
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "OpenCode package did not provide Windows executable" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Copy-Item -LiteralPath $candidate -Destination $target -Force
}

function Enable-EmbeddedPythonSitePackages() {
  $pythonRoot = Join-Path $stageRoot "runtime/python"
  $pth = Get-ChildItem -LiteralPath $pythonRoot -Filter "*._pth" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $pth) { $pth = Get-ChildItem -LiteralPath $pythonRoot -Filter "*.pth" -File -ErrorAction SilentlyContinue | Select-Object -First 1 }
  if (-not $pth) { return }
  $lines = @(Get-Content -LiteralPath $pth.FullName -Encoding UTF8)
  if ($lines -notcontains "Lib\site-packages") { $lines += "Lib\site-packages" }
  if ($lines -notcontains "import site") { $lines += "import site" }
  [IO.File]::WriteAllLines($pth.FullName, $lines, [Text.UTF8Encoding]::new($false))
}

function Install-PythonPptxDependencies([switch]$Offline) {
  $python = Join-Path $stageRoot "runtime/python/python.exe"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "embedded Python executable missing" }
  Enable-EmbeddedPythonSitePackages
  # Offline packages may already contain a complete embedded Python runtime.
  # Probe before touching pip so a portable ZIP never reaches the network path.
  $requirements = Join-Path $stageRoot "skills/ppt-master/requirements.txt"
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
run.text = "AIMarketing 中文 PPT probe"
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
    & $python $probeFile 2>&1 | Out-Null
    $probeExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
  } finally { Remove-Item -LiteralPath $probeFile -Force -ErrorAction SilentlyContinue }
  if ($probeExitCode -eq 0) { return }
  if ($Offline) { throw "offline_python_pptx_missing" }
  $pipScript = Join-Path $stageRoot "runtime/python/get-pip.py"
  if (-not (Test-Path -LiteralPath $pipScript -PathType Leaf)) { throw "get-pip.py missing" }
  & $python $pipScript --disable-pip-version-check --no-warn-script-location 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "embedded Python pip bootstrap failed" }
  $indexes = @(
    "https://mirrors.aliyun.com/pypi/simple",
    "https://mirrors.cloud.tencent.com/repository/pypi/simple",
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "https://pypi.org/simple"
  )
  if (-not (Test-Path -LiteralPath $requirements -PathType Leaf)) { throw "ppt_master_requirements_missing" }
  $installed = $false
  foreach ($index in $indexes) {
    try {
      & $python -m pip install --disable-pip-version-check --no-input --no-warn-script-location --timeout 30 --retries 1 --index-url $index -r $requirements 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) { $installed = $true; break }
    } catch { }
  }
  if (-not $installed) { throw "python-pptx installation failed on all configured indexes" }
  $postInstallProbe = Join-Path ([IO.Path]::GetTempPath()) ("aimarketing-python-probe-" + [guid]::NewGuid().ToString("N") + ".py")
  [IO.File]::WriteAllText($postInstallProbe, $probe, [Text.UTF8Encoding]::new($false))
  try {
    & $python $postInstallProbe 2>&1 | Out-Null
    $postInstallProbeExitCode = $LASTEXITCODE
  } finally { Remove-Item -LiteralPath $postInstallProbe -Force -ErrorAction SilentlyContinue }
  if ($postInstallProbeExitCode -ne 0) { throw "python-pptx probe failed after installation" }
}

function Install-VerifiedAsset([object]$asset) {
  $target = Join-Path $stageRoot $asset.relativePath
  if ($asset.id -eq "node-embed-amd64" -and (Test-Path -LiteralPath (Join-Path $stageRoot "runtime/node/node.exe") -PathType Leaf)) { return }
  $targetDir = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $lastError = $null
  foreach ($mirror in $mirrors) {
    $url = $asset.urls.$mirror
    if ([string]::IsNullOrWhiteSpace($url)) { continue }
    try {
      $tmp = "$target.download.$([guid]::NewGuid().ToString('N'))"
      Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 90
      $hash = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($hash -ne $asset.sha256.ToLowerInvariant()) { throw "sha256 mismatch for $($asset.id) from $mirror" }
      Move-Item -LiteralPath $tmp -Destination $target -Force
      return
    } catch { $lastError = $_; if ($tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue } }
  }
  throw "Unable to install $($asset.id): $lastError"
}

try {
  Seed-BundledRuntime
  if ($OfflineZip) {
    Expand-Archive -LiteralPath ([IO.Path]::GetFullPath($OfflineZip)) -DestinationPath $stageRoot -Force
  } else {
    foreach ($asset in $manifest.assets) { Install-VerifiedAsset $asset }
  }
  Expand-ArchiveAssets
  Install-OpenCodePackage -Offline:([bool]$OfflineZip)
  Install-PythonPptxDependencies -Offline:([bool]$OfflineZip)
  foreach ($asset in $manifest.assets) { Assert-Asset $asset $stageRoot }
  $backupRoot = "$installRootResolved.last-known-good"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $installRootResolved) | Out-Null
  if (Test-Path -LiteralPath $installRootResolved) {
    if (Test-Path -LiteralPath $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force }
    Move-Item -LiteralPath $installRootResolved -Destination $backupRoot
  }
  Move-Item -LiteralPath $stageRoot -Destination $installRootResolved
  Write-Output (ConvertTo-Json @{ status = "ok"; installed = $manifest.assets.id; source = if ($OfflineZip) { "offline" } else { "mirrors" } } -Compress)
} catch {
  if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue }
  throw
}
