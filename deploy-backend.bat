@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================
REM Stock Review Backend Deploy Script
REM ============================================

echo ============================================
echo  Stock Review Backend Deploy
echo ============================================
echo.

REM Set project path
set "PROJECT_DIR=%~dp0server-side-project"
set "SSH_HOST=bja.sealos.run_ns-rojp4s9y_stockreview"
set "DEVBOX_PROJECT_PATH=/home/devbox/project"

echo [Debug] Project: %PROJECT_DIR%
echo.

REM Check project exists
if not exist "%PROJECT_DIR%" (
    echo [Error] Project not found: %PROJECT_DIR%
    echo Please run from project root
    echo.
    pause
    exit /b 1
)

REM Select environment
:select_env
echo Select environment:
echo   1. Development (dev)
echo   2. Production (start:prod)
echo   3. Exit
echo.
set /p ENV_CHOICE="Enter option (1/2/3): "

if "%ENV_CHOICE%"=="1" (
    set "ENV=development"
    set "ENV_FILE=.env.development"
    set "ENV_NAME=Development"
    set "ENV_CMD=dev"
) else if "%ENV_CHOICE%"=="2" (
    set "ENV=production"
    set "ENV_FILE=.env.production"
    set "ENV_NAME=Production"
    set "ENV_CMD=start:prod"
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
echo  Deploying to %ENV_NAME%
echo ============================================
echo.

REM Check env file exists
set "ENV_FILE_PATH=%PROJECT_DIR%\%ENV_FILE%"
if not exist "%ENV_FILE_PATH%" (
    echo [Error] Env file not found: %ENV_FILE_PATH%
    echo.
    pause
    exit /b 1
)

echo [1/4] Env file OK: %ENV_FILE%

REM Copy env file
copy /Y "%ENV_FILE_PATH%" "%PROJECT_DIR%\.env" >nul
if %errorlevel% neq 0 (
    echo [Error] Copy env file failed
    pause
    exit /b 1
)
echo [2/4] Copied %ENV_FILE% to .env

REM Show info
echo.
echo Deploy Info:
echo   Env: %ENV_NAME%
echo   File: %ENV_FILE%
echo.

REM Confirm
set /p CONFIRM="Confirm deploy to %ENV_NAME%? (y/n): "
if /I not "%CONFIRM%"=="y" (
    echo Cancelled
    exit /b 0
)

echo.
echo [3/4] Syncing to Devbox...
echo.

REM Check ssh command
where ssh >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] ssh not found in PATH
    echo.
    echo Please run this script in Git Bash or install OpenSSH
    echo.
    pause
    exit /b 1
)

echo [OK] ssh found

REM Sync via scp using SSH config
echo Syncing to %SSH_HOST%...
scp -r "%PROJECT_DIR%\*" %SSH_HOST%:%DEVBOX_PROJECT_PATH%/
if %errorlevel% neq 0 (
    echo [Error] Sync failed
    echo.
    echo Check:
    echo   1. SSH config is set up: ssh %SSH_HOST%
    echo   2. Network connection
    echo.
    pause
    exit /b 1
)

echo [4/4] Sync complete
echo.

REM Copy .env file to devbox (separate from code sync)
echo Copying .env file to devbox...
scp "%PROJECT_DIR%\.env" %SSH_HOST%:%DEVBOX_PROJECT_PATH%/
if %errorlevel% neq 0 (
    echo [Error] Copy .env file failed
    echo.
    pause
    exit /b 1
)
echo [OK] .env file copied

echo.

REM Set executable permission for entrypoint.sh
echo Setting executable permission for entrypoint.sh...
ssh %SSH_HOST% "chmod +x %DEVBOX_PROJECT_PATH%/entrypoint.sh"
if %errorlevel% neq 0 (
    echo [Warning] Failed to set executable permission
    echo.
)

echo.

REM Restart service using SSH config
echo Restarting %ENV_NAME% service...
ssh %SSH_HOST% "cd %DEVBOX_PROJECT_PATH% && npm install && npm run %ENV_CMD%"
if %errorlevel% neq 0 (
    echo [Error] Service start failed
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  %ENV_NAME% Deploy Success!
echo ============================================
echo.
echo Details:
echo   Env: %ENV_NAME%
echo   File: %ENV_FILE%
echo   Host: %SSH_HOST%
echo   Path: %DEVBOX_PROJECT_PATH%
echo.

pause
