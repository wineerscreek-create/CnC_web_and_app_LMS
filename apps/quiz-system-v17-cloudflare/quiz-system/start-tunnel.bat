@echo off
REM One-click local launcher WITH a public Cloudflare Tunnel (Windows).
REM Double-click this file, or run it from a terminal: start-tunnel.bat
REM
REM Same as start.bat (creates venv, installs deps on first run, starts
REM backend + frontend), PLUS: starts `cloudflared tunnel --url
REM http://localhost:5173` so students on a different network/WiFi can
REM reach the quiz. Tunneling just the frontend dev server works because
REM Vite already proxies /api and /socket.io to the backend (see
REM frontend/vite.config.js) -- one tunnel URL covers everything.
REM
REM This is a "quick tunnel": no Cloudflare account needed, but the URL is
REM random and changes every time you run this script. For a persistent
REM URL tied to your own domain, see README.md's "Named tunnel" section
REM instead (one-time `cloudflared tunnel create` setup, then reuse it).
REM
REM Same --workers 1 note as start.bat applies -- see that file's comments.

setlocal enabledelayedexpansion
title Secure Online Quiz System - Launcher + Cloudflare Tunnel
cd /d "%~dp0"

echo ============================================================
echo   Secure Online Quiz System - launcher + Cloudflare Tunnel
echo ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: "python" was not found on PATH. Install Python 3.10+ from
    echo https://python.org ^(check "Add python.exe to PATH" during install^)
    echo and run this script again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: "npm" was not found on PATH. Install Node.js LTS from
    echo https://nodejs.org, then run this script again.
    pause
    exit /b 1
)

where cloudflared >nul 2>nul
if errorlevel 1 (
    echo ERROR: "cloudflared" was not found on PATH.
    echo Install it first, then run this script again:
    echo   winget install --id Cloudflare.cloudflared
    echo   ^(or download the .exe from
    echo    https://github.com/cloudflare/cloudflared/releases and put it
    echo    somewhere on your PATH^)
    pause
    exit /b 1
)

if not exist "backend\.venv\Scripts\python.exe" (
    echo [1/6] Creating backend virtual environment ^(first run only^)...
    python -m venv backend\.venv
    if errorlevel 1 (
        echo Failed to create the virtual environment. See the error above.
        pause
        exit /b 1
    )
) else (
    echo [1/6] Backend virtual environment already exists, skipping.
)

echo [2/6] Installing/checking backend dependencies...
echo   ^(first run can take a few minutes depending on your internet speed --
echo    pandas/cryptography are large. Progress will print below; it is NOT
echo    frozen just because nothing new appears for a bit.^)
backend\.venv\Scripts\python.exe -m pip install --upgrade --disable-pip-version-check pip setuptools wheel
backend\.venv\Scripts\python.exe -m pip install --disable-pip-version-check -r backend\requirements.txt
if errorlevel 1 (
    echo.
    echo Backend dependency install failed. See the error above.
    echo If it mentions "vswhere.exe" or "Microsoft Visual C++ Build Tools" or
    echo "Building wheel for pandas/cryptography/...": that means pip couldn't
    echo find a precompiled wheel for your Python version and tried to compile
    echo one from source. You do NOT need to install Visual Studio for this --
    echo run "python --version" -- Python 3.11 or 3.12 are the safest bets if
    echo a very new Python ^(3.13+^) is still hitting this after the pip/wheel
    echo upgrade above.
    pause
    exit /b 1
)

if not exist "backend\.env" (
    echo Creating backend\.env from backend\.env.example...
    echo   ^(Edit backend\.env before real use -- set a strong
    echo    SUPER_ADMIN_PASSWORD and JWT_SECRET_KEY at minimum.^)
    copy /y "backend\.env.example" "backend\.env" >nul
)

REM GOTO instead of nested if/else -- see start.bat's comment on this same
REM pattern: deeply nested parenthesized blocks are a good way to make
REM cmd.exe's parser silently die mid-block (window just closes, no error).
if exist "frontend\node_modules" goto :npm_skip
echo [3/6] Installing frontend dependencies ^(npm install, first run only^)...
pushd frontend
call npm install
set "NPM_ERR=%errorlevel%"
popd
if not "%NPM_ERR%"=="0" (
    echo npm install failed. See the error above.
    pause
    exit /b 1
)
goto :npm_done
:npm_skip
echo [3/6] Frontend dependencies already installed, skipping npm install.
:npm_done

if not exist "frontend\.env" (
    if exist "frontend\.env.example" (
        copy /y "frontend\.env.example" "frontend\.env" >nul
    )
)

REM /D sets the new window's starting directory directly -- see start.bat's
REM comment on this same change (avoids a fragile nested-quotes pattern).
echo [4/6] Starting backend on http://localhost:8000 ...
start "Quiz System - Backend" /D "%~dp0backend" cmd /k .venv\Scripts\python.exe -m uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --workers 1

timeout /t 5 /nobreak >nul

echo [5/6] Starting frontend on http://localhost:5173 ...
start "Quiz System - Frontend" /D "%~dp0frontend" cmd /k npm run dev

timeout /t 4 /nobreak >nul

echo [6/6] Starting Cloudflare Tunnel...
set "TUNNEL_LOG=%TEMP%\quiz_cf_tunnel.log"
if exist "%TUNNEL_LOG%" del /f /q "%TUNNEL_LOG%" >nul 2>nul
start "Quiz System - Cloudflare Tunnel" /min cmd /c "cloudflared tunnel --url http://localhost:5173 > "%TUNNEL_LOG%" 2>&1"

echo.
echo Waiting for Cloudflare to hand out a public URL ^(usually 5-15s^)...
echo.

REM cloudflared's own window has the full live log if you want to watch it
REM directly; this just extracts the URL and prints/copies it here too.
powershell -NoProfile -Command "$log='%TUNNEL_LOG%'; $u=$null; for($i=0;$i -lt 30 -and -not $u;$i++){ if(Test-Path $log){ $m = Select-String -Path $log -Pattern 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1 }; if($m){ $u=$m.Matches[0].Value } else { Start-Sleep -Seconds 1 } }; if($u){ Write-Host ''; Write-Host '============================================================'; Write-Host ('PUBLIC URL:  ' + $u); Write-Host '============================================================'; Write-Host 'Share this link (or the QR from the admin Share dialog) with students.'; Write-Host 'Paste it into the quiz''s "Public Base URL" field in the Share dialog'; Write-Host 'so generated QR codes/links use it instead of localhost.'; Set-Clipboard -Value $u; Write-Host '(also copied to your clipboard)' } else { Write-Host 'Could not auto-detect the URL after 30s -- check the'; Write-Host '"Quiz System - Cloudflare Tunnel" window (or %TUNNEL_LOG%) directly.' }"

echo.
echo ============================================================
echo Three windows are now running:
echo   Backend            -^> http://localhost:8000
echo   Frontend           -^> http://localhost:5173
echo   Cloudflare Tunnel  -^> minimized, log at %TUNNEL_LOG%
echo.
echo Open the admin panel through the PUBLIC URL above (not localhost) if
echo you want every QR/link the Share dialog generates to match it
echo automatically -- otherwise paste the URL into "Public Base URL" once.
echo.
echo A quick tunnel's URL changes every time you re-run this script. Close
echo all three windows (or Ctrl+C inside them) to stop everything.
echo ============================================================
pause
