[CmdletBinding()]
param(
    [string]$PythonCommand = "python",
    [string]$OpenCodeCommand = "opencode.cmd"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$runtime = Join-Path $root ".runtime"
$upstreamCommit = "4e6ecbcb0dc079efebd3c79b775c0f02581509fe"
$archive = Join-Path $runtime "ppt-master-$upstreamCommit.zip"
$upstream = Join-Path $runtime "ppt-master-$upstreamCommit"
$upstreamMarker = Join-Path $upstream '.aimarketing-source-commit'
$venv = Join-Path $runtime "venv"
$privatePython = Join-Path $venv "Scripts\python.exe"
$resolvedPython = (Get-Command $PythonCommand -CommandType Application -ErrorAction Stop).Source
$resolvedOpenCodeShim = (Get-Command $OpenCodeCommand -CommandType Application -ErrorAction Stop).Source
$openCodeBinaryCandidate = Join-Path (Split-Path -Parent $resolvedOpenCodeShim) "node_modules\opencode-ai\bin\opencode.exe"
$resolvedOpenCode = if (Test-Path -LiteralPath $openCodeBinaryCandidate) {
    (Resolve-Path -LiteralPath $openCodeBinaryCandidate).Path
} else {
    $resolvedOpenCodeShim
}

New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$markerValue = if (Test-Path -LiteralPath $upstreamMarker) { (Get-Content -Raw -Encoding utf8 -LiteralPath $upstreamMarker).Trim() } else { '' }
if ((Test-Path -LiteralPath $upstream) -and $markerValue -ne $upstreamCommit) {
    $runtimeFull = [IO.Path]::GetFullPath($runtime).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $upstreamFull = [IO.Path]::GetFullPath($upstream)
    if (-not $upstreamFull.StartsWith($runtimeFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing to refresh an upstream directory outside the spike runtime.'
    }
    Remove-Item -LiteralPath $upstreamFull -Recurse -Force
}
if (-not (Test-Path -LiteralPath $upstream)) {
    if (-not (Test-Path -LiteralPath $archive)) {
        Invoke-WebRequest -Uri "https://github.com/hugohe3/ppt-master/archive/$upstreamCommit.zip" -OutFile $archive
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $runtime
    [IO.File]::WriteAllText($upstreamMarker, $upstreamCommit, [Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $privatePython)) {
    & $resolvedPython -m venv $venv
}
& $privatePython -m pip install --disable-pip-version-check -r (Join-Path $upstream "requirements.txt")

$fontSource = @(
    "C:\Windows\Fonts\msyh.ttc",
    "C:\Windows\Fonts\msyhbd.ttc",
    "C:\Windows\Fonts\simhei.ttf"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $fontSource) {
    throw "No supported Chinese font was found under C:\Windows\Fonts"
}

$assetDir = Join-Path $root "work\assets"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
& $privatePython (Join-Path $root "prepare_assets.py") `
    --font-source $fontSource `
    --private-font-dir (Join-Path $runtime "fonts") `
    --image-out (Join-Path $assetDir "private-font-evidence.png") `
    --evidence-out (Join-Path $root "evidence\font-preparation.json")

$resolved = [ordered]@{
    schema_version = 1
    upstream_repository = "https://github.com/hugohe3/ppt-master"
    upstream_commit = $upstreamCommit
    skill_version = "4.5.0"
    python = (& $privatePython --version 2>&1 | Out-String).Trim()
    python_is_private = $privatePython.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)
    opencode = (& $resolvedOpenCode --version 2>&1 | Out-String).Trim()
    powerpoint_available = Test-Path -LiteralPath "C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE"
}
New-Item -ItemType Directory -Force -Path (Join-Path $root "evidence") | Out-Null
$resolved | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root "evidence\environment.json") -Encoding utf8

Write-Host "Private Python: $privatePython"
Write-Host "OpenCode: $resolvedOpenCode"
Write-Host "Upstream Skill: $upstream"
