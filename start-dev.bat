@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================
REM Stock Review 一键启动开发环境
REM 同时启动前端和后端开发服务器
REM ============================================

echo ============================================
echo  Stock Review 开发环境启动
echo ============================================
echo.

REM 设置路径
set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%server-side-project"
set "FRONTEND_DIR=%PROJECT_ROOT%Stock Review\uni-preset-vue-vite\uni-preset-vue-vite"
set "BACKEND_URL=http://127.0.0.1:3000"
set "FRONTEND_URL=http://localhost:5173"

echo [1/3] 检查项目目录...

if not exist "%BACKEND_DIR%" (
    echo [错误] 后端目录不存在: %BACKEND_DIR%
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%" (
    echo [错误] 前端目录不存在: %FRONTEND_DIR%
    pause
    exit /b 1
)

echo [OK] 目录检查通过
echo.

REM 检查端口占用
echo [2/3] 检查端口...

netstat -ano | findstr ":3000" >nul
if %errorlevel% equ 0 (
    echo [警告] 端口 3000 已被占用，后端可能已在运行
    set "BACKEND_PORT_OCCUPIED=1"
) else (
    set "BACKEND_PORT_OCCUPIED=0"
)

netstat -ano | findstr ":5173" >nul
if %errorlevel% equ 0 (
    echo [警告] 端口 5173 已被占用，前端可能已在运行
    set "FRONTEND_PORT_OCCUPIED=1"
) else (
    set "FRONTEND_PORT_OCCUPIED=0"
)

echo.

REM 启动后端
echo [3/3] 启动后端服务...
echo   目录: %BACKEND_DIR%
echo   命令: npm run dev
echo   访问: %BACKEND_URL%
echo.

if "%BACKEND_PORT_OCCUPIED%"=="0" (
    start "Stock Review Backend" cmd /k "cd /d "%BACKEND_DIR%" && npm run dev"
    echo [OK] 后端启动中...
) else (
    echo [跳过] 后端已在运行
)

echo.

REM 等待后端启动
timeout /t 3 /nobreak >nul

REM 启动前端
echo 启动前端服务...
echo   目录: %FRONTEND_DIR%
echo   命令: npm run dev:h5
echo   访问: %FRONTEND_URL%
echo.

if "%FRONTEND_PORT_OCCUPIED%"=="0" (
    start "Stock Review Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev:h5"
    echo [OK] 前端启动中...
) else (
    echo [跳过] 前端已在运行
)

echo.
echo ============================================
echo  开发环境启动完成！
echo ============================================
echo.
echo 访问地址:
echo   后端 API: %BACKEND_URL%
echo   前端页面: %FRONTEND_URL%
echo.
echo 账号: 9527
echo 密码: 9527
echo.
echo 按任意键关闭此窗口（服务会继续在后台运行）
echo.

pause
