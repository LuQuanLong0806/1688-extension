$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Select-String -Path "F:\00_project\1688-extension\server\app.js" -Pattern "categories|dxm-tree|sync" | ForEach-Object {
    $line = $_.Line.Trim()
    if ($line.Length -gt 120) { $line = $line.Substring(0, 120) }
    Write-Output ("{0}:{1} => {2}" -f "server/app.js", $_.LineNumber, $line)
}
