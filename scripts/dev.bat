@echo off
REM ============================================================
REM ChronoTrace - dev.bat
REM One-click start dev environment.
REM Opens new cmd windows for backend, export worker, and frontend.
REM ============================================================
setlocal

REM Switch to repo root (parent of this script)
cd /d "%~dp0.."

REM --- Backend checks ----------------------------------------
if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] backend\.venv not found.
    echo         Run scripts\init.bat first to initialize.
    exit /b 1
)
if not exist "backend\.env" (
    echo [ERROR] backend\.env not found.
    echo         Run scripts\init.bat, or copy backend\.env.example to backend\.env
    exit /b 1
)

REM --- Frontend checks ---------------------------------------
if not exist "frontend\node_modules" (
    echo [ERROR] frontend\node_modules not found.
    echo         Run scripts\init.bat, or: cd frontend ^&^& pnpm install
    exit /b 1
)

echo.
echo ============================================================
echo  ChronoTrace dev servers starting...
echo ============================================================
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo  Export worker: process_export_jobs --loop
echo  Swagger:  http://localhost:8000/api/docs/
echo  Admin:    http://localhost:8000/admin/
echo ============================================================
echo.

REM --- Start backend in new window ---------------------------
start "ChronoTrace - Backend" cmd /k "cd /d %~dp0..\backend && .venv\Scripts\activate.bat && python manage.py runserver 8000"

REM --- Start export worker in new window ---------------------
start "ChronoTrace - Export Worker" cmd /k "cd /d %~dp0..\backend && .venv\Scripts\activate.bat && python manage.py process_export_jobs --loop --sleep=2 --limit=10 --cleanup-expired"

REM Small delay so backend is up before frontend tries to proxy
timeout /t 2 /nobreak >nul

REM --- Start frontend in new window --------------------------
start "ChronoTrace - Frontend" cmd /k "cd /d %~dp0..\frontend && pnpm dev"

echo.
echo Started in three new windows. Close those windows to stop.
echo.
endlocal
