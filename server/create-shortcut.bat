@echo off
chcp 65001 >nul 2>nul
cd /d %~dp0

set SCRIPT=%cd%\start-silent.vbs
set SHORTCUT=%USERPROFILE%\Desktop\商品采集服务.lnk

echo 正在创建桌面快捷方式...

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%SHORTCUT%'); $sc.TargetPath = '%SCRIPT%'; $sc.WorkingDirectory = '%cd%'; $sc.Description = '商品采集管理服务'; $sc.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo [成功] 已创建桌面快捷方式: 商品采集服务
    echo 双击即可启动服务（无黑窗口）
) else (
    echo.
    echo [失败] 创建快捷方式失败
)

echo.
pause
