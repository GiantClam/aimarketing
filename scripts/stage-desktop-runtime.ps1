param(
  [string]$OutputRoot = "apps/desktop/dist-runtime/runtime"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$destination = Join-Path $root $OutputRoot
New-Item -ItemType Directory -Force -Path (Join-Path $destination "node"), (Join-Path $destination "opencode"), (Join-Path $destination "fonts"), (Join-Path $destination "embedding") | Out-Null
$embeddingDescriptor = @{ schemaVersion = 1; id = "local-hash-384-v1"; type = "builtin-feature-hash"; dimension = 384; network = $false; description = "Deterministic local feature-hash embedding used for offline hybrid retrieval." } | ConvertTo-Json -Compress
Set-Content -LiteralPath (Join-Path $destination "embedding/local-hash-384-v1.json") -Value $embeddingDescriptor -Encoding utf8
$lancedbDestination = Join-Path $destination "lancedb"
node (Join-Path $root "scripts/stage-lancedb-runtime.mjs") $root $lancedbDestination | Write-Output
$distRoot = Split-Path -Parent $destination
Copy-Item -LiteralPath (Join-Path $root "scripts/install-desktop-runtime.ps1") -Destination (Join-Path $distRoot "install-desktop-runtime.ps1") -Force

function Copy-IfFile([string]$source, [string]$target) {
  if ([string]::IsNullOrWhiteSpace($source) -or -not (Test-Path -LiteralPath $source -PathType Leaf)) { return $false }
  Copy-Item -LiteralPath $source -Destination $target -Force
  return $true
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$nodeTarget = Join-Path $destination "node/node.exe"
$nodeStaged = Copy-IfFile $node $nodeTarget

$opencodeCandidates = @()
if ($node) { $opencodeCandidates += (Join-Path (Split-Path $node -Parent) "node_modules/opencode-ai/bin/opencode.exe") }
$opencodeCandidates += (Join-Path $env:APPDATA "npm/node_modules/opencode-ai/bin/opencode.exe")
$opencodeCandidates += (Join-Path $env:LOCALAPPDATA "npm/node_modules/opencode-ai/bin/opencode.exe")
$opencode = $opencodeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
$opencodeTarget = Join-Path $destination "opencode/opencode.exe"
$opencodeStaged = Copy-IfFile $opencode $opencodeTarget
$fontStaged = Copy-IfFile (Join-Path $env:WINDIR "Fonts/msyh.ttc") (Join-Path $destination "fonts/msyh.ttc")

@{
  schemaVersion = 1
  manifestId = "aimarketing-runtime-windows-x64-v1"
  platform = "windows"
  architecture = "x64"
  compatibility = @{ architecture = "x64"; windows = @("10-22H2", "11") }
  integrity = @{ hashAlgorithm = "sha256"; signatureAlgorithm = "ed25519"; signature = $null }
  stagedAt = [DateTime]::UtcNow.ToString("o")
  node = @{ staged = $nodeStaged; path = if ($nodeStaged) { "runtime/node/node.exe" } else { $null } }
  opencode = @{ staged = $opencodeStaged; path = if ($opencodeStaged) { "runtime/opencode/opencode.exe" } else { $null } }
  python = @{ staged = $false; reason = "Python embedded runtime is installed by the mirror-chain installer when PPT probe requires it." }
  fonts = @{ staged = $fontStaged; path = if ($fontStaged) { "runtime/fonts/msyh.ttc" } else { $null } }
  lancedb = @{ staged = Test-Path -LiteralPath (Join-Path $destination "lancedb/node_modules/@lancedb/lancedb/dist/index.js") -PathType Leaf; path = "runtime/lancedb/node_modules/@lancedb/lancedb/dist/index.js"; native = "runtime/lancedb/node_modules/@lancedb/lancedb-win32-x64-msvc/lancedb.win32-x64-msvc.node" }
  embedding = @{ staged = $true; path = "runtime/embedding/local-hash-384-v1.json"; model = "local-hash-384-v1"; dimension = 384; network = $false }
  assets = @(
    @{
      id = "node-embed-amd64"
      kind = "archive"
      relativePath = "runtime/node/node-v22.22.0-win-x64.zip"
      extractPath = "runtime/node"
      sha256 = "c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a"
      urls = @{
        aliyun = "https://npmmirror.com/mirrors/node/v22.22.0/node-v22.22.0-win-x64.zip"
        tencent = "https://mirrors.cloud.tencent.com/nodejs-release/v22.22.0/node-v22.22.0-win-x64.zip"
        tsinghua = "https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v22.22.0/node-v22.22.0-win-x64.zip"
        official = "https://nodejs.org/dist/v22.22.0/node-v22.22.0-win-x64.zip"
      }
    },
    @{
      id = "python-embed-amd64"
      kind = "archive"
      relativePath = "runtime/python/python-3.13.6-embed-amd64.zip"
      extractPath = "runtime/python"
      bytes = 10916608
      sha256 = "d6ab71980c0be5809f2a0edd991e28d999e7ac971dc3b6da676dc2f80eac41dd"
      urls = @{
        aliyun = "https://mirrors.aliyun.com/python-release/windows/python-3.13.6-embed-amd64.zip"
        tencent = "https://mirrors.cloud.tencent.com/python-release/windows/python-3.13.6-embed-amd64.zip"
        tsinghua = "https://mirrors.tuna.tsinghua.edu.cn/python-releases/windows/python-3.13.6-embed-amd64.zip"
        official = "https://www.python.org/ftp/python/3.13.6/python-3.13.6-embed-amd64.zip"
      }
    },
    @{
      id = "python-get-pip"
      kind = "file"
      relativePath = "runtime/python/get-pip.py"
      bytes = 2230488
      sha256 = "fb24e693bab954209a063d90953621412ccad4a500905a726286e038f508ddf6"
      urls = @{
        aliyun = "https://mirrors.aliyun.com/pypi/get-pip.py"
        tencent = "https://mirrors.cloud.tencent.com/pypi/get-pip.py"
        tsinghua = "https://pypi.tuna.tsinghua.edu.cn/get-pip.py"
        official = "https://bootstrap.pypa.io/get-pip.py"
      }
    }
  )
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destination "runtime-manifest.json") -Encoding utf8
