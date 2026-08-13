param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'evidence/ppt-master.local.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '../common/Evidence.psm1') -Force

$attempt1 = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot 'evidence/opencode-attempt-1-run.json') | ConvertFrom-Json
$attempt2 = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot 'evidence/opencode-attempt-2-run.json') | ConvertFrom-Json
$structure = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot 'evidence/auxiliary-pptx-structure.json') | ConvertFrom-Json
$office = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot 'evidence/auxiliary-powerpoint-open-render.json') | ConvertFrom-Json
$environment = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot 'evidence/environment.json') | ConvertFrom-Json
$font = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot 'evidence/font-preparation.json') | ConvertFrom-Json

$evidence = New-SpikeEvidence -SpikeId 'ppt-master' -StartedAtUtc ([datetime]$attempt1.started_utc)
$evidence.status = 'changes-required'
$evidence.components = @(
  [ordered]@{ name = 'opencode'; version = [string]$environment.opencode },
  [ordered]@{ name = 'ppt-master'; version = [string]$environment.skill_version; commit = [string]$environment.upstream_commit },
  [ordered]@{ name = 'private-python'; version = [string]$environment.python; private = [bool]$environment.python_is_private },
  [ordered]@{ name = 'powerpoint'; version = [string]$office.office_version; available = [bool]$environment.powerpoint_available }
)
$evidence.commands = @(
  [ordered]@{ id = 'opencode-openai-oauth'; startedAtUtc = [string]$attempt1.started_utc; finishedAtUtc = [string]$attempt1.finished_utc; exitCode = [int]$attempt1.exit_code; stdoutSummary = 'OpenAI OAuth refresh failed with 401.'; stderrSummary = $null },
  [ordered]@{ id = 'opencode-compatible-provider-truncated-prompt'; startedAtUtc = [string]$attempt2.started_utc; finishedAtUtc = [string]$attempt2.finished_utc; exitCode = [int]$attempt2.exit_code; stdoutSummary = 'Provider answered, but command-shell prompt truncation produced no artifact.'; stderrSummary = $null },
  [ordered]@{ id = 'auxiliary-private-python-and-office-check'; startedAtUtc = (Get-Item -LiteralPath (Join-Path $PSScriptRoot 'artifacts/ppt-master-windows-feasibility-auxiliary.pptx')).CreationTimeUtc.ToString('o'); finishedAtUtc = (Get-Item -LiteralPath (Join-Path $PSScriptRoot 'evidence/auxiliary-powerpoint-open-render.json')).LastWriteTimeUtc.ToString('o'); exitCode = 0; stdoutSummary = "ZIP/python-pptx/PowerPoint COM passed; slides=$($structure.slide_count), previews=$($office.preview_count)."; stderrSummary = $null }
)
$evidence.assertions = @(
  [ordered]@{ id = 'private-python-and-font'; status = if ($environment.python_is_private -and $font.loaded_via_absolute_private_path) { 'pass' } else { 'fail' }; details = "Private Python $($environment.python); font=$($font.font_family_reported_by_pillow)." },
  [ordered]@{ id = 'real-opencode-plus-skill-output'; status = 'changes-required'; details = 'A real OpenCode + upstream Skill attempt was observed to initialize a project without producing a gate artifact, but its retrospective timeout record lacks direct measured start/finish/kill fields and is not approval-grade evidence.' },
  [ordered]@{ id = 'no-railway-worker'; status = if (-not $attempt1.railway_worker_used -and -not $attempt2.railway_worker_used) { 'pass' } else { 'fail' }; details = 'The measured OpenCode attempts did not use the Railway ppt-master worker.' },
  [ordered]@{ id = 'auxiliary-local-runtime-mechanics'; status = if ($structure.pass -and $office.pass) { 'pass' } else { 'fail' }; details = "Non-gate auxiliary deck: 16:9, $($structure.text_shape_count) editable text shapes, $($structure.picture_shape_count) picture, $($structure.editable_cjk_character_count) CJK characters, $($office.preview_count) Office previews." },
  [ordered]@{ id = 'clean-target-vms'; status = 'changes-required'; details = 'Clean Windows 10 22H2 and clean Windows 11 x64 runs are still required.' }
)
$artifactPaths = @(
  'artifacts/ppt-master-windows-feasibility-auxiliary.pptx',
  'artifacts/preview/slide-01.png',
  'artifacts/preview/slide-02.png',
  'artifacts/preview/slide-03.png'
)
$evidence.artifacts = @($artifactPaths | ForEach-Object {
  $fullPath = Join-Path $PSScriptRoot $_
  [ordered]@{
    path = $_.Replace('\', '/')
    sizeBytes = (Get-Item -LiteralPath $fullPath).Length
    sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    gateArtifact = $false
  }
})
$evidence.limitations = @(
  'The required OpenCode + ppt-master run did not produce a gate artifact.',
  'The historical full-prompt timeout observation is retained as a non-authoritative diagnostic only; the corrected runner must be rerun to capture measured timeout and process-tree fields.',
  'The auxiliary deck validates local Python/font/PPTX/Office mechanics only and must not be treated as a successful Skill run.',
  'The current host is a non-clean Windows 11 development machine.'
)
Write-SpikeEvidence -Evidence $evidence -Path $OutputPath
Write-Output "WROTE $(Resolve-Path -LiteralPath $OutputPath)"
