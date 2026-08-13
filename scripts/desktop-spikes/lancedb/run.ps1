[CmdletBinding()]
param(
    [string]$EvidencePath = (Join-Path $PSScriptRoot 'evidence\windows-current.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Import-Module (Join-Path $PSScriptRoot '..\common\Evidence.psm1') -Force

function Limit-EvidenceText {
    param([AllowNull()][string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return '<none>' }
    $protected = Protect-EvidenceText $Text.Trim()
    $protected = $protected.Replace($PSScriptRoot, '<SPIKE_ROOT>', [StringComparison]::OrdinalIgnoreCase)
    if ($protected.Length -le 2000) { return $protected }
    return $protected.Substring($protected.Length - 2000)
}

function Invoke-RecordedCommand {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [Parameter(Mandatory)][string]$DisplayCommand
    )

    $started = [datetime]::UtcNow
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = $PSScriptRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $startInfo.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    foreach ($argument in $ArgumentList) { $startInfo.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "Failed to start $DisplayCommand" }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $finished = [datetime]::UtcNow

    return [pscustomobject]@{
        Command = [ordered]@{
            command = $DisplayCommand
            startedAtUtc = $started.ToString('o')
            finishedAtUtc = $finished.ToString('o')
            exitCode = $process.ExitCode
            stdoutSummary = Limit-EvidenceText $stdout
            stderrSummary = Limit-EvidenceText $stderr
        }
        ExitCode = $process.ExitCode
        Stdout = $stdout
        Stderr = $stderr
    }
}

function New-FileArtifact {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$RedactedPath
    )

    $item = Get-Item -LiteralPath $Path
    return [ordered]@{
        path = $RedactedPath
        kind = 'file'
        sizeBytes = $item.Length
        sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

function New-DirectoryArtifact {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$RedactedPath
    )

    $files = @(Get-ChildItem -LiteralPath $Path -Recurse -File | Sort-Object FullName)
    $manifestLines = foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($Path, $file.FullName).Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$relative $($file.Length) $hash"
    }
    $manifestBytes = [Text.Encoding]::UTF8.GetBytes(($manifestLines -join "`n"))
    $treeHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($manifestBytes)).ToLowerInvariant()
    return [ordered]@{
        path = $RedactedPath
        kind = 'directory-tree'
        fileCount = $files.Count
        sizeBytes = ($files | Measure-Object -Property Length -Sum).Sum
        sha256 = $treeHash
    }
}

$startedAt = [datetime]::UtcNow
$evidence = New-SpikeEvidence -SpikeId 'windows-rust-lancedb' -StartedAtUtc $startedAt
$commands = [Collections.Generic.List[object]]::new()

Push-Location $PSScriptRoot
try {
    $cargoPath = (Get-Command cargo -ErrorAction Stop).Source
    $bootstrap = Invoke-RecordedCommand -FilePath $cargoPath -ArgumentList @(
        'run', '--locked', '--quiet', '--manifest-path', 'protoc-bootstrap/Cargo.toml'
    ) -DisplayCommand 'cargo run --locked --quiet --manifest-path protoc-bootstrap/Cargo.toml'
    $commands.Add($bootstrap.Command)
    if ($bootstrap.ExitCode -ne 0) { throw "vendored protoc bootstrap failed: $($bootstrap.Stderr)" }
    $protocPath = $bootstrap.Stdout.Trim()
    if (-not (Test-Path -LiteralPath $protocPath -PathType Leaf)) {
        throw 'vendored protoc bootstrap returned an invalid path'
    }
    $env:PROTOC = $protocPath

    $tests = Invoke-RecordedCommand -FilePath $cargoPath -ArgumentList @(
        'test', '--locked', '--all-targets'
    ) -DisplayCommand 'cargo test --locked --all-targets'
    $commands.Add($tests.Command)
    if ($tests.ExitCode -ne 0) { throw "cargo test failed: $($tests.Stderr)" }

    $clippy = Invoke-RecordedCommand -FilePath $cargoPath -ArgumentList @(
        'clippy', '--locked', '--all-targets', '--', '-D', 'warnings'
    ) -DisplayCommand 'cargo clippy --locked --all-targets -- -D warnings'
    $commands.Add($clippy.Command)
    if ($clippy.ExitCode -ne 0) { throw "cargo clippy failed: $($clippy.Stderr)" }

    $build = Invoke-RecordedCommand -FilePath $cargoPath -ArgumentList @(
        'build', '--locked'
    ) -DisplayCommand 'cargo build --locked'
    $commands.Add($build.Command)
    if ($build.ExitCode -ne 0) { throw "cargo build failed: $($build.Stderr)" }

    $binary = Join-Path $PSScriptRoot 'target\debug\windows-lancedb-spike.exe'
    $runtimeRoot = Join-Path $PSScriptRoot 'runtime\验证 路径 含空格'
    $runtimeBase = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime'))
    $resolvedRuntimeRoot = [IO.Path]::GetFullPath($runtimeRoot)
    $expectedPrefix = $runtimeBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedRuntimeRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing to reset a runtime directory outside this spike.'
    }
    if (Test-Path -LiteralPath $resolvedRuntimeRoot) {
        Remove-Item -LiteralPath $resolvedRuntimeRoot -Recurse -Force
    }
    $probe = Invoke-RecordedCommand -FilePath $binary -ArgumentList @(
        '--root', $runtimeRoot
    ) -DisplayCommand 'target/debug/windows-lancedb-spike.exe --root <redacted-runtime-root>'
    $commands.Add($probe.Command)
    if ($probe.ExitCode -ne 0) { throw "LanceDB probe failed: $($probe.Stderr)" }
    $spike = $probe.Stdout | ConvertFrom-Json

    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $visualStudioPath = if (Test-Path -LiteralPath $vswhere) {
        & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    }
    else { $null }
    $msvcDirectory = if ($visualStudioPath) {
        Get-ChildItem -LiteralPath (Join-Path $visualStudioPath 'VC\Tools\MSVC') -Directory |
            Sort-Object Name |
            Select-Object -Last 1
    }
    else { $null }
    $clPath = if ($msvcDirectory) { Join-Path $msvcDirectory.FullName 'bin\Hostx64\x64\cl.exe' } else { $null }
    $dumpbinPath = if ($msvcDirectory) { Join-Path $msvcDirectory.FullName 'bin\Hostx64\x64\dumpbin.exe' } else { $null }
    $nativeDependencies = if ($dumpbinPath -and (Test-Path -LiteralPath $dumpbinPath)) {
        & $dumpbinPath /dependents $binary 2>&1 |
            ForEach-Object { $_.ToString().Trim() } |
            Where-Object { $_ -match '^[A-Za-z0-9_.-]+\.dll$' } |
            Sort-Object -Unique
    }
    else { @('<dumpbin-unavailable>') }

    $vaultA = Join-Path $runtimeRoot 'Vault A 中文\向量 数据库'
    $vaultB = Join-Path $runtimeRoot 'Vault B 含 空格\向量 数据库'
    $evidence.status = 'changes-required'
    $evidence.commands = @($commands)
    $evidence.components = @(
        [ordered]@{ name = 'rustc'; version = (& rustc -V); host = ((& rustc -Vv | Select-String '^host:').Line -replace '^host:\s*', '') },
        [ordered]@{ name = 'cargo'; version = (& cargo -V) },
        [ordered]@{ name = 'lancedb'; version = $spike.lancedb_version; defaultFeatures = $false; mode = 'embedded' },
        [ordered]@{
            name = 'protoc'
            version = (& $protocPath --version)
            source = 'protoc-bin-vendored 3.2.0'
            sha256 = (Get-FileHash -LiteralPath $protocPath -Algorithm SHA256).Hash.ToLowerInvariant()
        },
        [ordered]@{
            name = 'msvc-x64'
            version = if ($clPath -and (Test-Path -LiteralPath $clPath)) { (Get-Item -LiteralPath $clPath).VersionInfo.ProductVersion } else { '<unavailable>' }
        },
        [ordered]@{ name = 'cmake'; availableOnPath = [bool](Get-Command cmake -ErrorAction SilentlyContinue); requiredByObservedBuild = $false },
        [ordered]@{ name = 'runtime-dll-imports'; values = @($nativeDependencies) }
    )
    $evidence.assertions = @(
        [ordered]@{ id = 'rust-lancedb-builds-on-current-windows-x64'; status = 'pass'; details = 'LanceDB 0.37.1 compiled for x86_64-pc-windows-msvc after provisioning vendored protoc 31.1.' },
        [ordered]@{ id = 'persist-close-reopen-query'; status = 'pass'; details = 'Document path, Chinese chunk text, vector dimension, and Float32 vectors persisted and were queried through a new connection.' },
        [ordered]@{ id = 'local-embedding-model'; status = 'changes-required'; details = 'The probe uses locally precomputed deterministic vectors; the v1 local embedding model is not connected yet.' },
        [ordered]@{ id = 'similarity-ranking'; status = 'pass'; details = 'Three results were returned in ascending vector distance order.' },
        [ordered]@{ id = 'chinese-space-path-and-vault-isolation'; status = 'pass'; details = 'Two Chinese/space-containing per-Vault directories returned only their own records.' },
        [ordered]@{ id = 'embedded-no-service'; status = 'pass'; details = 'The probe used local LanceDB directories and started no independent database service.' },
        [ordered]@{ id = 'repeat-run-isolation'; status = 'pass'; details = 'The runner validates and resets only its owned runtime subtree before each probe, so no previous database version is reused.' },
        [ordered]@{ id = 'lock-and-failure-diagnostics'; status = 'pass'; details = "$($spike.lock_diagnostic); the integration suite also verified the explicit invalid database-path diagnostic." },
        [ordered]@{ id = 'clean-target-vms'; status = 'changes-required'; details = 'This is a non-clean Windows 11 development host; clean Windows 10 22H2 and clean Windows 11 x64 VM runs are still required.' }
    )
    $evidence.artifacts = @(
        (New-FileArtifact -Path $binary -RedactedPath 'target/debug/windows-lancedb-spike.exe'),
        (New-DirectoryArtifact -Path $vaultA -RedactedPath '<runtime-root>/Vault A 中文/向量 数据库'),
        (New-DirectoryArtifact -Path $vaultB -RedactedPath '<runtime-root>/Vault B 含 空格/向量 数据库')
    )
    $evidence.limitations = @(
        'This evidence is from the current non-clean Windows 11 development host only.',
        'Windows 10 22H2 has not been validated.',
        'A clean Windows 11 x64 VM has not been validated.',
        'Compilation requires MSVC x64 build tools and protoc; run.ps1 provisions protoc 31.1 from protoc-bin-vendored 3.2.0.',
        'No auditable optimized release build was captured; the recorded executable size is the successful debug artifact and is not a shipping-size estimate.',
        'The probe validates vector persistence/query with locally precomputed deterministic vectors, not an end-to-end local embedding model.',
        'The deterministic lock diagnostic is an explicit per-Vault guard around the embedded LanceDB store.'
    )
    $evidence.spikeDetails = $spike

    $serialized = $evidence | ConvertTo-Json -Depth 30
    if ($serialized -match '(?i)([A-Z]:\\|/Users/|\\Users\\)') {
        throw 'Evidence redaction failed: an absolute user or drive path was detected.'
    }
    Write-SpikeEvidence -Evidence $evidence -Path $EvidencePath
    Write-Output "Evidence written to $EvidencePath"
}
finally {
    Pop-Location
}
