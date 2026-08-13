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
Get-Item -LiteralPath $zip | Select-Object FullName, Length, LastWriteTime
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
