@echo off
setlocal
cd /d "%~dp0"

:: Check if server is already running on port 5050
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5050/api/health' -TimeoutSec 1 -UseBasicParsing; exit 0 } catch { exit 1 }"
if %ERRORLEVEL% NEQ 0 (
    echo Starting AgentChat Server...
    start "" /b python server.py
    timeout /t 1 /nobreak >nul
)

set "APP_EXE="
set "PROFILE_DIR="

:: 1. Primary: Google Chrome (Best App Mode isolation without Edge hijacking)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "APP_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
    set "PROFILE_DIR=%LOCALAPPDATA%\AgentChat\ChromeProfile"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "APP_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    set "PROFILE_DIR=%LOCALAPPDATA%\AgentChat\ChromeProfile"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "APP_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
    set "PROFILE_DIR=%LOCALAPPDATA%\AgentChat\ChromeProfile"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "APP_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    set "PROFILE_DIR=%LOCALAPPDATA%\AgentChat\EdgeProfile"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "APP_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    set "PROFILE_DIR=%LOCALAPPDATA%\AgentChat\EdgeProfile"
)

if defined APP_EXE (
    start "" "%APP_EXE%" --app=http://127.0.0.1:5050 --user-data-dir="%PROFILE_DIR%" --window-size=1280,850
) else (
    start http://127.0.0.1:5050
)

exit
