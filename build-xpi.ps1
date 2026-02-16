# Build XPI with forward-slash paths (required for WebExtension jar reader)
# PowerShell Compress-Archive uses backslashes; Thunderbird expects forward slashes

Add-Type -AssemblyName System.IO.Compression.FileSystem

$SourceDir = "$PSScriptRoot"
$OutXpi = "$SourceDir\duplicateContactsManager-2.2.1.xpi"
$TempZip = "$env:TEMP\dcm-2.2.1.zip"

# Prepare temp dir with only needed files
$tmp = "$env:TEMP\dcm-xpi"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item $SourceDir\manifest.json, $SourceDir\background.js, $SourceDir\window.html $tmp
Copy-Item $SourceDir\chrome, $SourceDir\_locales, $SourceDir\skin $tmp -Recurse

# Custom encoder: replace backslash with forward slash in entry names
$EncoderSrc = @"
public class ZipPathEncoder : System.Text.UTF8Encoding {
    public ZipPathEncoder() : base(true) { }
    public override byte[] GetBytes(string s) {
        return base.GetBytes(s.Replace("\\", "/"));
    }
}
"@
Add-Type -TypeDefinition $EncoderSrc -PassThru | Out-Null

# Create zip with forward-slash paths
Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $tmp, $TempZip,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false,
    [ZipPathEncoder]::new()
)

# Rename to xpi
Remove-Item $OutXpi -Force -ErrorAction SilentlyContinue
Move-Item $TempZip $OutXpi -Force
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Created $OutXpi"
