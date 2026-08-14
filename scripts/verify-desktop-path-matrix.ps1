param(
  [string]$PortableZip = ".artifacts/desktop-release/AI-Marketing-Windows-x64-portable.zip",
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
if ($ownedWorkRoot) { $WorkRoot = Join-Path ([IO.Path]::GetTempPath()) ("aimarketing-path-matrix-" + [guid]::NewGuid().ToString("N")) }
$work = [IO.Path]::GetFullPath($WorkRoot)

function Assert-File([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "desktop_path_matrix_missing:${label}:$path" }
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
  Expand-Archive -LiteralPath $zipPath -DestinationPath $source -Force
  $packageRoot = Get-ChildItem -LiteralPath $source -Directory | Select-Object -First 1
  if ($null -eq $packageRoot) { throw "desktop_path_matrix_package_root_missing" }
  $variants = @(
    [ordered]@{ id = "unicode-user"; directory = "中文 用户" },
    [ordered]@{ id = "space"; directory = "AI Marketing space path" },
    [ordered]@{ id = "long"; directory = ("AIMarketing-" + ("long-" * 14) + "path") },
    [ordered]@{ id = "onedrive"; directory = "OneDrive - AI Marketing" }
  )
  $results = @()
  foreach ($variant in $variants) {
    $target = Join-Path $matrixRoot $variant.directory
    Copy-Item -LiteralPath $packageRoot.FullName -Destination $target -Recurse -Force
    $executable = Join-Path $target "AI Marketing.exe"
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
