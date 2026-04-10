@echo off
setlocal enabledelayedexpansion

REM
REM Claude Code Best (CCB) - Windows Installation Script
REM
REM Usage: install.bat [OPTION]
REM

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PROJECT_NAME=claude-code-best"
set "EXECUTABLE_NAME=ccb"

set "INSTALL_DIR=%USERPROFILE%\.cc"
if not "%CCB_INSTALL_DIR%"=="" (
    set "INSTALL_DIR=%CCB_INSTALL_DIR%"
)

set "INSTALL_MODE=release"
set "LOCAL_INSTALL=1"
set "UNINSTALL_ONLY=0"

REM Parse arguments
:parse_loop
if "%~1"=="" goto parse_done
if /i "%~1"=="--dev" (
    set "INSTALL_MODE=dev"
    shift
    goto parse_loop
)
if /i "%~1"=="--local" (
    set "LOCAL_INSTALL=1"
    shift
    goto parse_loop
)
if /i "%~1"=="--uninstall" (
    set "UNINSTALL_ONLY=1"
    shift
    goto parse_loop
)
if /i "%~1"=="--help" goto show_help
if /i "%~1"=="-h" goto show_help
call :log_error "Unknown option: %~1"
goto show_help

:parse_done

echo.
echo ================================
echo   %PROJECT_NAME% Installation
echo ================================
echo.

REM Check prerequisites
call :check_prerequisites
if errorlevel 1 exit /b 1

if "%UNINSTALL_ONLY%"=="1" goto uninstall_section

REM Local installation
call :install_local
if errorlevel 1 exit /b 1

goto finish

:check_prerequisites
echo [STEP] Checking prerequisites...

where git >nul 2>&1
if errorlevel 1 (
    call :log_error "git not found. Install from https://git-scm.com/"
    exit /b 1
)

where bun >nul 2>&1
if errorlevel 1 (
    echo [WARN] Bun not found. Installing Bun via PowerShell...
    powershell -Command "irm bun.sh/install.ps1 | iex"
)
for /f "delims=" %%i in ('bun --version 2^>nul') do set "BUN_VER=%%i"
echo [INFO] Bun: %BUN_VER%
echo [INFO] Prerequisites OK.
exit /b 0

:install_local
echo [STEP] Installing from %SCRIPT_DIR%

pushd "%SCRIPT_DIR%"

if not exist "package.json" (
    call :log_error "package.json not found. Not a valid project directory."
    popd
    exit /b 1
)

echo [INFO] Installing dependencies...
bun install
if errorlevel 1 (
    call :log_error "Failed to install dependencies."
    popd
    exit /b 1
)

if "%INSTALL_MODE%"=="release" (
    echo [INFO] Building project...
    bun run build
    if errorlevel 1 (
        call :log_error "Failed to build."
        popd
        exit /b 1
    )
)

popd

REM Create installation
call :create_wrapper
call :add_to_path
exit /b 0

:create_wrapper
echo [STEP] Creating wrapper script...

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
set "BIN_DIR=%INSTALL_DIR%\bin"
if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

set "WRAP_BAT=%BIN_DIR%\%EXECUTABLE_NAME%.bat"

(
    echo @echo off
    echo pushd "%SCRIPT_DIR%"
    echo if exist "%SCRIPT_DIR%\dist\cli.js" ^(
    echo     bun run "%SCRIPT_DIR%\dist\cli.js" %%*
    echo ^) else ^(
    echo     bun run "%SCRIPT_DIR%\scripts\dev.ts" %%*
    echo ^)
    echo popd
) > "%WRAP_BAT%"

echo [INFO] Created: %WRAP_BAT%
exit /b 0

:add_to_path
echo [STEP] Adding to PATH...

REM Check if already in PATH
echo %PATH% | find "%BIN_DIR%" >nul
if not errorlevel 1 (
    echo [INFO] Already in PATH.
    exit /b 0
)

REM Add using setx
setx PATH "%BIN_DIR%;%PATH%" >nul 2>&1
echo [INFO] Added to PATH. Restart terminal to apply.
exit /b 0

:uninstall_section
echo [STEP] Uninstalling...

set "BIN_DIR=%INSTALL_DIR%\bin"
set "WRAP_BAT=%BIN_DIR%\%EXECUTABLE_NAME%.bat"

if exist "%WRAP_BAT%" del "%WRAP_BAT%"

dir "%BIN_DIR%" 2>nul | find "." >nul
if errorlevel 1 rmdir "%BIN_DIR%" 2>nul

echo [INFO] Uninstall complete.
goto finish

:show_help
echo.
echo Usage: install.bat [OPTION]
echo.
echo Options:
echo   --dev              Development mode (no build)
echo   --local            Install from current directory (default)
echo   --uninstall        Uninstall wrapper script
echo   --help, -h         Show this help
echo.
echo Environment:
echo   CCB_INSTALL_DIR    Install directory (default: %%USERPROFILE%%\.cc)
echo.
exit /b 0

:log_error
echo [ERROR] %~1
exit /b 0

:finish
echo.
echo ================================
echo   Installation Complete!
echo ================================
echo.
echo Wrapper: %BIN_DIR%\%EXECUTABLE_NAME%.bat
echo.
echo To run immediately: %BIN_DIR%\%EXECUTABLE_NAME%.bat
echo After restart: %EXECUTABLE_NAME%
echo.

endlocal
