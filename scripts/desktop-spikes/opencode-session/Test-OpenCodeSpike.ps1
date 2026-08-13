[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$PSDefaultParameterValues["*:Encoding"] = "utf8"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$spikeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $spikeRoot "..\..\.."))
$tsx = Join-Path $repoRoot "node_modules\.bin\tsx.cmd"
$tsc = Join-Path $repoRoot "node_modules\.bin\tsc.cmd"
& $tsx --test (Join-Path $spikeRoot "*.test.ts")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$typeScriptFiles = Get-ChildItem -LiteralPath $spikeRoot -Filter "*.ts" -File | Select-Object -ExpandProperty FullName
& $tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --strict --skipLibCheck @typeScriptFiles
exit $LASTEXITCODE
