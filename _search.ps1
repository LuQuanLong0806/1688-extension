$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$pattern = '/api/categories|/api/category-mappings|/api/keyword-rels|/api/keyword-synonyms|/api/keyword-blacklist|/api/category-config|/api/dxm-category|/api/dxm-tree|/api/sync'
Get-ChildItem -Path "F:\00_project\1688-extension\server\public\js" -Recurse -Filter "*.js" | ForEach-Object {
    $f = $_.FullName
    $rel = $_.FullName.Replace("F:\00_project\1688-extension\", "")
    Select-String -Path $f -Pattern $pattern | ForEach-Object {
        $line = $_.Line.Trim()
        if ($line.Length -gt 120) { $line = $line.Substring(0, 120) }
        Write-Output ("{0}:{1} => {2}" -f $rel, $_.LineNumber, $line)
    }
}
Get-ChildItem -Path "F:\00_project\1688-extension\sites" -Recurse -Filter "*.js" | ForEach-Object {
    $f = $_.FullName
    $rel = $_.FullName.Replace("F:\00_project\1688-extension\", "")
    Select-String -Path $f -Pattern $pattern | ForEach-Object {
        $line = $_.Line.Trim()
        if ($line.Length -gt 120) { $line = $line.Substring(0, 120) }
        Write-Output ("{0}:{1} => {2}" -f $rel, $_.LineNumber, $line)
    }
}
