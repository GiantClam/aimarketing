param(
  [string]$NormalZip = ".artifacts/desktop-release-normal/AI-Marketing-Windows-x64-normal.zip",
  [string]$PortableZip = ".artifacts/desktop-release-portable/AI-Marketing-Windows-x64-portable.zip",
  [string]$RuntimeZip = ".artifacts/desktop-runtime-release-retry/AIMarketing-Runtime-x64.zip",
  [string]$ReleaseDir = "apps/desktop/src-tauri/target/release",
  [string]$PnpmAuditJson,
  [switch]$RequireAuthenticode,
  [switch]$RequireSignedManifest,
  [switch]$RequireDependencyAudit
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Resolve-RepoPath([string]$path) {
  return [IO.Path]::GetFullPath((Join-Path $repoRoot $path))
}

function Open-RequiredZip([string]$path, [string]$label) {
  $full = Resolve-RepoPath $path
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "desktop_release_audit_missing:${label}:$full" }
  return [IO.Compression.ZipFile]::OpenRead($full)
}

function Read-ZipText([IO.Compression.ZipArchiveEntry]$entry) {
  $reader = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8, $true)
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-LicenseEvidence([IO.Compression.ZipArchive]$archive, [IO.Compression.ZipArchiveEntry]$packageEntry) {
  $name = $packageEntry.FullName.Replace('\', '/')
  $separator = $name.LastIndexOf('/')
  $directory = if ($separator -ge 0) { $name.Substring(0, $separator) } else { "" }
  $licenseEntry = $archive.Entries | Where-Object {
    $candidate = $_.FullName.Replace('\', '/')
    $candidateDirectory = if ($candidate.LastIndexOf('/') -ge 0) { $candidate.Substring(0, $candidate.LastIndexOf('/')) } else { "" }
    $candidateDirectory -eq $directory -and $_.Name -match '^(?i:license|licence|copying|notice)(\.|$)'
  } | Select-Object -First 1
  return [ordered]@{
    metadata = $null
    file = if ($null -ne $licenseEntry) { $licenseEntry.FullName.Replace('\', '/') } else { $null }
  }
}

function Get-LicenseRecords([IO.Compression.ZipArchive]$archive, [string]$source) {
  $records = @()
  foreach ($entry in $archive.Entries | Where-Object { $_.Name -eq "package.json" -and $_.FullName.Replace('\', '/') -match '/node_modules/(?:@[^/]+/)?[^/]+/package\.json$' }) {
    try { $package = Read-ZipText $entry | ConvertFrom-Json } catch { continue }
    $evidence = Get-LicenseEvidence $archive $entry
    $license = if ($package.license -is [string]) { [string]$package.license } elseif ($package.licenses) { ($package.licenses | ConvertTo-Json -Compress) } else { $null }
    $evidence.metadata = $license
    $records += [ordered]@{
      source = $source
      path = $entry.FullName.Replace('\', '/')
      name = if ($package.name -is [string]) { [string]$package.name } else { $null }
      version = if ($package.version -is [string]) { [string]$package.version } else { $null }
      license = $license
      licenseFile = $evidence.file
      complete = (-not [string]::IsNullOrWhiteSpace($license)) -or ($null -ne $evidence.file)
    }
  }
  return $records
}

function Get-ManifestAudit([IO.Compression.ZipArchive]$archive, [string]$source) {
  $entry = $archive.Entries | Where-Object { $_.Name -eq "runtime-manifest.json" } | Select-Object -First 1
  if ($null -eq $entry) { throw "desktop_release_audit_manifest_missing:$source" }
  $manifest = Read-ZipText $entry | ConvertFrom-Json
  $integrity = $manifest.integrity
  $signature = if ($integrity.signature -is [string]) { [string]$integrity.signature } else { "" }
  return [ordered]@{
    source = $source
    manifestId = [string]$manifest.manifestId
    architecture = [string]$manifest.architecture
    hashAlgorithm = [string]$integrity.hashAlgorithm
    signatureAlgorithm = [string]$integrity.signatureAlgorithm
    signatureRequired = [bool]$integrity.required
    signaturePresent = -not [string]::IsNullOrWhiteSpace($signature)
  }
}

function Audit-Archive([string]$path, [string]$source) {
  $archive = Open-RequiredZip $path $source
  try {
    $manifest = Get-ManifestAudit $archive $source
    $licenses = @(Get-LicenseRecords $archive $source)
    $missing = @($licenses | Where-Object { -not $_.complete })
    return [ordered]@{
      source = $source
      archive = (Resolve-RepoPath $path)
      entries = $archive.Entries.Count
      manifest = $manifest
      licensePackages = $licenses.Count
      licenseEvidenceMissing = @($missing | ForEach-Object { "$($_.name)@$($_.version)" })
      licenseAudit = if ($missing.Count -eq 0) { "pass" } else { "incomplete" }
    }
  } finally { $archive.Dispose() }
}

function Audit-Authenticode([string]$path) {
  $full = Resolve-RepoPath $path
  if (-not (Test-Path -LiteralPath $full -PathType Container)) { return [ordered]@{ status = "not_available"; path = $full; files = @() } }
  $candidates = @(
    (Join-Path $full "ai-marketing.exe"),
    (Get-ChildItem -LiteralPath $full -File -Filter "*.dll" | Select-Object -ExpandProperty FullName),
    (Join-Path $full "_up\dist-runtime\runtime\node\node.exe"),
    (Join-Path $full "_up\dist-runtime\runtime\opencode\opencode.exe")
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -Unique
  try {
    $files = @($candidates | ForEach-Object {
      $signature = Get-AuthenticodeSignature -LiteralPath $_
      [ordered]@{ path = $_; status = [string]$signature.Status; signer = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { $null } }
    })
  } catch {
    return [ordered]@{ status = "not_available"; path = $full; files = @(); reason = "authenticode_unavailable:$($_.Exception.Message)" }
  }
  return [ordered]@{ status = if ($files.Count -gt 0 -and @($files | Where-Object { $_.status -eq "Valid" }).Count -eq $files.Count) { "pass" } else { "incomplete" }; path = $full; files = $files }
}

function Audit-Dependencies([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { return [ordered]@{ status = "not_run"; reason = "pass -PnpmAuditJson from an approved registry audit" } }
  $full = Resolve-RepoPath $path
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "desktop_release_audit_dependency_report_missing:$full" }
  $raw = Get-Content -Raw -Encoding UTF8 $full | ConvertFrom-Json
  $vulnerabilities = if ($raw.metadata.vulnerabilities) { $raw.metadata.vulnerabilities } else { $raw.vulnerabilities }
  $total = 0
  if ($vulnerabilities) {
    foreach ($severity in @("info", "low", "moderate", "high", "critical")) {
      $value = $vulnerabilities.$severity
      if ($null -ne $value) { $total += [int]$value }
    }
  }
  return [ordered]@{ status = if ($total -eq 0) { "pass" } else { "fail" }; report = $full; vulnerabilities = $vulnerabilities }
}

$audits = @(
  (Audit-Archive $NormalZip "normal"),
  (Audit-Archive $PortableZip "portable"),
  (Audit-Archive $RuntimeZip "runtime")
)
$authenticode = Audit-Authenticode $ReleaseDir
$dependencies = Audit-Dependencies $PnpmAuditJson
$missingLicense = @($audits | ForEach-Object { $_.licenseEvidenceMissing } | Where-Object { $_ })
$unsignedManifest = @($audits | Where-Object { -not $_.manifest.signaturePresent -or -not $_.manifest.signatureRequired })

if ($RequireSignedManifest -and $unsignedManifest.Count) { throw "desktop_release_audit_manifest_signature_required" }
if ($RequireAuthenticode -and $authenticode.status -ne "pass") { throw "desktop_release_audit_authenticode_required" }
if ($RequireDependencyAudit -and $dependencies.status -ne "pass") { throw "desktop_release_audit_dependency_audit_required" }
if ($missingLicense.Count) { throw "desktop_release_audit_license_evidence_missing:$($missingLicense -join ',')" }

ConvertTo-Json -InputObject ([ordered]@{
  status = if ($authenticode.status -eq "pass" -and $dependencies.status -in @("pass", "not_run") -and $unsignedManifest.Count -eq 0) { "pass" } else { "incomplete" }
  archives = $audits
  authenticode = $authenticode
  dependencies = $dependencies
  licenseAudit = "pass"
  signedManifest = if ($unsignedManifest.Count) { "development_unsigned" } else { "pass" }
}) -Depth 12
