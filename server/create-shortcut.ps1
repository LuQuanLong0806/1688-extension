$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$sc = $ws.CreateShortcut("$desktop\商品采集管理.lnk")
$sc.TargetPath = "$PSScriptRoot\start.bat"
$sc.WorkingDirectory = $PSScriptRoot
$sc.Description = '商品采集管理'
$ico = "$PSScriptRoot\icon.ico"
if (Test-Path $ico) { $sc.IconLocation = $ico }
$sc.Save()
