param(
  [string]$PortableZip = ".artifacts/desktop-release/CoworkAny-Windows-x64-portable.zip",
  [string]$WorkRoot,
  [int]$StartupSeconds = 8
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$zipPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $PortableZip))
if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) { throw "desktop_path_matrix_zip_missing:$zipPath" }
if ($StartupSeconds -lt 2 -or $StartupSeconds -gt 60) { throw "desktop_path_matrix_startup_seconds_invalid" }
$ownedWorkRoot = [string]::IsNullOrWhiteSpace($WorkRoot)
if ($ownedWorkRoot) { $WorkRoot = Join-Path ([IO.Path]::GetTempPath()) ("coworkany-path-matrix-" + [guid]::NewGuid().ToString("N")) }
$work = [IO.Path]::GetFullPath($WorkRoot)

function Assert-File([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "desktop_path_matrix_missing:${label}:$path" }
}

function Copy-PackageTree([string]$source, [string]$destination) {
  # The portable-copy verifier already exercises a full physical copy. The
  # path matrix only needs each EXE to resolve its payload through the tested
  # Unicode/space/long/OneDrive-shaped path. Junctioning the common `_up_`
  # payload keeps this matrix bounded instead of copying 270 MB four times;
  # root files remain real copies in every variant.
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  foreach ($item in (Get-ChildItem -LiteralPath $source -Force)) {
    $target = Join-Path $destination $item.Name
    if ($item.PSIsContainer -and $item.Name -eq "_up_") {
      New-Item -ItemType Junction -Path $target -Target $item.FullName | Out-Null
    } elseif ($item.PSIsContainer) {
      Copy-Item -LiteralPath $item.FullName -Destination $target -Recurse -Force
    } else {
      Copy-Item -LiteralPath $item.FullName -Destination $target -Force
    }
  }
}

function Stop-ProcessTree([int]$processId) {
  $children = Get-CimInstance Win32_Process | Where-Object { [int]$_.ParentProcessId -eq $processId }
  foreach ($child in $children) { Stop-ProcessTree ([int]$child.ProcessId) }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

try {
  $source = Join-Path $work "source"
  $matrixRoot = Join-Path $work "matrix"
  New-Item -ItemType Directory -Force -Path $source, $matrixRoot | Out-Null
  $tarCommand = Get-Command tar.exe -ErrorAction SilentlyContinue
  if ($tarCommand) {
    & $tarCommand.Source -xf $zipPath -C $source
    if ($LASTEXITCODE -ne 0) { throw "desktop_path_matrix_extract_failed:${LASTEXITCODE}" }
  } else {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $source -Force
  }
  $packageRoot = Get-ChildItem -LiteralPath $source -Directory | Select-Object -First 1
  if ($null -eq $packageRoot) { throw "desktop_path_matrix_package_root_missing" }
  $variants = @(
    # Construct the Chinese directory from code points so Windows PowerShell 5.1
    # cannot reinterpret a UTF-8 source literal as the system ANSI code page.
    [ordered]@{ id = "unicode-user"; directory = ([string][char]0x4E2D + [char]0x6587 + " " + [char]0x7528 + [char]0x6237) },
    [ordered]@{ id = "space"; directory = "CoworkAny space path" },
    [ordered]@{ id = "long"; directory = ("CoworkAny-" + ("long-" * 14) + "path") },
    [ordered]@{ id = "onedrive"; directory = "OneDrive - CoworkAny" }
  )
  $results = @()
  foreach ($variant in $variants) {
    $target = Join-Path $matrixRoot $variant.directory
    Copy-PackageTree $packageRoot.FullName $target
    $executable = Join-Path $target "CoworkAny.exe"
    Assert-File $executable "${variant.id}:executable"
    Assert-File (Join-Path $target "portable.flag") "${variant.id}:portable_flag"
    Assert-File (Join-Path $target "_up_\dist-runtime\host.mjs") "${variant.id}:host"
    $process = $null
    try {
      $process = Start-Process -FilePath $executable -WorkingDirectory $target -PassThru -WindowStyle Hidden
      $exited = $process.WaitForExit($StartupSeconds * 1000)
      if ($exited) {
        if ($process.ExitCode -ne 0) { throw "desktop_path_matrix_startup_failed:$($variant.id):$($process.ExitCode)" }
        $status = "exited_cleanly"
      } else {
        Stop-ProcessTree ([int]$process.Id)
        $status = "alive_then_stopped"
      }
    } catch {
      if ($process -and -not $process.HasExited) { Stop-ProcessTree ([int]$process.Id) }
      throw
    }
    $results += [ordered]@{ id = $variant.id; path = $target; pathChars = $target.Length; status = $status }
  }
  ConvertTo-Json -InputObject ([ordered]@{
    status = "ok"
    host = $env:COMPUTERNAME
    os = [Environment]::OSVersion.VersionString
    package = $zipPath
    startupSeconds = $StartupSeconds
    matrix = $results
    cleanVm = $false
  }) -Depth 8
} finally {
  if ($ownedWorkRoot -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
