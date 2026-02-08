@echo off
:: Launch Dev Harness with Python Server
:: Starts the Python build server in the background, then opens the dev harness in Chrome.

echo ============================================
echo  Heart of Magic - Dev Harness Launcher
echo ============================================

:: Find Python server script
set PYTHON_SERVER=%~dp0..\..\..\..\SKSE\Plugins\SpellLearning\SpellTreeBuilder\dev_server.py

if not exist "%PYTHON_SERVER%" (
    echo [WARN] Python server not found at: %PYTHON_SERVER%
    echo [WARN] Dev harness will use JS fallback.
    goto :open_browser
)

:: Kill any existing dev server on port 5556
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :5556 ^| findstr LISTENING 2^>nul') do (
    echo Stopping existing server (PID %%p)...
    taskkill /PID %%p /F >nul 2>&1
)

:: Start Python server in background
echo Starting Python dev server on port 5556...
start /B "PythonDevServer" python "%PYTHON_SERVER%" >nul 2>&1

:: Give it a moment to start
timeout /t 1 /nobreak >nul

:: Verify it started
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5556/build' -Method OPTIONS -TimeoutSec 2; Write-Host '[OK] Python server is running' } catch { Write-Host '[WARN] Python server may not have started - JS fallback will be used' }"

:open_browser
echo Opening dev harness in Chrome...
start "" "%~dp0dev-harness.html"

echo.
echo Dev harness launched. Close this window when done.
echo Python server will stop automatically.
pause
