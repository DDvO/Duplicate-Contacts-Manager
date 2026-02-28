# Build XPI with forward-slash paths (required for WebExtension jar reader)
# PowerShell Compress-Archive uses backslashes; Thunderbird expects forward slashes

Add-Type -AssemblyName System.IO.Compression.FileSystem

$SourceDir = "$PSScriptRoot"
$manifest = Get-Content "$SourceDir\manifest.json" -Raw | ConvertFrom-Json
$Version = $manifest.version
$OutXpi = "$SourceDir\duplicateContactsManager-$Version.xpi"
$TempZip = "$env:TEMP\dcm-$Version.zip"

# Prepare temp dir with only needed files
$tmp = "$env:TEMP\dcm-xpi"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item $SourceDir\manifest.json, $SourceDir\background.js, $SourceDir\window.html $tmp
Copy-Item $SourceDir\chrome, $SourceDir\_locales, $SourceDir\skin $tmp -Recurse

# Create zip with forward-slash paths (required for WebExtension)
Add-Type -AssemblyName System.IO.Compression
Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
$zip = [System.IO.Compression.ZipFile]::Open($TempZip, 1)
$tmpLen = $tmp.Length + 1
Get-ChildItem -Path $tmp -Recurse -File | ForEach-Object {
    $entryName = $_.FullName.Substring($tmpLen).Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
$zip.Dispose()

# Rename to xpi
Remove-Item $OutXpi -Force -ErrorAction SilentlyContinue
Move-Item $TempZip $OutXpi -Force
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Created $OutXpi"
