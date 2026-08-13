$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot 'Evidence.psm1') -Force

$evidence = New-SpikeEvidence -SpikeId 'fixture' -StartedAtUtc ([datetime]::UtcNow)
$evidence.status = 'pass'
$evidence.assertions = @([ordered]@{ id = 'fixture-pass'; status = 'pass'; details = 'Fixture validates.' })
$validation = Test-SpikeEvidence -Evidence $evidence
if (-not $validation.Valid) { throw "Expected valid fixture: $($validation.Errors -join ', ')" }

$evidence.status = 'unknown'
$validation = Test-SpikeEvidence -Evidence $evidence
if ($validation.Valid -or $validation.Errors -notcontains '$.status:enum') { throw 'Schema enum did not reject an invalid status.' }

$evidence.status = 'pass'
[void]$evidence.environment.Remove('cleanVm')
$validation = Test-SpikeEvidence -Evidence $evidence
if ($validation.Valid -or $validation.Errors -notcontains '$.environment.cleanVm:required') { throw 'Schema nested required field was not enforced.' }

$redacted = Protect-EvidenceText 'Authorization: Bearer top-secret-value'
if ($redacted -match 'top-secret-value') { throw 'Bearer token was not redacted.' }

$redacted = Protect-EvidenceText 'api_key=sk-abcdefghijklmnop'
if ($redacted -match 'sk-abcdefghijklmnop') { throw 'API key was not redacted.' }

$redacted = Protect-EvidenceText (Join-Path $PSScriptRoot 'fixture.txt')
if ($redacted -match [regex]::Escape($PSScriptRoot)) { throw 'Workspace path was not redacted.' }

Write-Output 'PASS evidence schema fixture and redaction tests'
