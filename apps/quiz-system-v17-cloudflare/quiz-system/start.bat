@echo off
REM One-click local launcher for the Secure Online Quiz System (Windows).
REM Double-click this file, or run it from a terminal: start.bat
REM
REM What it does, in order:
REM   1. Creates backend\.venv if it doesn't exist yet (first run only).
REM   2. Installs/updates backend Python dependencies into that venv.
REM   3. Copies backend\.env.example -> backend\.env if missing (edit the
REM      copy before a real deployment -- see its comments, especially
REM      SUPER_ADMIN_PASSWORD and ENCRYPTION_KEY).
REM   4. Installs frontend npm dependencies if node_modules is missing.
REM   5. Starts the backend (FastAPI + Socket.IO, uvicorn) in its own window
REM      and the frontend (Vite dev server) in another.
REM
REM Backend is started with --workers 1 on purpose: this app's entire store
REM is one in-memory Python dict (see backend/app/memory/store.py), so more
REM worker processes would each get their own empty copy of it, not more
REM capacity. For a real multi-user deployment on a VPS, see config/ (Nginx
REM + systemd templates) and README.md's "Production hardening round"
REM section -- this script is for local dev / a quick demo on one machine.

setlocal enabledelayedexpansion
title Secure Online Quiz System - Launcher
cd /d "%~dp0"

echo ============================================================
echo   Secure Online Quiz System - one-click local launcher
echo ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: "python" was not found on PATH. Install Python 3.10+ from
    echo https://python.org and make sure "Add python.exe to PATH" is
    echo checked during install, then run this script again.
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

if not exist "backend\.venv\Scripts\python.exe" (
    echo [1/5] Creating backend virtual environment ^(first run only^)...
    python -m venv backend\.venv
    if errorlevel 1 (
        echo Failed to create the virtual environment. See the error above.
        pause
        exit /b 1
    )
) else (
    echo [1/5] Backend virtual environment already exists, skipping.
)

echo [2/5] Installing/checking backend dependencies...
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
    echo either an older cached pip needs the upgrade above to run first ^(now
    echo included^), or your Python version is newer than these packages have
    echo wheels for yet. Run "python --version" -- Python 3.11 or 3.12 are the
    echo safest bets if a very new Python ^(3.13+^) is still hitting this.
    pause
    exit /b 1
)

if not exist "backend\.env" (
    echo Creating backend\.env from backend\.env.example...
    echo   ^(Edit backend\.env before deploying for real -- set a strong
    echo    SUPER_ADMIN_PASSWORD and JWT_SECRET_KEY at minimum.^)
    copy /y "backend\.env.example" "backend\.env" >nul
)

REM Written with GOTO instead of a nested if/else block on purpose -- deeply
REM nested parenthesized blocks (if-inside-if, especially with an inline
REM if/else and comments mixed in) are a well-known way to make cmd.exe's
REM parser miscount parens and silently die mid-block with no visible error,
REM which looks exactly like "the window just closes for no reason." GOTO
REM avoids the nesting entirely.
if exist "frontend\node_modules" goto :npm_skip
echo [3/5] Installing frontend dependencies ^(npm install, first run only^)...
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
echo [3/5] Frontend dependencies already installed, skipping npm install.
:npm_done

if not exist "frontend\.env" (
    if exist "frontend\.env.example" (
        echo Creating frontend\.env from frontend\.env.example...
        copy /y "frontend\.env.example" "frontend\.env" >nul
    )
)

REM /D sets the new window's starting directory directly, instead of the
REM more fragile `cmd /k "cd /d "..." && ..."` nested-quotes pattern (a
REM second source of "silently misbehaves depending on your folder path"
REM bugs, same family as the GOTO fix above).
echo [4/5] Starting backend on http://localhost:8000 ...
start "Quiz System - Backend" /D "%~dp0backend" cmd /k .venv\Scripts\python.exe -m uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --workers 1

echo Waiting for the backend to finish booting...
timeout /t 5 /nobreak >nul

echo [5/5] Starting frontend on http://localhost:5173 ...
start "Quiz System - Frontend" /D "%~dp0frontend" cmd /k npm run dev

echo.
echo ============================================================
echo Both servers are starting in their own windows:
echo   Backend  -^> http://localhost:8000   (health check: /api/health)
echo   Frontend -^> http://localhost:5173   (open this in your browser)
echo.
echo Close those two windows (or press Ctrl+C inside them) to stop
echo the app. This window can be closed now.
echo.
echo For students on OTHER devices/networks (not this WiFi), see the
echo Cloudflare Tunnel section in README.md. For a real always-on
echo deployment, see config\ (Nginx + systemd templates).
echo ============================================================
pause
