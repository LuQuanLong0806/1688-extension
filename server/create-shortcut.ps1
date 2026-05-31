$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$sc = $ws.CreateShortcut("$desktop\商品采集管理.lnk")
$batPath = Join-Path $PSScriptRoot 'start.bat'
$sc.TargetPath = 'cmd.exe'
$sc.Arguments = "/k `"$batPath`""
$sc.WorkingDirectory = $PSScriptRoot
$sc.Description = '商品采集管理'
$ico = Join-Path $PSScriptRoot 'icon.ico'
if (Test-Path $ico) { $sc.IconLocation = $ico }
$sc.Save()
Write-Host "[成功] 已创建桌面快捷方式: $desktop\商品采集管理.lnk"
