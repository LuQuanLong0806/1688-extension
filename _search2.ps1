$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$files = @(
    "F:\00_project\1688-extension\sites\dianxiaomi\dxm-config-ui.js",
    "F:\00_project\1688-extension\sites\dianxiaomi\dxm-float-bee.js"
)
$pattern = '/api/dxm-category|/api/dxm-tree|/api/sync|/api/categories|/api/category-mappings|/api/keyword'
foreach ($fp in $files) {
    if (Test-Path $fp) {
        $rel = $fp.Replace("F:\00_project\1688-extension\", "")
        Select-String -Path $fp -Pattern $pattern | ForEach-Object {
            $line = $_.Line.Trim()
            if ($line.Length -gt 120) { $line = $line.Substring(0, 120) }
            Write-Output ("{0}:{1} => {2}" -f $rel, $_.LineNumber, $line)
        }
    }
}
