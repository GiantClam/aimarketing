[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Pptx,
    [Parameter(Mandatory = $true)][string]$PreviewDirectory,
    [Parameter(Mandatory = $true)][string]$EvidenceOut
)

$ErrorActionPreference = "Stop"
$pptxPath = (Resolve-Path -LiteralPath $Pptx).Path
New-Item -ItemType Directory -Force -Path $PreviewDirectory | Out-Null
$previewPath = (Resolve-Path -LiteralPath $PreviewDirectory).Path
$application = $null
$presentation = $null
try {
    $application = New-Object -ComObject PowerPoint.Application
    $presentation = $application.Presentations.Open($pptxPath, $true, $true, $false)
    $version = $application.Version
    $slideCount = $presentation.Slides.Count
    $fonts = @()
    for ($index = 1; $index -le $presentation.Fonts.Count; $index++) {
        $fonts += $presentation.Fonts.Item($index).Name
    }
    for ($index = 1; $index -le $slideCount; $index++) {
        $presentation.Slides.Item($index).Export((Join-Path $previewPath ("slide-{0:D2}.png" -f $index)), "PNG", 1280, 720)
    }
    $previewFiles = Get-ChildItem -LiteralPath $previewPath -Filter "slide-*.png" | Sort-Object Name
    $result = [ordered]@{
        schema_version = 1
        office_application = "Microsoft PowerPoint"
        office_version = $version
        opened_read_only = $true
        slide_count = $slideCount
        slide_size_points = @($presentation.PageSetup.SlideWidth, $presentation.PageSetup.SlideHeight)
        declared_fonts = @($fonts | Sort-Object -Unique)
        preview_count = $previewFiles.Count
        previews = @($previewFiles | ForEach-Object {
            [ordered]@{
                name = $_.Name
                bytes = $_.Length
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        })
        pass = ($slideCount -gt 0 -and $previewFiles.Count -eq $slideCount -and ($previewFiles | Where-Object Length -eq 0).Count -eq 0)
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidenceOut) | Out-Null
    $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $EvidenceOut -Encoding utf8
    if (-not $result.pass) { exit 1 }
}
finally {
    if ($presentation) { $presentation.Close() }
    if ($application) { $application.Quit() }
    if ($presentation) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
    if ($application) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($application) }
}
