@echo off
REM ============================================================
REM ChronoTrace - init.bat
REM First-time setup on Windows.
REM
REM Steps:
REM   1. Check Python / Node / pnpm / PostgreSQL
REM   2. Prompt for postgres password, create dev DB and user
REM   3. Create Python venv + install backend deps
REM   4. Generate .env (if absent)
REM   5. Django migrate
REM   6. Ensure superuser admin / admin123
REM   7. pnpm install
REM ============================================================
setlocal enabledelayedexpansion

cd /d "%~dp0.."
set "ROOT=%CD%"

echo.
echo ============================================================
echo  ChronoTrace - First-time initialization
echo ============================================================
echo.

REM --- Step 1: toolchain ------------------------------------
echo [1/7] Checking toolchain...

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found in PATH.
    echo         Install: https://www.python.org/
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH.
    echo         Install: https://nodejs.org/
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm not found in PATH.
    echo         Install: npm i -g pnpm
    exit /b 1
)

REM Try common psql locations (not always in PATH)
set "PSQL="
if exist "D:\Program Files\PostgreSQL\18\bin\psql.exe" set "PSQL=D:\Program Files\PostgreSQL\18\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\18\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\17\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\16\bin\psql.exe"
where psql >nul 2>&1 && set "PSQL=psql"

if "!PSQL!"=="" (
    echo [ERROR] psql not found.
    echo         Install PostgreSQL: https://www.postgresql.org/download/windows/
    exit /b 1
)

echo       OK: Python, Node, pnpm, psql found.
echo.

REM --- Step 2: database --------------------------------------
echo [2/7] Creating database and user...
echo.
set /p "PG_PASS=Enter postgres superuser password (blank to skip): "
if not "!PG_PASS!"=="" (
    set "PGPASSWORD=!PG_PASS!"
    "!PSQL!" -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='chronotrace';" | findstr /c:"1" >nul
    if errorlevel 1 (
        echo       Creating user 'chronotrace'...
        "!PSQL!" -U postgres -h localhost -c "CREATE USER chronotrace WITH PASSWORD 'chronotrace_dev' CREATEDB;" || goto :db_fail
    ) else (
        echo       User 'chronotrace' already exists, skipping.
    )

    "!PSQL!" -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='chronotrace_dev';" | findstr /c:"1" >nul
    if errorlevel 1 (
        echo       Creating database 'chronotrace_dev'...
        "!PSQL!" -U postgres -h localhost -c "CREATE DATABASE chronotrace_dev OWNER chronotrace ENCODING 'UTF8' TEMPLATE template0;" || goto :db_fail
    ) else (
        echo       Database 'chronotrace_dev' already exists, skipping.
    )
    set "PGPASSWORD="
    echo       OK: Database ready.
) else (
    echo       Skipped database creation.
)
echo.

REM --- Step 3: Python venv + deps ---------------------------
echo [3/7] Setting up Python venv...
if not exist "backend\.venv\Scripts\python.exe" (
    pushd backend
    python -m venv .venv || goto :py_fail
    popd
    echo       Created: backend\.venv
)
backend\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt || goto :py_fail
echo       OK: Backend deps installed.
echo.

REM --- Step 4: .env -----------------------------------------
echo [4/7] Generating backend\.env...
if not exist "backend\.env" (
    copy backend\.env.example backend\.env >nul
    echo       Copied from .env.example. Edit it for production.
) else (
    echo       backend\.env already exists, skipping.
)
echo.

REM --- Step 5: Migrate --------------------------------------
echo [5/7] Running Django migrate...
pushd backend
.venv\Scripts\python.exe manage.py migrate || goto :mig_fail
popd
echo       OK: Database migrated.
echo.

REM --- Step 6: Superuser ------------------------------------
echo [6/7] Ensuring admin superuser...
pushd backend
.venv\Scripts\python.exe manage.py shell -c "from django.contrib.auth.models import User; from apps.accounts.models import UserProfile; u = User.objects.filter(username='admin').first() or User.objects.create_superuser('admin', 'admin@example.com', 'admin123'); UserProfile.objects.get_or_create(user=u, defaults={'display_name': 'Admin'}); print('admin / admin123 ready')"
popd
echo.

REM --- Step 7: Frontend -------------------------------------
echo [7/7] Installing frontend deps...
pushd frontend
call pnpm install || goto :fe_fail
popd
echo       OK: Frontend deps installed.
echo.

echo ============================================================
echo  ChronoTrace initialization complete!
echo ============================================================
echo.
echo  Next step: run  scripts\dev.bat  to start dev servers.
echo.
echo  Default admin:  admin / admin123
echo  Change it before production.
echo.
endlocal
exit /b 0

:db_fail
echo [ERROR] Database setup failed. Check postgres credentials.
set "PGPASSWORD="
exit /b 1

:py_fail
echo [ERROR] Python dependency install failed.
exit /b 1

:mig_fail
echo [ERROR] Django migrate failed.
exit /b 1

:fe_fail
echo [ERROR] Frontend install failed.
exit /b 1
