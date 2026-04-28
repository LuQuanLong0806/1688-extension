@echo off
chcp 65001 >nul 2>nul
cd /d %~dp0

title 商品采集管理

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org
    pause
    exit /b 1
)

:: 单实例检测：如果端口已被占用，直接打开浏览器
netstat -ano 2>nul | findstr ":3000.*LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [提示] 服务已在运行，打开管理页面...
    call :openChrome http://localhost:3000
    exit /b 0
)

:: 检查依赖
if not exist "node_modules" (
    echo [安装] 首次运行，正在安装依赖...
    call npm install --production
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo.
)

:: 生成图标（如不存在）
if not exist "%~dp0icon.ico" call :generateIcon

:: 创建桌面快捷方式（如不存在）
if not exist "%USERPROFILE%\Desktop\商品采集管理.lnk" call :createShortcut

echo [启动] 商品采集服务...
node server.js
pause

goto :eof

:: ========== 子程序 ==========

:openChrome
set "URL=%~1"
set "CHROME="
for %%p in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%p set "CHROME=%%~p"
)
if defined CHROME (
    start "" "%CHROME%" "%URL%"
) else (
    start "" "%URL%"
)
goto :eof

:generateIcon
echo [图标] 生成桌面图标...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Add-Type -AssemblyName System.Drawing; ^
     $bmp = New-Object System.Drawing.Bitmap(256,256); ^
     $g = [System.Drawing.Graphics]::FromImage($bmp); ^
     $g.Clear([System.Drawing.Color]::FromArgb(255,106,0)); ^
     $font = New-Object System.Drawing.Font('Arial',160,[System.Drawing.FontStyle]::Bold); ^
     $sf = New-Object System.Drawing.StringFormat; ^
     $sf.Alignment='Center'; $sf.LineAlignment='Center'; ^
     $g.DrawString('G',$font,[System.Drawing.Brushes]::White,(New-Object System.Drawing.RectangleF(0,0,256,256)),$sf); ^
     $icon=[System.Drawing.Icon]::FromHandle($bmp.GetHicon()); ^
     $fs=[System.IO.File]::Create('%~dp0icon.ico'); ^
     $icon.Save($fs); $fs.Close(); ^
     $g.Dispose(); $bmp.Dispose()"
goto :eof

:createShortcut
echo [快捷方式] 创建桌面快捷方式...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws=New-Object -ComObject WScript.Shell; ^
     $sc=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\商品采集管理.lnk'); ^
     $sc.TargetPath='%~f0'; ^
     $sc.WorkingDirectory='%~dp0'; ^
     $sc.Description='商品采集管理'; ^
     $ico='%~dp0icon.ico'; ^
     if(Test-Path $ico){$sc.IconLocation=$ico}; ^
     $sc.Save()"
goto :eof
