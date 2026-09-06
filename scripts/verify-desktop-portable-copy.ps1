param(
  [string]$PortableZip = ".artifacts/desktop-release/CoworkAny-Windows-x64-portable.zip",
  [string]$WorkRoot
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$zipPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $PortableZip))
if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) { throw "desktop_portable_copy_zip_missing:$zipPath" }
$ownedWorkRoot = [string]::IsNullOrWhiteSpace($WorkRoot)
if ($ownedWorkRoot) { $WorkRoot = Join-Path ([IO.Path]::GetTempPath()) ("coworkany-portable-copy-" + [guid]::NewGuid().ToString("N")) }
$work = [IO.Path]::GetFullPath($WorkRoot)
$source = Join-Path $work "source"
$target = Join-Path $work "target"
New-Item -ItemType Directory -Force -Path $source, $target | Out-Null

function Assert-File([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "desktop_portable_copy_missing:${label}:$path" }
}

function File-Fingerprint([string]$path) {
  $item = Get-Item -LiteralPath $path
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($path)
  try {
    $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
  [ordered]@{ bytes = [int64]$item.Length; sha256 = $digest }
}

function Copy-PackageTree([string]$source, [string]$destination) {
  # Keep this verifier a real physical copy, but use Windows' native parallel
  # copier so the 270 MB portable archive remains bounded on large runtimes.
  & robocopy $source $destination /E /R:0 /W:0 /MT:32 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "desktop_portable_copy_failed:${LASTEXITCODE}:$destination" }
}

try {
  $tarCommand = Get-Command tar.exe -ErrorAction SilentlyContinue
  if ($tarCommand) {
    & $tarCommand.Source -xf $zipPath -C $source
    if ($LASTEXITCODE -ne 0) { throw "desktop_portable_copy_extract_failed:${LASTEXITCODE}" }
  } else {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $source -Force
  }
  $packageRoot = Get-ChildItem -LiteralPath $source -Directory | Select-Object -First 1
  if ($null -eq $packageRoot) { throw "desktop_portable_copy_package_root_missing" }
  Assert-File (Join-Path $packageRoot.FullName "portable.flag") "portable.flag"
  foreach ($relative in @("CoworkAny.exe", "README.txt", "_up_/dist-runtime/host.mjs", "_up_/dist-runtime/knowledge.mjs", "_up_/dist-runtime/runtime/runtime-manifest.json", "_up_/dist-runtime/install-desktop-runtime.ps1", "_up_/dist-runtime/runtime-manifest-crypto.mjs", "_up_/dist-runtime/skills/ppt-master/SKILL.md")) {
    Assert-File (Join-Path $packageRoot.FullName ($relative -replace '/', '\')) $relative
  }
  $copiedRoot = Join-Path $target $packageRoot.Name
  New-Item -ItemType Directory -Force -Path $copiedRoot | Out-Null
  Copy-PackageTree $packageRoot.FullName $copiedRoot
  Assert-File (Join-Path $copiedRoot "portable.flag") "copied portable.flag"
  $dataPath = Join-Path $copiedRoot "data"
  New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
  $runtimeEntries = @("_up_/dist-runtime/host.mjs", "_up_/dist-runtime/knowledge.mjs", "_up_/dist-runtime/runtime/runtime-manifest.json", "_up_/dist-runtime/install-desktop-runtime.ps1", "_up_/dist-runtime/runtime-manifest-crypto.mjs", "_up_/dist-runtime/skills/ppt-master/SKILL.md")
  $fingerprints = [ordered]@{}
  foreach ($relative in $runtimeEntries) {
    $sourcePath = Join-Path $packageRoot.FullName ($relative -replace '/', '\')
    $targetPath = Join-Path $copiedRoot ($relative -replace '/', '\')
    $sourceFingerprint = File-Fingerprint $sourcePath
    $targetFingerprint = File-Fingerprint $targetPath
    if ($sourceFingerprint.sha256 -ne $targetFingerprint.sha256 -or $sourceFingerprint.bytes -ne $targetFingerprint.bytes) { throw "desktop_portable_copy_runtime_changed:$relative" }
    $fingerprints[$relative] = [ordered]@{ source = $sourceFingerprint; copied = $targetFingerprint }
  }
  $sourceLocalAppData = Join-Path $work "local-app-data"
  if (Test-Path -LiteralPath $sourceLocalAppData) { throw "desktop_portable_copy_unexpected_local_app_data" }
  ConvertTo-Json -InputObject ([ordered]@{ status = "ok"; source = $packageRoot.FullName; copied = $copiedRoot; portableFlag = $true; dataRoot = $dataPath; runtime = $fingerprints; localAppDataCreated = $false }) -Depth 8
} finally {
  if ($ownedWorkRoot -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
