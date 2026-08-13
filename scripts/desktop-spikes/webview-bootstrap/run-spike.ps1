param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'evidence/webview-bootstrap.local.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '../common/Evidence.psm1') -Force

$started = [datetime]::UtcNow
$evidence = New-SpikeEvidence -SpikeId 'webview-bootstrap' -StartedAtUtc $started
$target = Join-Path $PSScriptRoot 'target/release/aimarketing-webview-bootstrap-spike.exe'
$scratch = Join-Path $PSScriptRoot '.spike-state'
New-Item -ItemType Directory -Force -Path $scratch | Out-Null
$sentinel = Join-Path $scratch 'webview2.available'
Remove-Item -LiteralPath $sentinel -Force -ErrorAction SilentlyContinue

function Invoke-Captured {
  param([string]$Id, [scriptblock]$Action)
  $commandStarted = [datetime]::UtcNow
  $output = @(& $Action 2>&1)
  $exitCode = $LASTEXITCODE
  $script:evidence.commands += [ordered]@{
    id = $Id
    startedAtUtc = $commandStarted.ToString('o')
    finishedAtUtc = [datetime]::UtcNow.ToString('o')
    exitCode = $exitCode
    stdoutSummary = Protect-EvidenceText (($output | Select-Object -First 20) -join "`n")
    stderrSummary = $null
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

$test = Invoke-Captured 'cargo-test' { cargo test --manifest-path (Join-Path $PSScriptRoot 'Cargo.toml') }
$build = Invoke-Captured 'cargo-build-release' { cargo build --release --manifest-path (Join-Path $PSScriptRoot 'Cargo.toml') }
if ($build.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $target)) {
  $evidence.status = 'fail'
  $evidence.assertions = @([ordered]@{ id = 'bootstrap-build'; status = 'fail'; details = 'Rust bootstrap did not build.' })
  Write-SpikeEvidence -Evidence $evidence -Path $OutputPath
  exit 1
}

$actual = Invoke-Captured 'installed-runtime-probe' { & $target --non-interactive }
$success = Invoke-Captured 'simulated-missing-repair-success' {
  & $target --simulate-missing --non-interactive --sentinel $sentinel --repair-script (Join-Path $PSScriptRoot 'mock-repair.ps1')
}
Remove-Item -LiteralPath $sentinel -Force -ErrorAction SilentlyContinue
$failure = Invoke-Captured 'simulated-missing-repair-failure' {
  & $target --simulate-missing --non-interactive --sentinel $sentinel --repair-script (Join-Path $PSScriptRoot 'mock-repair-failure.ps1')
}

$evidence.components = @(
  [ordered]@{ name = 'rustc'; version = (& rustc --version); path = Protect-EvidenceText (Get-Command rustc).Source },
  [ordered]@{ name = 'webview2'; version = 'system-probed'; path = 'registry-or-runtime-folder' }
)
$evidence.assertions = @(
  [ordered]@{ id = 'bootstrap-build-and-tests'; status = if ($test.ExitCode -eq 0 -and $build.ExitCode -eq 0) { 'pass' } else { 'fail' }; details = 'Minimal bootstrap uses std + direct Win32 native status; no React or WebView dependency.' },
  [ordered]@{ id = 'installed-runtime-probe'; status = if ($actual.ExitCode -eq 0) { 'pass' } else { 'fail' }; details = "Exit code $($actual.ExitCode)." },
  [ordered]@{ id = 'missing-runtime-repair'; status = if ($success.ExitCode -eq 0) { 'pass' } else { 'fail' }; details = "Exit code $($success.ExitCode); repair precedes WEBVIEW_READY marker." },
  [ordered]@{ id = 'failed-repair-blocks-ui'; status = if ($failure.ExitCode -eq 21) { 'pass' } else { 'fail' }; details = "Expected 21, received $($failure.ExitCode)." },
  [ordered]@{ id = 'clean-vm-and-real-install'; status = 'changes-required'; details = 'Real absence, native-dialog screenshot, installer execution and actual WebView creation still require clean VM evidence.' }
)
$evidence.status = if (@($evidence.assertions | Where-Object status -eq 'fail').Count -gt 0) { 'fail' } else { 'changes-required' }
$evidence.artifacts = @(Get-SpikeArtifactRecord -Path $target)
$evidence.limitations = @(
  'The current machine already has WebView2; missing-runtime paths are deterministic simulations.',
  'No screenshot is captured in non-interactive automation.',
  'WEBVIEW_READY proves the creation gate opens, not that a Tauri WebView was instantiated.'
)
Write-SpikeEvidence -Evidence $evidence -Path $OutputPath
Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "WROTE $(Resolve-Path -LiteralPath $OutputPath)"

