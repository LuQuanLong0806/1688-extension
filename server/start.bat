@echo off
cd /d %~dp0

title Product Collector

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install: https://nodejs.org
    pause
    exit /b 1
)

:: Single instance: if port 3000 is in use, open browser
netstat -ano 2>nul | findstr ":3000.*LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Server already running, opening browser...
    call :openChrome http://localhost:3000
    exit /b 0
)

:: Install deps
if not exist "node_modules" (
    echo [INSTALL] First run, installing dependencies...
    call npm install --production
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo.
)

:: Create desktop shortcut
set "SHORTCUT_NAME=Product Collector"
if not exist "%USERPROFILE%\Desktop\%SHORTCUT_NAME%.lnk" (
    if exist "%~dp0create-shortcut.ps1" (
        powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"
    )
)

echo [START] Starting server...
node server.js
pause

goto :eof

:: ========== Subroutines ==========

:openChrome
set "URL=%~1"
set "CHROME="
for %%p in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%Google\Chrome\Application\chrome.exe"
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
