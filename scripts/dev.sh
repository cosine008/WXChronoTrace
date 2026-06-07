#!/usr/bin/env bash
# ============================================================
# ChronoTrace · dev.sh
# 一键启动开发环境(Linux / macOS)
# 优先用 tmux;没装则用后台进程 + trap 信号清理
# ============================================================
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

BACKEND_VENV="$ROOT/backend/.venv"
FRONTEND_MODULES="$ROOT/frontend/node_modules"
BACKEND_ENV="$ROOT/backend/.env"

# ─── 前置检查 ────────────────────────────────────────────
if [[ ! -f "$BACKEND_VENV/bin/python" ]] && [[ ! -f "$BACKEND_VENV/Scripts/python.exe" ]]; then
    echo "[ERROR] backend/.venv not found."
    echo "        Run scripts/init.sh first."
    exit 1
fi
if [[ ! -f "$BACKEND_ENV" ]]; then
    echo "[ERROR] backend/.env not found."
    echo "        cp backend/.env.example backend/.env  then edit it."
    exit 1
fi
if [[ ! -d "$FRONTEND_MODULES" ]]; then
    echo "[ERROR] frontend/node_modules not found."
    echo "        cd frontend && pnpm install"
    exit 1
fi

# ─── 找 Python(兼容 Windows Git-Bash 的 .venv 布局) ─────
if [[ -f "$BACKEND_VENV/bin/python" ]]; then
    PY="$BACKEND_VENV/bin/python"
else
    PY="$BACKEND_VENV/Scripts/python.exe"
fi

echo ""
echo "============================================================"
echo " ChronoTrace dev servers starting..."
echo "============================================================"
echo " Backend:  http://localhost:8000"
echo " Frontend: http://localhost:5173"
echo " Export worker: process_export_jobs --loop"
echo " Swagger:  http://localhost:8000/api/docs/"
echo " Admin:    http://localhost:8000/admin/"
echo "============================================================"
echo ""

# ─── 方式 A:tmux ───────────────────────────────────────
if command -v tmux &>/dev/null; then
    SESSION="chronotrace"
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    tmux new-session -d -s "$SESSION" -n backend \
        "cd '$ROOT/backend' && '$PY' manage.py runserver 8000"
    tmux new-window -t "$SESSION" -n export-worker \
        "cd '$ROOT/backend' && '$PY' manage.py process_export_jobs --loop --sleep=2 --limit=10 --cleanup-expired"
    tmux new-window -t "$SESSION" -n frontend \
        "cd '$ROOT/frontend' && pnpm dev"
    echo "Started in tmux session '$SESSION'."
    echo "Attach:   tmux attach -t $SESSION"
    echo "Stop:     tmux kill-session -t $SESSION"
    exit 0
fi

# ─── 方式 B:后台进程 + trap ─────────────────────────────
echo "(tmux not found, using background processes)"

cleanup() {
    echo ""
    echo "Stopping..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $EXPORT_WORKER_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait 2>/dev/null || true
    echo "Stopped."
}
trap cleanup INT TERM EXIT

(cd "$ROOT/backend" && "$PY" manage.py runserver 8000) &
BACKEND_PID=$!

(cd "$ROOT/backend" && "$PY" manage.py process_export_jobs --loop --sleep=2 --limit=10 --cleanup-expired) &
EXPORT_WORKER_PID=$!

sleep 2

(cd "$ROOT/frontend" && pnpm dev) &
FRONTEND_PID=$!

echo ""
echo "Backend, export worker, and frontend started. Press Ctrl+C to stop."
wait
