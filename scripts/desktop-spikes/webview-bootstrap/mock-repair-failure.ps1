param([string]$Sentinel)

$ErrorActionPreference = 'Stop'
Write-Error "Simulated WebView2 repair failure for $Sentinel"
exit 31

