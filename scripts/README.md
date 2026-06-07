# scripts/

ChronoTrace 的开发与运维脚本。

## 文件

| 脚本         | 平台          | 用途                        |
| ---------- | ----------- | ------------------------- |
| `init.bat` | Windows     | 首次部署初始化(装依赖、建数据库、迁移、建管理员) |
| `init.sh`  | Linux/macOS | 同上                        |
| `dev.bat`  | Windows     | 日常启动:新窗口分别跑前后端            |
| `dev.sh`   | Linux/macOS | 同上;优先用 tmux,无则后台进程 + trap |

## 首次使用

**Windows**:

```bat
scripts\init.bat
scripts\dev.bat
```

**Linux/macOS**:

```bash
bash scripts/init.sh
bash scripts/dev.sh
```

## init 脚本做了什么

1. 检测 Python / Node / pnpm / PostgreSQL 是否可用
2. 提示输入 postgres 超级用户密码,创建开发库与用户
   - 数据库: `chronotrace_dev`
   - 用户: `chronotrace` / 密码 `chronotrace_dev`
3. 创建 `backend/.venv` 并安装 `requirements.txt`
4. 从 `backend/.env.example` 生成 `backend/.env`(已存在则跳过)
5. 运行 Django migrate
6. 确保超级管理员存在: `admin / admin123`
7. `pnpm install` 装前端依赖

## dev 脚本做了什么

- **Windows (dev.bat)**:在两个新 cmd 窗口分别启动后端与前端;关闭窗口即停止
- **Linux/macOS (dev.sh)**:
  - 优先用 tmux 开一个 `chronotrace` session,两个 window
  - 没有 tmux 则用后台进程,Ctrl+C 清理

## 常见问题

### 数据库创建失败

确认 postgres 用户密码正确;若 psql 不在 PATH,init.bat 会尝试几个常见安装路径,如都失败,请手工创建:

```sql
CREATE USER chronotrace WITH PASSWORD 'chronotrace_dev' CREATEDB;
CREATE DATABASE chronotrace_dev OWNER chronotrace ENCODING 'UTF8' TEMPLATE template0;
```

### 端口被占用

- 后端默认 `8000`,前端默认 `5173`
- 改端口:
  - 后端:`python manage.py runserver <port>`
  - 前端:改 `frontend/vite.config.ts` 的 `server.port`,同时更新后端的 `CORS_ALLOWED_ORIGINS`

### pnpm 安装慢

可切换到国内镜像:

```bash
pnpm config set registry https://registry.npmmirror.com
```
