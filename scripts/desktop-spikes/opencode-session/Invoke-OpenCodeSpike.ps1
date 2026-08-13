[CmdletBinding()]
param(
  [ValidateSet("all", "system", "private")]
  [string]$Candidate = "all",
  [string]$PrivateVersion = "1.18.14",
  [string]$Model = $env:OPENCODE_SPIKE_MODEL,
  [switch]$ProvisionPrivate,
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$PSDefaultParameterValues["*:Encoding"] = "utf8"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:DESKTOP_SPIKE_POWERSHELL_VERSION = $PSVersionTable.PSVersion.ToString()

$spikeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $spikeRoot "..\..\.."))
$tsx = Join-Path $repoRoot "node_modules\.bin\tsx.cmd"
if (-not (Test-Path -LiteralPath $tsx -PathType Leaf)) {
  throw "tsx_not_found: run the repository dependency install first"
}

if (-not $SkipTests) {
  & $tsx --test (Join-Path $spikeRoot "*.test.ts")
  if ($LASTEXITCODE -ne 0) { throw "opencode_spike_tests_failed:$LASTEXITCODE" }
}

if ($ProvisionPrivate) {
  $privateRoot = Join-Path $spikeRoot ".private\opencode-$PrivateVersion"
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  & $npm install --prefix $privateRoot --no-save --no-audit --no-fund "opencode-ai@$PrivateVersion"
  if ($LASTEXITCODE -ne 0) { throw "private_opencode_install_failed:$LASTEXITCODE" }
}

$arguments = @(
  (Join-Path $spikeRoot "spike.ts"),
  "--candidate", $Candidate,
  "--private-version", $PrivateVersion,
  "--evidence-dir", (Join-Path $spikeRoot "evidence")
)
if ($Model) { $arguments += @("--model", $Model) }
& $tsx @arguments
if ($LASTEXITCODE -ne 0) { throw "opencode_spike_failed:$LASTEXITCODE" }

$validator = Join-Path $repoRoot "scripts\desktop-spikes\common\validate-evidence.ps1"
Get-ChildItem -LiteralPath (Join-Path $spikeRoot "evidence") -Filter "*.json" |
  Where-Object { $_.Name -ne "summary.json" } |
  ForEach-Object { & $validator -Path $_.FullName }
