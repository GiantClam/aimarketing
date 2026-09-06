param(
  [string]$ReleaseDir = "apps/desktop/src-tauri/target/release",
  [string]$SignToolPath = $env:COWORKANY_SIGNTOOL_PATH,
  [string]$CertificateThumbprint = $env:COWORKANY_AUTHENTICODE_THUMBPRINT,
  [string]$TimestampUrl = $(if ($env:COWORKANY_AUTHENTICODE_TIMESTAMP_URL) { $env:COWORKANY_AUTHENTICODE_TIMESTAMP_URL } else { "http://timestamp.digicert.com" }),
  [switch]$VerifyOnly,
  [switch]$RequireManifestSignature
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-RootedPath([string]$path) {
  if ([IO.Path]::IsPathRooted($path)) { return [IO.Path]::GetFullPath($path) }
  return [IO.Path]::GetFullPath((Join-Path $repoRoot $path))
}

$releaseRoot = Resolve-RootedPath $ReleaseDir
$manifestPath = Join-Path $releaseRoot "_up_\dist-runtime\runtime\runtime-manifest.json"
$manifestVerifier = Join-Path $repoRoot "scripts\runtime-manifest-crypto.mjs"

function Resolve-SignTool {
  if (-not [string]::IsNullOrWhiteSpace($SignToolPath)) {
    $resolved = Resolve-RootedPath $SignToolPath
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "windows_release_signtool_missing:$resolved" }
    return $resolved
  }

  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $kitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (Test-Path -LiteralPath $kitsRoot -PathType Container) {
    $candidate = Get-ChildItem -LiteralPath $kitsRoot -Filter "signtool.exe" -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object -Property FullName -Descending |
      Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }
  throw "windows_release_signtool_unavailable"
}

function Resolve-ReleaseTargets {
  if (-not (Test-Path -LiteralPath $releaseRoot -PathType Container)) { throw "windows_release_directory_missing:$releaseRoot" }
  $mainExecutable = Join-Path $releaseRoot "coworkany.exe"
  if (-not (Test-Path -LiteralPath $mainExecutable -PathType Leaf)) { throw "windows_release_main_executable_missing:$mainExecutable" }
  $candidates = @(
    $mainExecutable,
    (Join-Path $releaseRoot "_up_\dist-runtime\runtime\node\node.exe"),
    (Join-Path $releaseRoot "_up_\dist-runtime\runtime\opencode\opencode.exe")
  )
  $targets = @($candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -Unique)
  if ($targets.Count -eq 0) { throw "windows_release_sign_targets_missing:$releaseRoot" }
  return $targets
}

function Get-SignatureRecord([string]$path) {
  try {
    $signature = Get-AuthenticodeSignature -LiteralPath $path
    return [ordered]@{
      path = $path
      status = [string]$signature.Status
      signer = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { $null }
    }
  } catch {
    throw "windows_release_authenticode_unavailable:$($_.Exception.Message)"
  }
}

function Invoke-Sign([string]$signTool, [string]$path) {
  & $signTool sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 /a $path *> $null
  if ($LASTEXITCODE -ne 0) { throw "windows_release_authenticode_sign_failed:$path" }
}

function Verify-Manifest {
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "windows_release_manifest_missing:$manifestPath" }
  if (-not (Test-Path -LiteralPath $manifestVerifier -PathType Leaf)) { throw "windows_release_manifest_verifier_missing:$manifestVerifier" }
  try { $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { throw "windows_release_manifest_json_invalid" }
  $signature = [string]$manifest.integrity.signature
  if ([string]::IsNullOrWhiteSpace($signature)) {
    if ($RequireManifestSignature -or [bool]$manifest.integrity.required) { throw "windows_release_manifest_signature_required" }
    return "development_unsigned"
  }
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if ([string]::IsNullOrWhiteSpace($node)) { throw "windows_release_node_missing" }
  & $node $manifestVerifier verify $manifestPath *> $null
  if ($LASTEXITCODE -eq 0) { return "pass" }
  throw "windows_release_manifest_signature_invalid"
}

$targets = Resolve-ReleaseTargets
$manifestStatus = Verify-Manifest
$records = @()
$signTool = $null
$fileStatus = "pass"

if (-not $VerifyOnly) {
  if ([string]::IsNullOrWhiteSpace($CertificateThumbprint)) { throw "windows_release_authenticode_certificate_required" }
  $signTool = Resolve-SignTool
}

foreach ($target in $targets) {
  $record = Get-SignatureRecord $target
  if (-not $VerifyOnly -and $record.status -ne "Valid") {
    Invoke-Sign $signTool $target
    $record = Get-SignatureRecord $target
    if ($record.status -ne "Valid") { throw "windows_release_authenticode_verify_failed:$target" }
  }
  if ($record.status -ne "Valid") { $fileStatus = "incomplete" }
  $records += $record
}

ConvertTo-Json -InputObject ([ordered]@{
  status = if ($fileStatus -eq "pass" -and ($manifestStatus -eq "pass" -or -not $RequireManifestSignature)) { "pass" } else { "incomplete" }
  verifyOnly = [bool]$VerifyOnly
  releaseDir = $releaseRoot
  signTool = $signTool
  manifest = [ordered]@{ path = $manifestPath; status = $manifestStatus; required = [bool]$RequireManifestSignature }
  files = $records
}) -Depth 8
