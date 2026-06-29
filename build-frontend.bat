@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================
REM Stock Review Frontend Build Script
REM ============================================

echo ============================================
echo  Stock Review Frontend Build
echo ============================================
echo.

REM Set project path (handle spaces in path)
set "PROJECT_DIR=%~dp0Stock Review\uni-preset-vue-vite\uni-preset-vue-vite"
set "DIST_DIR=%PROJECT_DIR%\dist\build\h5"

echo [Debug] Project: %PROJECT_DIR%
echo [Debug] Output: %DIST_DIR%
echo.

REM Check if project exists
if not exist "%PROJECT_DIR%" (
    echo [Error] Project not found: %PROJECT_DIR%
    echo Please run this script from project root
echo.
    pause
    exit /b 1
)

REM Select environment
:select_env
echo Select environment:
echo   1. Development (dev:h5)
echo   2. Production (build:h5)
echo   3. Exit
echo.
set /p ENV_CHOICE="Enter option (1/2/3): "

if "%ENV_CHOICE%"=="1" (
    set "BUILD_CMD=dev:h5"
    set "ENV_NAME=Development"
) else if "%ENV_CHOICE%"=="2" (
    set "BUILD_CMD=build:h5"
    set "ENV_NAME=Production"
) else if "%ENV_CHOICE%"=="3" (
    echo Cancelled
    exit /b 0
) else (
    echo [Error] Invalid option
echo.
    goto select_env
)

echo.
echo ============================================
echo  Building %ENV_NAME%
echo ============================================
echo.

REM Enter project
cd /d "%PROJECT_DIR%"

REM Check dependencies
if not exist "node_modules" (
    echo [1/4] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [Error] Install failed
echo.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Dependencies OK
)

REM Build
echo [2/4] Building %ENV_NAME%...
call npm run %BUILD_CMD%
if %errorlevel% neq 0 (
    echo [Error] Build failed
echo.
    pause
    exit /b 1
)

echo [3/4] Build complete

REM Check output
if not exist "%DIST_DIR%\index.html" (
    echo [Error] Output missing index.html
echo.
    pause
    exit /b 1
)

echo [4/4] Output verified
echo.
echo ============================================
echo  %ENV_NAME% Build Success!
echo ============================================
echo.
echo Output: %DIST_DIR%
echo.

pause
