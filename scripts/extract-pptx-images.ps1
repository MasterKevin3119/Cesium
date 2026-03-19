# Extract images from a .pptx (ZIP) into assets/slides/.
# Usage: .\extract-pptx-images.ps1 -Path ".\Flood Simulation.pptx"
# Or:   .\extract-pptx-images.ps1 -Path "C:\path\to\presentation.pptx"

param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = 'Stop'
$pptxPath = $PSCmdlet.GetUnresolvedProviderPathFromPSPath($Path)
if (-not (Test-Path -LiteralPath $pptxPath)) {
    Write-Error "File not found: $pptxPath"
}

$projectRoot = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $projectRoot "assets" "slides"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$zipPath = Join-Path $env:TEMP "pptx-extract-$([Guid]::NewGuid().ToString('N')).zip"
Copy-Item -LiteralPath $pptxPath -Destination $zipPath

try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    $mediaPrefix = "ppt/media/"
    $index = 1
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -notlike "${mediaPrefix}*") { continue }
        $name = $entry.Name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $ext = [System.IO.Path]::GetExtension($name)
        if ($ext -notmatch '^\.(png|jpe?g|gif|webp|emf|wmf)$') { continue }
        $outName = "media$index$ext"
        $outPath = Join-Path $outDir $outName
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outPath, $true)
        Write-Host "Extracted: $outName"
        $index++
    }
    $zip.Dispose()
} finally {
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
}

Write-Host "Done. Images are in: $outDir"
