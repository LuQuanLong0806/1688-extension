@echo off
chcp 65001 >nul 2>nul
cd /d %~dp0

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org
    pause
    exit /b 1
)

:: 检查依赖
if not exist "node_modules" (
    echo [安装] 首次运行，正在安装依赖...
    npm install --production
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo.
)

echo [启动] 商品采集服务...
node server.js
pause
