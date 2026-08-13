param(
  [string]$ReleaseDir = "apps/desktop/src-tauri/target/release",
  [string]$OutputDir = ".artifacts/desktop-release",
  [switch]$Portable
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$release = (Resolve-Path (Join-Path $root $ReleaseDir)).Path
$output = [IO.Path]::GetFullPath((Join-Path $root $OutputDir))
$mode = if ($Portable) { "portable" } else { "normal" }
$packageName = "AI-Marketing-Windows-x64-$mode"
$stage = Join-Path ([IO.Path]::GetTempPath()) ("aimarketing-package-" + [guid]::NewGuid().ToString("N"))
$packageRoot = Join-Path $stage $packageName
$zip = Join-Path $output "$packageName.zip"

function Assert-DesktopPackageArchive {
  param(
    [string]$ArchivePath,
    [string]$PackageName,
    [string]$ExecutablePath,
    [string]$RuntimePath,
    [switch]$ExpectPortable
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    $requiredEntries = @(
      "$PackageName/AI Marketing.exe",
      "$PackageName/README.txt",
      "$PackageName/_up_/dist-runtime/host.mjs",
      "$PackageName/_up_/dist-runtime/skill-catalog.json",
      "$PackageName/_up_/dist-runtime/runtime/runtime-manifest.json"
    )
    if ($ExpectPortable) { $requiredEntries += "$PackageName/portable.flag" }
    foreach ($entryName in $requiredEntries) {
      if ($null -eq $archive.GetEntry($entryName)) { throw "package archive missing required entry: $entryName" }
    }

    $expectedLengths = @{
      "$PackageName/AI Marketing.exe" = (Get-Item -LiteralPath $ExecutablePath).Length
      "$PackageName/_up_/dist-runtime/host.mjs" = (Get-Item -LiteralPath (Join-Path $RuntimePath "host.mjs")).Length
      "$PackageName/_up_/dist-runtime/skill-catalog.json" = (Get-Item -LiteralPath (Join-Path $RuntimePath "skill-catalog.json")).Length
    }
    foreach ($entryName in $expectedLengths.Keys) {
      $entry = $archive.GetEntry($entryName)
      if ($entry.Length -ne $expectedLengths[$entryName]) {
        throw "package archive has stale content: $entryName expected $($expectedLengths[$entryName]) bytes, found $($entry.Length)"
      }
    }
  } finally {
    $archive.Dispose()
  }
}

New-Item -ItemType Directory -Force -Path $packageRoot, $output | Out-Null
try {
  $executable = Join-Path $release "ai-marketing.exe"
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "release executable missing: $executable" }
  Copy-Item -LiteralPath $executable -Destination (Join-Path $packageRoot "AI Marketing.exe") -Force

  Get-ChildItem -LiteralPath $release -Filter "*.dll" -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $packageRoot $_.Name) -Force
  }
  $resources = Join-Path $release "_up_"
  $distRuntime = Join-Path $resources "dist-runtime"
  if (-not (Test-Path -LiteralPath $distRuntime -PathType Container)) { throw "Tauri runtime resources missing: $distRuntime" }
  New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "_up_") | Out-Null
  Copy-Item -LiteralPath $distRuntime -Destination (Join-Path $packageRoot "_up_\dist-runtime") -Recurse -Force
  if ($Portable) { Set-Content -LiteralPath (Join-Path $packageRoot "portable.flag") -Value "" -Encoding utf8 }
  Set-Content -LiteralPath (Join-Path $packageRoot "README.txt") -Encoding utf8 -Value @"
AI Marketing Windows green package

Run AI Marketing.exe.
Mode: $mode
Normal mode stores application data in %LOCALAPPDATA%\AIMarketing.
Portable mode stores application data in the data\ directory beside the executable.
The portable package includes config.json and may include a plaintext API key; protect copied archives.
"@

if (Test-Path -LiteralPath $zip -PathType Leaf) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -LiteralPath $packageRoot -DestinationPath $zip -CompressionLevel Optimal
Assert-DesktopPackageArchive -ArchivePath $zip -PackageName $packageName -ExecutablePath $executable -RuntimePath $distRuntime -ExpectPortable:$Portable
Get-Item -LiteralPath $zip | Select-Object FullName, Length, LastWriteTime
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
