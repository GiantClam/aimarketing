Set-StrictMode -Version Latest
$script:EvidenceSchemaPath = Join-Path $PSScriptRoot 'evidence.schema.json'
$script:WorkspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))

function Protect-EvidenceText {
  param([AllowNull()][object]$Value)

  if ($null -eq $Value) { return $null }
  $text = [string]$Value
  $profile = [Environment]::GetFolderPath('UserProfile')
  if ($profile) {
    $text = $text.Replace($profile, '<USER_PROFILE>', [StringComparison]::OrdinalIgnoreCase)
  }
  if ($script:WorkspaceRoot) {
    $text = $text.Replace($script:WorkspaceRoot, '<WORKSPACE_ROOT>', [StringComparison]::OrdinalIgnoreCase)
  }
  $patterns = @(
    '(?i)(authorization\s*[:=]\s*bearer\s+)[^\s,;]+',
    '(?i)(api[_-]?key\s*[:=]\s*)[^\s,;]+',
    '(?i)(basic\s+)[a-z0-9+/=]{8,}'
  )
  foreach ($pattern in $patterns) {
    $text = [regex]::Replace($text, $pattern, '$1<REDACTED>')
  }
  return $text
}

function Get-NodeProperty {
  param([AllowNull()][object]$Value, [Parameter(Mandatory)][string]$Name, [ref]$Exists)

  $Exists.Value = $false
  if ($null -eq $Value) { return $null }
  if ($Value -is [Collections.IDictionary]) {
    if ($Value.Contains($Name)) {
      $Exists.Value = $true
      $result = $Value[$Name]
      if ($result -is [array] -or ($result -is [Collections.IList] -and $result -isnot [string])) { Write-Output -NoEnumerate $result }
      else { return $result }
      return
    }
    return $null
  }
  $property = $Value.PSObject.Properties[$Name]
  if ($property) {
    $Exists.Value = $true
    $result = $property.Value
    if ($result -is [array] -or ($result -is [Collections.IList] -and $result -isnot [string])) { Write-Output -NoEnumerate $result }
    else { return $result }
    return
  }
  return $null
}

function Test-SchemaNode {
  param(
    [AllowNull()][object]$Value,
    [Parameter(Mandatory)][object]$Schema,
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][AllowEmptyCollection()][Collections.Generic.List[string]]$Errors
  )

  $exists = $false
  $constValue = Get-NodeProperty -Value $Schema -Name 'const' -Exists ([ref]$exists)
  if ($exists -and ($Value -ne $constValue)) { $Errors.Add("$Path`:const") }

  $exists = $false
  $enumValues = Get-NodeProperty -Value $Schema -Name 'enum' -Exists ([ref]$exists)
  if ($exists -and ($Value -notin @($enumValues))) { $Errors.Add("$Path`:enum") }

  $exists = $false
  $type = $null
  $type = Get-NodeProperty -Value $Schema -Name 'type' -Exists ([ref]$exists)
  if ($exists) {
    $typeMatches = switch ([string]$type) {
      'object' { $Value -is [Collections.IDictionary] -or $Value -is [pscustomobject] }
      'array' { $Value -is [array] -or ($Value -is [Collections.IList] -and $Value -isnot [string]) }
      'string' { $Value -is [string] }
      'integer' { $Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64] -or $Value -is [uint16] -or $Value -is [uint32] -or $Value -is [uint64] }
      'number' { $Value -is [ValueType] }
      'boolean' { $Value -is [bool] }
      default { $true }
    }
    if (-not $typeMatches) {
      $Errors.Add("$Path`:type:$type")
      return
    }
  }

  if ($type -eq 'string') {
    $exists = $false
    $minLength = Get-NodeProperty -Value $Schema -Name 'minLength' -Exists ([ref]$exists)
    if ($exists -and ([string]$Value).Length -lt [int]$minLength) { $Errors.Add("$Path`:minLength") }
    $exists = $false
    $format = Get-NodeProperty -Value $Schema -Name 'format' -Exists ([ref]$exists)
    if ($exists -and $format -eq 'date-time') {
      $parsed = [datetimeoffset]::MinValue
      if (-not [datetimeoffset]::TryParse([string]$Value, [ref]$parsed)) { $Errors.Add("$Path`:date-time") }
    }
  }

  if ($type -eq 'object') {
    $exists = $false
    $required = Get-NodeProperty -Value $Schema -Name 'required' -Exists ([ref]$exists)
    if ($exists) {
      foreach ($name in @($required)) {
        $propertyExists = $false
        [void](Get-NodeProperty -Value $Value -Name ([string]$name) -Exists ([ref]$propertyExists))
        if (-not $propertyExists) { $Errors.Add("$Path.$name`:required") }
      }
    }
    $exists = $false
    $properties = Get-NodeProperty -Value $Schema -Name 'properties' -Exists ([ref]$exists)
    if ($exists) {
      foreach ($propertySchema in $properties.PSObject.Properties) {
        $propertyExists = $false
        $propertyValue = Get-NodeProperty -Value $Value -Name $propertySchema.Name -Exists ([ref]$propertyExists)
        if ($propertyExists) { Test-SchemaNode -Value $propertyValue -Schema $propertySchema.Value -Path "$Path.$($propertySchema.Name)" -Errors $Errors }
      }
    }
  }

  if ($type -eq 'array') {
    $exists = $false
    $items = Get-NodeProperty -Value $Schema -Name 'items' -Exists ([ref]$exists)
    if ($exists) {
      $index = 0
      foreach ($item in @($Value)) {
        Test-SchemaNode -Value $item -Schema $items -Path "$Path[$index]" -Errors $Errors
        $index += 1
      }
    }
  }
}

function Get-SpikeEnvironment {
  $os = Get-CimInstance Win32_OperatingSystem
  return [ordered]@{
    osCaption = Protect-EvidenceText $os.Caption
    osVersion = [string]$os.Version
    build = [string]$os.BuildNumber
    architecture = [string]$os.OSArchitecture
    processArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    powershellVersion = $PSVersionTable.PSVersion.ToString()
    cleanVm = $false
    baselineId = "local-$($os.BuildNumber)-$([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture)"
  }
}

function New-SpikeEvidence {
  param(
    [Parameter(Mandatory)][string]$SpikeId,
    [Parameter(Mandatory)][datetime]$StartedAtUtc
  )

  return [ordered]@{
    schemaVersion = 1
    spikeId = $SpikeId
    status = 'not-run'
    startedAtUtc = $StartedAtUtc.ToUniversalTime().ToString('o')
    finishedAtUtc = $StartedAtUtc.ToUniversalTime().ToString('o')
    environment = Get-SpikeEnvironment
    components = @()
    commands = @()
    assertions = @()
    artifacts = @()
    limitations = @()
  }
}

function Test-SpikeEvidence {
  param(
    [Parameter(Mandatory)][object]$Evidence,
    [string]$SchemaPath = $script:EvidenceSchemaPath
  )

  $errors = [System.Collections.Generic.List[string]]::new()
  if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) { $errors.Add('schema:file-missing') }
  else {
    $schema = Get-Content -Raw -Encoding utf8 -LiteralPath $SchemaPath | ConvertFrom-Json
    Test-SchemaNode -Value $Evidence -Schema $schema -Path '$' -Errors $errors
  }
  $serialized = $Evidence | ConvertTo-Json -Depth 30 -Compress
  if ($serialized -match '(?i)(sk-[a-z0-9_-]{12,}|authorization[^\r\n]{0,32}(?:bearer|basic)\s+(?!<REDACTED>|\[redacted\])\S+|"(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)"\s*:\s*"(?!<REDACTED>|\[redacted\])[^"\r\n]{4,}"|[a-z]:\\users\\[^\\"\r\n]+|/users/[^/"\r\n]+)') {
    $errors.Add('secret-pattern:detected')
  }
  return [pscustomobject]@{ Valid = ($errors.Count -eq 0); Errors = @($errors) }
}

function Write-SpikeEvidence {
  param(
    [Parameter(Mandatory)][object]$Evidence,
    [Parameter(Mandatory)][string]$Path
  )

  $Evidence.finishedAtUtc = [datetime]::UtcNow.ToString('o')
  $validation = Test-SpikeEvidence -Evidence $Evidence
  if (-not $validation.Valid) {
    throw "Evidence validation failed: $($validation.Errors -join ', ')"
  }
  $parent = Split-Path -Parent $Path
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $temporary = "$Path.tmp"
  $json = $Evidence | ConvertTo-Json -Depth 30
  [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Get-SpikeArtifactRecord {
  param([Parameter(Mandatory)][string]$Path)

  $item = Get-Item -LiteralPath $Path
  return [ordered]@{
    path = Protect-EvidenceText $item.FullName
    sizeBytes = $item.Length
    sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

Export-ModuleMember -Function Protect-EvidenceText, Get-SpikeEnvironment, New-SpikeEvidence, Test-SpikeEvidence, Write-SpikeEvidence, Get-SpikeArtifactRecord
