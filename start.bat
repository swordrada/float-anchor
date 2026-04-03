@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ======================================
echo     FloatAnchor 白板笔记应用
echo ======================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] 未检测到 Node.js，请先安装：https://nodejs.org
  pause
  exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER%

if not exist "node_modules" (
  echo.
  echo [INFO] 首次运行，正在安装依赖...
  npm install
  echo.
)

echo [INFO] 启动 FloatAnchor...
echo.
set ELECTRON_RUN_AS_NODE=
npm run dev
