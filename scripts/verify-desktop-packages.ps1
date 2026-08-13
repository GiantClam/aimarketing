param(
  [string]$ReleaseDir = "apps/desktop/src-tauri/target/release",
  [string]$PackageDir = ".artifacts/desktop-release"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$release = (Resolve-Path (Join-Path $root $ReleaseDir)).Path
$packageRoot = [IO.Path]::GetFullPath((Join-Path $root $PackageDir))
$executable = Join-Path $release "ai-marketing.exe"
$runtime = Join-Path $release "_up_/dist-runtime"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Find-Entry {
  param([System.IO.Compression.ZipArchive]$Archive, [string]$Name)
  $normalized = $Name.Replace('\', '/')
  return $Archive.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq $normalized } | Select-Object -First 1
}

function Verify-Package {
  param([string]$Mode, [bool]$ExpectPortable)
  $packageName = "AI-Marketing-Windows-x64-$Mode"
  $zipPath = Join-Path $packageRoot "$packageName.zip"
  if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) { throw "desktop_package_missing: $zipPath" }

  $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $required = @(
      "$packageName/AI Marketing.exe",
      "$packageName/README.txt",
      "$packageName/_up_/dist-runtime/host.mjs",
      "$packageName/_up_/dist-runtime/skill-catalog.json",
      "$packageName/_up_/dist-runtime/runtime/runtime-manifest.json"
    )
    if ($ExpectPortable) { $required += "$packageName/portable.flag" }
    if (-not $ExpectPortable -and (Find-Entry $archive "$packageName/portable.flag")) { throw "desktop_package_unexpected_portable_flag: $Mode" }

    $fullRuntimeMarkers = @(
      "$packageName/_up_/dist-runtime/runtime/python/",
      "$packageName/_up_/dist-runtime/runtime/node/node_modules/",
      "$packageName/_up_/dist-runtime/runtime/opencode/node_modules/",
      "$packageName/_up_/dist-runtime/AIMarketing-Runtime-x64.zip"
    )
    foreach ($entry in $archive.Entries) {
      $normalizedEntry = $entry.FullName.Replace('\', '/')
      foreach ($marker in $fullRuntimeMarkers) {
        if ($normalizedEntry.StartsWith($marker, [StringComparison]::OrdinalIgnoreCase)) { throw "desktop_package_embeds_full_runtime:${Mode}:$normalizedEntry" }
      }
    }

    $missing = @($required | Where-Object { -not (Find-Entry $archive $_) })
    if ($missing.Count) { throw "desktop_package_missing_entries: $($missing -join ', ')" }

    $sourceLengths = @{
      "$packageName/AI Marketing.exe" = (Get-Item -LiteralPath $executable).Length
      "$packageName/_up_/dist-runtime/host.mjs" = (Get-Item -LiteralPath (Join-Path $runtime "host.mjs")).Length
      "$packageName/_up_/dist-runtime/skill-catalog.json" = (Get-Item -LiteralPath (Join-Path $runtime "skill-catalog.json")).Length
    }
    foreach ($entryName in $sourceLengths.Keys) {
      $entry = Find-Entry $archive $entryName
      if ($entry.Length -ne $sourceLengths[$entryName]) { throw "desktop_package_stale_entry: $entryName" }
    }

    return [ordered]@{
      mode = $Mode
      zipBytes = (Get-Item -LiteralPath $zipPath).Length
      requiredEntries = $required.Count
      portableFlag = [bool](Find-Entry $archive "$packageName/portable.flag")
      executableBytes = (Find-Entry $archive "$packageName/AI Marketing.exe").Length
      hostBytes = (Find-Entry $archive "$packageName/_up_/dist-runtime/host.mjs").Length
      catalogBytes = (Find-Entry $archive "$packageName/_up_/dist-runtime/skill-catalog.json").Length
    }
  } finally {
    $archive.Dispose()
  }
}

$results = @(
  (Verify-Package -Mode "normal" -ExpectPortable:$false),
  (Verify-Package -Mode "portable" -ExpectPortable:$true)
)
ConvertTo-Json -InputObject $results -Depth 4
