[CmdletBinding()]
param(
    [string]$RunSummary = (Join-Path $PSScriptRoot 'evidence\opencode-run.json')
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$runtime = Join-Path $root ".runtime"
$upstream = Join-Path $runtime "ppt-master-4e6ecbcb0dc079efebd3c79b775c0f02581509fe"
$privatePython = Join-Path $runtime "venv\Scripts\python.exe"
$run = Get-Content -Raw -Encoding utf8 -LiteralPath $RunSummary | ConvertFrom-Json
if (-not $run.run_id -or -not $run.project_name -or -not $run.started_utc) { throw 'Run summary is missing run identity.' }
$projectRoot = Join-Path $upstream "projects\$($run.project_name)"
$generated = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'exports') -Filter '*.pptx' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not $generated) { throw "OpenCode did not produce a PPTX" }
$startedUtc = [datetime]$run.started_utc
if ($generated.LastWriteTimeUtc -lt $startedUtc.ToUniversalTime()) { throw 'Newest PPTX predates the current run.' }

$artifactDir = Join-Path $root "artifacts"
$evidenceDir = Join-Path $root "evidence"
$previewDir = Join-Path $artifactDir "preview"
New-Item -ItemType Directory -Force -Path $artifactDir, $evidenceDir | Out-Null
$artifact = Join-Path $artifactDir "ppt-master-windows-feasibility.pptx"
Copy-Item -LiteralPath $generated.FullName -Destination $artifact -Force

& $privatePython (Join-Path $root "inspect_pptx.py") $artifact `
    --expected-font "Microsoft YaHei" `
    --json-out (Join-Path $evidenceDir "pptx-structure.json")
if ($LASTEXITCODE -ne 0) { throw "Independent PPTX structure validation failed" }

& (Join-Path $root "office_preview.ps1") `
    -Pptx $artifact `
    -PreviewDirectory $previewDir `
    -EvidenceOut (Join-Path $evidenceDir "powerpoint-open-render.json")
if ($LASTEXITCODE -ne 0) { throw "PowerPoint open/render validation failed" }

& $privatePython -m pip freeze | Sort-Object | Set-Content -LiteralPath (Join-Path $evidenceDir "private-python-packages.txt") -Encoding utf8
Write-Host "Verified artifact: $artifact"
