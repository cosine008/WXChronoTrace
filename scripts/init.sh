#!/usr/bin/env bash
# ============================================================
# ChronoTrace · init.sh
# 首次部署初始化(Linux / macOS)
# ============================================================
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "============================================================"
echo " ChronoTrace · 首次部署初始化"
echo "============================================================"
echo ""

# ─── Step 1: 检测工具链 ────────────────────────────────────
echo -e "${YELLOW}[1/7]${NC} Checking toolchain..."

check_cmd() {
    if ! command -v "$1" &>/dev/null; then
        echo -e "${RED}[ERROR]${NC} $1 not found in PATH. $2"
        exit 1
    fi
}
check_cmd python3 "Install from https://www.python.org/"
check_cmd node    "Install from https://nodejs.org/"
check_cmd pnpm    "Install via: npm i -g pnpm"
check_cmd psql    "Install PostgreSQL client."

PY=python3
echo "      OK: Python, Node, pnpm, psql found."
echo ""

# ─── Step 2: 创建数据库 ────────────────────────────────────
echo -e "${YELLOW}[2/7]${NC} Creating database and user..."
read -rsp "Enter postgres superuser password (blank to skip): " PG_PASS
echo ""

if [[ -n "$PG_PASS" ]]; then
    export PGPASSWORD="$PG_PASS"

    USER_EXISTS=$(psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='chronotrace';" 2>/dev/null || echo "")
    if [[ "$USER_EXISTS" != "1" ]]; then
        psql -U postgres -h localhost -c "CREATE USER chronotrace WITH PASSWORD 'chronotrace_dev' CREATEDB;"
        echo "      Created user 'chronotrace'."
    else
        echo "      User 'chronotrace' already exists, skipping."
    fi

    DB_EXISTS=$(psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='chronotrace_dev';" 2>/dev/null || echo "")
    if [[ "$DB_EXISTS" != "1" ]]; then
        psql -U postgres -h localhost -c "CREATE DATABASE chronotrace_dev OWNER chronotrace ENCODING 'UTF8' TEMPLATE template0;"
        echo "      Created database 'chronotrace_dev'."
    else
        echo "      Database 'chronotrace_dev' already exists, skipping."
    fi

    unset PGPASSWORD
    echo -e "      ${GREEN}OK:${NC} Database ready."
else
    echo "      Skipped."
fi
echo ""

# ─── Step 3: Python venv + 依赖 ────────────────────────────
echo -e "${YELLOW}[3/7]${NC} Setting up Python venv..."
if [[ ! -d backend/.venv ]]; then
    (cd backend && $PY -m venv .venv)
    echo "      Created: backend/.venv"
fi
backend/.venv/bin/python -m pip install --upgrade pip --quiet
backend/.venv/bin/python -m pip install -r backend/requirements.txt --quiet
echo -e "      ${GREEN}OK:${NC} Backend deps installed."
echo ""

# ─── Step 4: .env ───────────────────────────────────────────
echo -e "${YELLOW}[4/7]${NC} Generating backend/.env..."
if [[ ! -f backend/.env ]]; then
    cp backend/.env.example backend/.env
    echo "      Copied from .env.example. Edit for production."
else
    echo "      backend/.env already exists, skipping."
fi
echo ""

# ─── Step 5: Migrate ────────────────────────────────────────
echo -e "${YELLOW}[5/7]${NC} Running Django migrate..."
(cd backend && .venv/bin/python manage.py migrate)
echo -e "      ${GREEN}OK:${NC} Database migrated."
echo ""

# ─── Step 6: Superuser ──────────────────────────────────────
echo -e "${YELLOW}[6/7]${NC} Ensuring admin superuser..."
(cd backend && .venv/bin/python manage.py shell <<'PY'
from django.contrib.auth.models import User
from apps.accounts.models import UserProfile
u = User.objects.filter(username='admin').first()
if not u:
    u = User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
UserProfile.objects.get_or_create(user=u, defaults={'display_name': '系统管理员'})
print('admin / admin123 ready')
PY
)
echo ""

# ─── Step 7: 前端依赖 ───────────────────────────────────────
echo -e "${YELLOW}[7/7]${NC} Installing frontend deps..."
(cd frontend && pnpm install)
echo -e "      ${GREEN}OK:${NC} Frontend deps installed."
echo ""

echo "============================================================"
echo -e " ${GREEN}ChronoTrace initialization complete!${NC}"
echo "============================================================"
echo ""
echo "  Next step:      bash scripts/dev.sh"
echo "  Default admin:  admin / admin123"
echo "  Change before production."
echo ""
