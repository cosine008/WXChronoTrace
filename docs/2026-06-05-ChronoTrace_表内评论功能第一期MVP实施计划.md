# ChronoTrace 表内评论功能第一期 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ChronoTrace 当前视图中交付行级与单元格评论的最小闭环：创建线程、回复、@协作者、未读、`open / resolved`、当前页 summary、右侧详情面板、基础权限与审计。

**Architecture:** 新增独立 Django app `backend/apps/comments/`，评论数据通过稳定锚点引用 `DataSchema / Entity / field_key`，并保存创建时上下文快照。前端新增 `frontend/src/api/comments.ts` 与 `frontend/src/features/comments/`，当前视图只显示评论信号，完整线程放入右侧 drawer。

**Tech Stack:** Django + Django REST Framework + PostgreSQL + pytest；React + TypeScript + TanStack Query + TanStack Table + lucide-react + Vite。

---

## 0. 执行边界

- 本计划只实现第一期 MVP，不实现 ChangeSet Entry 评论、通知中心、评论搜索、Workbench 沉淀、WebSocket、附件、富文本、导出、AI 摘要。
- 本计划不新增独立数据库实例，只在现有 `default` PostgreSQL 数据库中新增 comments 相关表。
- 评论不写入 `TemporalRecord.data_payload`，不参与导入导出、字段校验、统计口径和 ChangeSet diff。
- 第一期开启的锚点只有：
  - `row`: `schema + entity`
  - `cell`: `schema + entity + field_key`
- 模型层可预留 `schema` 与 `changeset_entry` anchor，但 API 第一期不开放入口。
- 安全策略采用保守方案：用户必须能查看对应表；单元格评论要求该字段对当前用户可见且未被脱敏，否则不返回正文和值快照，也不允许创建 cell 评论。
- viewer 可以创建和回复自己可见范围内的评论；线程创建者、表 owner、editor、admin 可以 resolve/reopen；普通 viewer 不能关闭别人创建的线程。

## 1. 现有代码入口

- 后端配置入口：`backend/chronotrace/settings.py`
- 后端根路由：`backend/chronotrace/urls.py`
- 当前视图 API：`backend/apps/temporal/api.py`
- 当前视图路由：`backend/apps/schemas/views.py`
- 时态模型：`backend/apps/temporal/models.py`
- 表模型与协作者：`backend/apps/schemas/models.py`
- 权限函数：`backend/apps/schemas/permissions.py`
- 字段脱敏：`backend/apps/schemas/field_security.py`
- 审计服务：`backend/apps/audit/services.py`
- 前端 current-view 页面：`frontend/src/features/current-view/CurrentViewPage.tsx`
- 前端表格：`frontend/src/features/current-view/CurrentGrid.tsx`
- 前端单元格：`frontend/src/features/current-view/CurrentGridCell.tsx`
- 前端业务 API 类型：`frontend/src/api/schemas.ts`
- 前端通用 API client：`frontend/src/lib/api.ts`

## 2. 计划创建和修改的文件

### 2.1 后端新增文件

- Create: `backend/apps/comments/__init__.py`
- Create: `backend/apps/comments/apps.py`
- Create: `backend/apps/comments/models.py`
- Create: `backend/apps/comments/admin.py`
- Create: `backend/apps/comments/permissions.py`
- Create: `backend/apps/comments/selectors.py`
- Create: `backend/apps/comments/services.py`
- Create: `backend/apps/comments/serializers.py`
- Create: `backend/apps/comments/api.py`
- Create: `backend/apps/comments/urls.py`
- Create: `backend/apps/comments/migrations/__init__.py`
- Create: `backend/apps/comments/migrations/0001_initial.py`
- Create: `backend/tests/test_comments_models.py`
- Create: `backend/tests/test_comments_api.py`
- Create: `backend/tests/test_comments_summary_api.py`

### 2.2 后端修改文件

- Modify: `backend/chronotrace/settings.py`
  - 在 `INSTALLED_APPS` 中加入 `"apps.comments"`。
- Modify: `backend/chronotrace/urls.py`
  - 在 `api/v1/` include 列表中加入 `path("", include("apps.comments.urls"))`。

### 2.3 前端新增文件

- Create: `frontend/src/api/comments.ts`
- Create: `frontend/src/features/comments/commentAnchors.ts`
- Create: `frontend/src/features/comments/CommentBadge.tsx`
- Create: `frontend/src/features/comments/CommentComposer.tsx`
- Create: `frontend/src/features/comments/CommentThreadList.tsx`
- Create: `frontend/src/features/comments/CommentThreadDrawer.tsx`

### 2.4 前端修改文件

- Modify: `frontend/src/features/current-view/CurrentViewPage.tsx`
  - 拉取当前页评论 summary。
  - 管理当前打开的评论 anchor。
  - 挂载 `CommentThreadDrawer`。
- Modify: `frontend/src/features/current-view/CurrentGrid.tsx`
  - 接收评论 summary。
  - 在行与单元格层传入评论入口。
- Modify: `frontend/src/features/current-view/CurrentGridCell.tsx`
  - 增加单元格评论 badge 按钮。

## 3. 数据契约

### 3.1 后端模型契约

`CommentThread` 字段：

```text
id
schema -> schemas.DataSchema
anchor_type: row | cell | schema | changeset_entry
entity -> temporal.Entity nullable
field_key string blank
change_entry -> changesets.ChangeEntry nullable
created_at_context_date date nullable
record_at_creation -> temporal.TemporalRecord nullable
record_valid_from_snapshot date nullable
record_valid_to_snapshot date nullable
value_snapshot json nullable
status: open | resolved
created_by -> AUTH_USER
created_at
updated_at
last_activity_at
resolved_by -> AUTH_USER nullable
resolved_at datetime nullable
comment_count positive integer
```

`Comment` 字段：

```text
id
thread -> CommentThread
body text
body_format: plain
created_by -> AUTH_USER
created_at
edited_at datetime nullable
deleted_at datetime nullable
is_system boolean
```

`CommentMention` 字段：

```text
id
comment -> Comment
user -> AUTH_USER
created_at
unique(comment, user)
```

`CommentReadState` 字段：

```text
id
thread -> CommentThread
user -> AUTH_USER
last_read_at datetime
unique(thread, user)
```

### 3.2 API 契约

第一期后端开放：

```text
GET    /api/v1/comments/threads/?schema_id=&anchor_type=&entity_id=&field_key=
POST   /api/v1/comments/threads/
POST   /api/v1/comments/threads/{thread_id}/comments/
PATCH  /api/v1/comments/threads/{thread_id}/resolve/
PATCH  /api/v1/comments/threads/{thread_id}/reopen/
POST   /api/v1/comments/threads/{thread_id}/read/
GET    /api/v1/comments/summary/?schema_id=&entity_ids=1,2,3
```

`POST /comments/threads/` 请求：

```json
{
  "schema_id": 1,
  "anchor_type": "cell",
  "entity_id": 10,
  "field_key": "amount",
  "context_date": "2026-06-05",
  "record_id": 99,
  "body": "请财务确认这个金额。",
  "mention_user_ids": [2, 3]
}
```

`GET /comments/summary/` 响应：

```json
{
  "schema_id": 1,
  "entities": {
    "10": {
      "row": { "open_count": 1, "total_count": 2, "unread_count": 1 },
      "cells": {
        "amount": { "open_count": 2, "total_count": 2, "unread_count": 0 }
      }
    }
  }
}
```

## 4. 后端任务

### Task 1: 建立 comments app 与迁移入口

**Files:**
- Create: `backend/apps/comments/__init__.py`
- Create: `backend/apps/comments/apps.py`
- Create: `backend/apps/comments/migrations/__init__.py`
- Modify: `backend/chronotrace/settings.py`
- Modify: `backend/chronotrace/urls.py`

> 并行判断：Task 1 涉及 `INSTALLED_APPS` 与根 `api/v1/` include 入口，属于 shared entry 写入面；本任务不并行写入，由主会话串行完成。

- [x] **Step 1: 创建 app 配置**

在 `backend/apps/comments/apps.py` 写入：

```python
from django.apps import AppConfig


class CommentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.comments"
```

- [x] **Step 2: 注册 app**

在 `backend/chronotrace/settings.py` 的 local apps 中加入：

```python
"apps.comments",
```

建议放在 `"apps.workbench"` 之后、`"apps.schemas"` 之前，方便表达协作模块位于业务表和工作台之间。

- [x] **Step 3: 准备路由 include**

在 `backend/chronotrace/urls.py` 的 `api/v1/` include 列表中加入：

```python
path("", include("apps.comments.urls")),
```

建议放在 workbench 和 schemas 附近。

- [x] **Step 4: 创建空路由文件**

在 `backend/apps/comments/urls.py` 写入临时结构，后续 Task 6 补路由：

```python
from django.urls import path

urlpatterns = []
```

- [x] **Step 5: 运行 app 加载验证**

Run:

```powershell
cd backend
python manage.py check
```

Expected:

```text
System check identified no issues
```

### Task 2: 编写模型测试

**Files:**
- Create: `backend/tests/test_comments_models.py`
- Create: `backend/apps/comments/models.py`

> 并行判断：Task 2 与 Task 3 均围绕 `backend/apps/comments/models.py` 与模型契约推进，存在同文件顺序依赖；本任务不并行写入。红灯验证已运行 `pytest tests/test_comments_models.py -q`，失败在 `apps.comments.models` 缺少 `Comment / CommentThread` 等模型类，符合“模型未实现”的预期失败。

- [x] **Step 1: 写 anchor 校验失败测试**

测试目标：

- `row` 必须有 `entity`，不能有 `field_key`。
- `cell` 必须有 `entity + field_key`。
- `schema` 不能有 `entity / field_key / change_entry`。
- `changeset_entry` 必须有 `change_entry`。

测试文件使用现有 fixture 风格，创建 `DataSchema / Entity / ChangeSet / ChangeEntry`，调用 `full_clean()` 断言 `DjangoValidationError`。

- [x] **Step 2: 写 comment_count 与 read state 约束测试**

测试目标：

- `CommentReadState(thread, user)` 唯一。
- `CommentMention(comment, user)` 唯一。
- `Comment.body` 不能为空白文本。
- 新线程默认 `status = open`。

- [x] **Step 3: 运行失败验证**

Run:

```powershell
cd backend
pytest tests/test_comments_models.py -q
```

Expected:

```text
ImportError or FAILED because apps.comments.models is incomplete
```

### Task 3: 实现 comments 模型与初始迁移

**Files:**
- Modify: `backend/apps/comments/models.py`
- Create: `backend/apps/comments/migrations/0001_initial.py`
- Create: `backend/apps/comments/admin.py`

> 执行记录：已生成 `backend/apps/comments/migrations/0001_initial.py`；已运行 `pytest tests/test_comments_models.py -q`，结果 `9 passed`。

- [x] **Step 1: 实现 `CommentThread`**

模型要求：

- 使用 `models.TextChoices` 定义 `AnchorType` 和 `Status`。
- `field_key` 使用 `models.CharField(max_length=64, blank=True, db_index=True)`。
- `value_snapshot` 使用 `models.JSONField(null=True, blank=True)`。
- `last_activity_at` 创建时默认 `timezone.now`。
- `comment_count` 默认 `0`。
- `schema/entity/change_entry/created_by` 使用 `on_delete=models.PROTECT`。
- `record_at_creation/resolved_by` 使用 `on_delete=models.SET_NULL`。

- [x] **Step 2: 实现 `clean()` anchor 校验**

校验规则：

```text
schema:
  entity is None
  field_key == ""
  change_entry is None

row:
  entity is not None
  field_key == ""
  change_entry is None
  entity.schema_id == schema_id

cell:
  entity is not None
  field_key != ""
  change_entry is None
  entity.schema_id == schema_id

changeset_entry:
  change_entry is not None
  change_entry.change_set.schema_id == schema_id
```

- [x] **Step 3: 实现 `Comment`**

要求：

- `body` 存明文纯文本。
- `body_format` 第一期固定选择 `plain`，但字段保留。
- `clean()` 中拒绝空白 `body`，系统评论也必须有正文。
- `deleted_at` 只做软删除字段，第一期 API 不开放删除。

- [x] **Step 4: 实现 `CommentMention` 与 `CommentReadState`**

要求：

- `CommentMention` 约束 `unique(comment, user)`。
- `CommentReadState` 约束 `unique(thread, user)`。
- 两者都加面向查询的 index：
  - `CommentMention(user, comment)`
  - `CommentReadState(user, thread)`

- [x] **Step 5: 增加索引**

`CommentThread` 必须包含：

```text
(schema, anchor_type, entity, field_key, status)
(schema, last_activity_at)
(entity, field_key)
(change_entry)
(created_by, last_activity_at)
```

`Comment` 必须包含：

```text
(thread, created_at)
(created_by, created_at)
```

- [x] **Step 6: 生成迁移**

Run:

```powershell
cd backend
python manage.py makemigrations comments
```

Expected:

```text
Migrations for 'comments':
  apps/comments/migrations/0001_initial.py
```

- [x] **Step 7: 运行模型测试**

Run:

```powershell
cd backend
pytest tests/test_comments_models.py -q
```

Expected:

```text
all tests passed
```

### Task 4: 实现权限、字段可见性与 selector

**Files:**
- Create: `backend/apps/comments/permissions.py`
- Create: `backend/apps/comments/selectors.py`
- Test: `backend/tests/test_comments_api.py`
- Test: `backend/tests/test_comments_summary_api.py`

> 并行判断：Task 4 定义 `permissions.py` / `selectors.py` 共享契约，后续 service/API 都依赖这里的权限语义；不适合与 Task 5/6 并行写入。当前会话可发现 `spawn_agent`，但工具参数不暴露 `model` / `reasoning_effort`，无法满足本仓库“子代理必须显式设置模型与推理等级”的硬约束，因此本任务由主会话串行完成。

- [x] **Step 1: 写权限测试**

执行记录：已创建 `backend/tests/test_comments_api.py` 与 `backend/tests/test_comments_summary_api.py`；已运行 `pytest tests/test_comments_api.py tests/test_comments_summary_api.py -q`，红灯失败在缺少 `apps.comments.permissions` 与 `apps.comments.selectors`，符合 Task 4 生产代码尚未实现的预期失败。

测试目标：

- 表 owner 可以创建 row/cell 评论。
- shared viewer 可以创建可见字段的 cell 评论。
- 非协作者不能读取线程。
- 对 masked sensitive 字段，viewer 不能创建 cell 评论，summary 不返回该字段的 cell 信息。
- row 评论不受具体字段脱敏影响，但仍要求 `can_view_schema`。

- [x] **Step 2: 实现 `can_view_comment_anchor(user, schema, anchor_type, entity, field_key)`**

规则：

```text
1. 必须 can_view_schema(user, schema)
2. row anchor 要求 entity.schema_id == schema.id
3. cell anchor 要求 entity.schema_id == schema.id
4. cell anchor 要求 field_key 存在于 schema.fields_config
5. cell anchor 要求 field 不是 hidden/system
6. cell anchor 要求 field_value_is_masked(user, schema, field) is False
```

- [x] **Step 3: 实现 `can_mutate_thread_status(user, thread)`**

规则：

```text
允许：
  thread.created_by_id == user.id
  或 can_edit_data(user, thread.schema)
  或 user.is_staff / user.is_superuser
拒绝：
  只读 viewer 关闭别人创建的线程
```

- [x] **Step 4: 实现 `visible_threads(user, schema)`**

返回 queryset，至少包含：

```text
select_related("schema", "entity", "created_by", "resolved_by")
prefetch_related("comments", "comments__created_by", "comments__mentions")
filter(schema=schema)
```

并在序列化前对 cell anchor 执行字段可见性过滤。

- [x] **Step 5: 实现 `summary_for_entities(user, schema, entity_ids)`**

输入：

```python
entity_ids: list[int]
```

输出：

```python
{
    entity_id: {
        "row": {"open_count": int, "total_count": int, "unread_count": int},
        "cells": {
            field_key: {"open_count": int, "total_count": int, "unread_count": int}
        },
    }
}
```

要求：

- 只查询 `row/cell` anchor。
- 只统计传入的 `entity_ids`。
- 只统计当前用户可见字段。
- unread 通过 `CommentReadState.last_read_at < CommentThread.last_activity_at` 或不存在 read state 判断。
- 每页 records 默认最多 200，summary 查询不应按线程逐条查 read state。

执行记录：已创建 `backend/apps/comments/permissions.py` 与 `backend/apps/comments/selectors.py`；`visible_threads` 在 Phase 1 仅返回 row/cell 线程并过滤不可见 cell 字段；`summary_for_entities` 使用 `Prefetch("read_states", queryset=CommentReadState.objects.filter(user=user), to_attr="current_user_read_states")` 避免逐线程查询 read state。验证已运行 `pytest tests/test_comments_models.py tests/test_comments_api.py tests/test_comments_summary_api.py -q`，结果 `15 passed`；已运行 `python manage.py check`，结果 `System check identified no issues`。

### Task 5: 实现 service 层

**Files:**
- Create: `backend/apps/comments/services.py`
- Test: `backend/tests/test_comments_api.py`

> 并行判断：Task 5 service 是 Task 6 API 的直接依赖，且 Task 5/6 都会继续修改 `backend/tests/test_comments_api.py`；不适合并行写入。当前 `spawn_agent` 工具仍无法显式设置 `model` / `reasoning_effort`，本任务继续由主会话串行完成。

- [x] **Step 1: 写 create thread API 测试**

测试目标：

- 创建 cell 线程时保存 `record_at_creation`、`record_valid_from_snapshot`、`record_valid_to_snapshot`、`value_snapshot`。
- 创建线程时同步创建首条 `Comment`。
- 创建线程时保存 `CommentMention`。
- 创建后 `comment_count = 1`。
- 创建后 `last_activity_at` 不为空。
- 创建者自动拥有 `CommentReadState`。

- [x] **Step 2: 实现 `create_thread_with_initial_comment`**

输入：

```python
actor
schema
anchor_type
entity
field_key
context_date
record_at_creation
body
mention_user_ids
```

事务内执行：

```text
1. 校验权限
2. 根据 record_at_creation 和 field_key 生成 value_snapshot
3. 创建 CommentThread
4. 创建 Comment
5. 创建去重后的 CommentMention
6. 创建或更新 actor 的 CommentReadState
7. 写 AuditLog: comment.thread_create
```

- [x] **Step 3: 写 add comment API 测试**

测试目标：

- 有权限用户可回复。
- 回复后 `comment_count + 1`。
- 回复后 `last_activity_at` 更新。
- 回复者 read state 更新。
- @ 用户生成 mention。

- [x] **Step 4: 实现 `add_comment`**

事务内执行：

```text
1. 锁定 thread
2. 校验用户可见 thread
3. 创建 Comment
4. 创建 mentions
5. 更新 thread.comment_count 和 last_activity_at
6. 更新回复者 read state
7. 写 AuditLog: comment.reply_create
```

- [x] **Step 5: 写 resolve/reopen/read 测试**

测试目标：

- 创建者能关闭自己的线程。
- editor 能关闭 viewer 创建的线程。
- viewer 不能关闭别人创建的线程。
- resolved 后再次回复会保持 resolved，不自动 reopen。
- reopen 后 `status = open`，`resolved_by/resolved_at` 清空。
- read endpoint 更新 `last_read_at`。

- [x] **Step 6: 实现 `resolve_thread`、`reopen_thread`、`mark_thread_read`**

审计动作：

```text
comment.thread_resolve
comment.thread_reopen
```

`mark_thread_read` 不写审计，避免审计噪音。

执行记录：已在 `backend/tests/test_comments_api.py` 追加 service 层红灯测试，覆盖创建线程上下文快照、初始评论、mention 去重、read state、审计、masked cell 拒绝、回复计数与状态变更权限；已运行 `pytest tests/test_comments_api.py -q`，红灯失败在缺少 `apps.comments.services`，符合 Task 5 生产代码尚未实现的预期失败。已创建 `backend/apps/comments/services.py`；实现 `create_thread_with_initial_comment`、`add_comment`、`resolve_thread`、`reopen_thread`、`mark_thread_read`。调试记录：首次绿灯前发现 PostgreSQL 不允许 `SELECT ... FOR UPDATE` 组合 nullable FK 外连接，已将锁定查询收敛为只锁 `CommentThread` 本行并仅 `select_related("schema")`。验证已运行 `pytest tests/test_comments_models.py tests/test_comments_api.py tests/test_comments_summary_api.py -q`，结果 `20 passed`；已运行 `python manage.py check`，结果 `System check identified no issues`。

### Task 6: 实现 serializer、API 与 urls

**Files:**
- Create: `backend/apps/comments/serializers.py`
- Create: `backend/apps/comments/api.py`
- Modify: `backend/apps/comments/urls.py`
- Test: `backend/tests/test_comments_api.py`
- Test: `backend/tests/test_comments_summary_api.py`

> 并行判断：Task 6 同时修改 API 合约、路由入口和共享测试文件，属于单一集成面；不适合拆给多个写入者并行。已先追加 HTTP API 红灯测试，`pytest tests/test_comments_api.py -q` 失败为 `/api/v1/comments/...` 返回 404，符合 API/urls 尚未实现的预期失败。

- [x] **Step 1: 实现 serializer**

序列化输出字段：

```text
CommentThread:
  id, schema_id, anchor_type, entity_id, field_key, status
  created_by_id, created_by_username
  created_at, updated_at, last_activity_at
  resolved_by_id, resolved_by_username, resolved_at
  comment_count
  context: created_at_context_date, record_id_at_creation, valid_from, valid_to, value_snapshot
  comments[]
  unread

Comment:
  id, body, body_format, created_by_id, created_by_username
  created_at, edited_at, deleted_at, is_system
  mentions[]
```

- [x] **Step 2: 实现 query 参数解析**

解析规则：

```text
schema_id: required positive int
anchor_type: optional, row/cell only in phase 1
entity_id: optional positive int
field_key: optional string
entity_ids for summary: comma-separated positive ints, max 200
```

- [x] **Step 3: 实现 endpoints**

使用 DRF `@api_view` 与 `@permission_classes([IsAuthenticated])`，与当前项目 API 风格保持一致。

- [x] **Step 4: 路由映射**

`backend/apps/comments/urls.py`：

```python
from django.urls import path

from .api import (
    comment_summary_view,
    comment_thread_comments_view,
    comment_thread_read_view,
    comment_thread_reopen_view,
    comment_thread_resolve_view,
    comment_threads_view,
)

urlpatterns = [
    path("comments/threads/", comment_threads_view),
    path("comments/threads/<int:thread_id>/comments/", comment_thread_comments_view),
    path("comments/threads/<int:thread_id>/resolve/", comment_thread_resolve_view),
    path("comments/threads/<int:thread_id>/reopen/", comment_thread_reopen_view),
    path("comments/threads/<int:thread_id>/read/", comment_thread_read_view),
    path("comments/summary/", comment_summary_view),
]
```

- [x] **Step 5: 运行后端 API 测试**

Run:

```powershell
cd backend
pytest tests/test_comments_api.py tests/test_comments_summary_api.py -q
```

Expected:

```text
all tests passed
```

执行记录：已创建 `backend/apps/comments/serializers.py` 与 `backend/apps/comments/api.py`，并更新 `backend/apps/comments/urls.py`。API 采用 DRF `@api_view` + `IsAuthenticated`，请求解析支持 `schema_id`、`anchor_type`、`entity_id`、`field_key`、`entity_ids`、`record_id`、`mention_user_ids`；响应序列化包含 thread、comments、mentions、context 与 unread。验证已运行 `pytest tests/test_comments_api.py tests/test_comments_summary_api.py -q`，结果 `15 passed`；已运行 `pytest tests/test_comments_models.py tests/test_comments_api.py tests/test_comments_summary_api.py -q`，结果 `24 passed`；已运行 `python manage.py check`，结果 `System check identified no issues`。

### Task 7: 后端集成验证

**Files:**
- Modify only if failures reveal issues in previous files.

- [x] **Step 1: 运行 comments 相关测试**

Run:

```powershell
cd backend
pytest tests/test_comments_models.py tests/test_comments_api.py tests/test_comments_summary_api.py -q
```

Expected:

```text
all tests passed
```

- [x] **Step 2: 运行 current-view 与权限回归**

Run:

```powershell
cd backend
pytest tests/test_current_view_filters_api.py tests/test_m1_permissions.py tests/test_p2_field_masking_api.py -q
```

Expected:

```text
all tests passed
```

- [x] **Step 3: 运行 Django check**

Run:

```powershell
cd backend
python manage.py check
```

Expected:

```text
System check identified no issues
```

执行记录：已运行 `pytest tests/test_comments_models.py tests/test_comments_api.py tests/test_comments_summary_api.py -q`，结果 `24 passed`；已运行 `pytest tests/test_current_view_filters_api.py tests/test_m1_permissions.py tests/test_p2_field_masking_api.py -q`，结果 `17 passed`；已运行 `python manage.py check`，结果 `System check identified no issues`。

## 5. 前端任务

### Task 8: 新增 comments API client

**Files:**
- Create: `frontend/src/api/comments.ts`

- [x] **Step 1: 定义类型**

类型必须包含：

```ts
export type CommentAnchorType = "row" | "cell";
export type CommentThreadStatus = "open" | "resolved";

export interface CommentSummaryCount {
  open_count: number;
  total_count: number;
  unread_count: number;
}

export interface EntityCommentSummary {
  row: CommentSummaryCount;
  cells: Record<string, CommentSummaryCount>;
}
```

- [x] **Step 2: 定义 API 函数**

函数清单：

```ts
export async function getCommentSummary(schemaId: number, entityIds: number[]): Promise<CommentSummaryResponse>
export async function listCommentThreads(params: ListCommentThreadsParams): Promise<CommentThread[]>
export async function createCommentThread(payload: CreateCommentThreadPayload): Promise<CommentThread>
export async function addComment(threadId: number, payload: AddCommentPayload): Promise<CommentThread>
export async function resolveCommentThread(threadId: number): Promise<CommentThread>
export async function reopenCommentThread(threadId: number): Promise<CommentThread>
export async function markCommentThreadRead(threadId: number): Promise<CommentThread>
```

- [x] **Step 3: 运行类型检查**

Run:

```powershell
cd frontend
npm run build
```

Expected:

```text
build completes without TypeScript errors
```

执行记录：已创建 `frontend/src/api/comments.ts`，包含 comments 类型、summary 类型、thread/comment/mention/context 类型，以及 summary/list/create/reply/resolve/reopen/read API 函数；已运行 `npm run build`，结果 `tsc -b && vite build` 成功完成。

### Task 9: 新增评论 anchor 与 badge

**Files:**
- Create: `frontend/src/features/comments/commentAnchors.ts`
- Create: `frontend/src/features/comments/CommentBadge.tsx`

- [x] **Step 1: 定义前端 anchor 类型**

`commentAnchors.ts` 输出：

```ts
export interface RowCommentAnchor {
  anchorType: "row";
  schemaId: number;
  entityId: number;
  displayCode: string;
}

export interface CellCommentAnchor extends RowCommentAnchor {
  anchorType: "cell";
  fieldKey: string;
  fieldLabel: string;
  recordId: number;
  contextDate: string;
  value: unknown;
}

export type CommentAnchor = RowCommentAnchor | CellCommentAnchor;
```

- [x] **Step 2: 实现 `CommentBadge`**

UI 要求：

- 使用 lucide `MessageSquare` 图标。
- 无评论时显示轻量 outline 图标入口。
- 有 open 评论时显示数量。
- 有 unread 时用更强的边框或小点标记。
- button 必须有 `title` 与 `aria-label`。
- 不改变单元格行高。

- [x] **Step 3: 运行 lint**

Run:

```powershell
cd frontend
npm run lint
```

Expected:

```text
no lint errors
```

执行记录：已创建 `frontend/src/features/comments/commentAnchors.ts` 与 `frontend/src/features/comments/CommentBadge.tsx`；`CommentBadge` 使用 lucide `MessageSquare`、固定 28px 高度入口、open 数量和 unread 小点；已运行 `npm run lint`，无 lint errors。

类型决策：计划示例中的 `CellCommentAnchor extends RowCommentAnchor` 会在 TypeScript 中造成 `anchorType: "cell"` 覆盖 `"row"` 的字面量冲突；实际实现提取内部基础接口，再导出 `RowCommentAnchor | CellCommentAnchor` 判别联合，保持外部契约不变。

### Task 10: 新增评论 drawer 与回复组件

**Files:**
- Create: `frontend/src/features/comments/CommentComposer.tsx`
- Create: `frontend/src/features/comments/CommentThreadList.tsx`
- Create: `frontend/src/features/comments/CommentThreadDrawer.tsx`

- [x] **Step 1: 实现 `CommentComposer`**

功能：

- textarea 输入纯文本。
- 空白文本禁用提交。
- 支持 `Ctrl+Enter` 或 `Meta+Enter` 提交。
- 提交中禁用按钮并显示 `Loader2`。
- 第一版 @ 协作者使用用户选择列表，数据来自 current-view 已有 `collaboratorsQuery`。

- [x] **Step 2: 实现 `CommentThreadList`**

功能：

- 展示线程状态、创建者、最后活跃时间。
- 展示 comments 列表。
- resolved 线程以低对比度显示，但仍可展开。
- open 线程排在 resolved 前；同状态按 `last_activity_at desc`。

- [x] **Step 3: 实现 `CommentThreadDrawer`**

功能：

- 接收 `anchor`、`open`、`onClose`、`collaborators`。
- 打开时调用 `listCommentThreads`。
- 首次无线程时显示 composer，用于创建第一条线程。
- 有线程时允许在当前 anchor 下新建另一条线程。
- 支持回复、resolve、reopen、mark read。
- mutation 成功后 invalidate：
  - `["comment-threads", ...]`
  - `["comment-summary", schemaId]`

- [x] **Step 4: 运行 build**

Run:

```powershell
cd frontend
npm run build
```

Expected:

```text
build completes without TypeScript errors
```

执行记录：已创建 `frontend/src/features/comments/CommentComposer.tsx`、`CommentThreadList.tsx`、`CommentThreadDrawer.tsx`。Composer 支持纯文本、空白禁用、`Ctrl/Meta+Enter`、提交 loading 和 @协作者选择；ThreadList 支持 open/resolved 排序、回复、resolve/reopen；Drawer 接入 list/create/reply/resolve/reopen/read mutations，并 invalidate `comment-threads` 与 `comment-summary`。首次 build 发现 anchor 继承字面量冲突与 `mutateAsync` 返回类型不匹配，已按类型决策修复；已运行 `npm run build`，结果 `tsc -b && vite build` 成功完成。

### Task 11: 集成 CurrentViewPage 与 CurrentGrid

**Files:**
- Modify: `frontend/src/features/current-view/CurrentViewPage.tsx`
- Modify: `frontend/src/features/current-view/CurrentGrid.tsx`
- Modify: `frontend/src/features/current-view/CurrentGridCell.tsx`

- [x] **Step 1: 在 `CurrentViewPage.tsx` 添加 summary query**

逻辑：

```text
1. 从 recordsQuery.data.results 提取 entity_ids
2. entity_ids 为空时不请求
3. queryKey 使用 ["comment-summary", schemaId, entityIds.join(",")]
4. 调用 getCommentSummary(schemaId, entityIds)
```

- [x] **Step 2: 在 `CurrentViewPage.tsx` 管理 active anchor**

新增 state：

```ts
const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
```

页面底部挂载：

```tsx
<CommentThreadDrawer
  open={commentAnchor !== null}
  anchor={commentAnchor}
  collaborators={collaboratorsQuery.data ?? []}
  onClose={() => setCommentAnchor(null)}
/>
```

- [x] **Step 3: 在 `CurrentGrid.tsx` 增加 props**

新增 props：

```ts
commentSummary?: CommentSummaryResponse;
onOpenComments?: (anchor: CommentAnchor) => void;
```

传递到行列构建上下文。

- [x] **Step 4: 行级评论入口**

在 entity meta column 内增加 `CommentBadge`：

```text
anchorType=row
schemaId
entityId
displayCode
```

位置要求：

- 放在 entity chip 附近。
- 不挤占 checkbox。
- open 数显示 row summary。

- [x] **Step 5: 单元格评论入口**

`CurrentGridCell.tsx` 在右上编辑按钮区域旁增加 `CommentBadge`：

```text
anchorType=cell
schemaId
entityId
fieldKey
fieldLabel
recordId
contextDate=at
value=props.value
```

要求：

- selected 或已有评论时显示。
- 无评论且未选中时可弱显示或 hover 显示。
- 不遮挡 markdown preview 和 edit 按钮。

- [x] **Step 6: mutation 后刷新 current-view 相关 query**

在 drawer mutation 成功后刷新：

```text
comment-summary
comment-threads
```

不要刷新 `schema-records`，评论不影响业务数据。

- [x] **Step 7: 运行前端验证**

Run:

```powershell
cd frontend
npm run lint
npm run build
```

Expected:

```text
lint passes
build completes without TypeScript errors
```

执行记录：已在 `CurrentViewPage.tsx` 添加 comment summary query、`commentAnchor` state 和 `CommentThreadDrawer` 挂载；已在 `CurrentGrid.tsx` 接收 `commentSummary`、`onOpenComments`，并额外接收 `schemaId`，因为创建无评论状态下的 row/cell anchor 仍必须带 schema id；已在实体列加入行级 `CommentBadge`；已在 `CurrentGridCell.tsx` 右上角加入 cell `CommentBadge`，与编辑按钮错位避免重叠。Drawer mutations 仅 invalidate `comment-threads` 与 `comment-summary`，不刷新 `schema-records`。已运行 `npm run lint`，无 warning/errors；已运行 `npm run build`，结果 `tsc -b && vite build` 成功完成。

## 6. 手工验收

### Task 12: 后端手工验收

- [x] **Step 1: 应用迁移**

Run:

```powershell
cd backend
python manage.py migrate
```

Expected:

```text
Applying comments.0001_initial... OK
```

- [x] **Step 2: 创建 row 评论**

使用 APIClient、curl 或浏览器 devtools 调用：

```text
POST /api/v1/comments/threads/
```

Expected:

```text
201
response.status == "open"
response.comment_count == 1
```

- [x] **Step 3: 创建 cell 评论并检查 summary**

调用：

```text
GET /api/v1/comments/summary/?schema_id=<schema_id>&entity_ids=<entity_id>
```

Expected:

```text
entities.<entity_id>.cells.<field_key>.open_count == 1
```

- [x] **Step 4: viewer 权限验证**

用 shared viewer 登录：

```text
1. 可读取自己有表权限的 row 评论
2. 不可读取非协作表评论
3. 不可读取 masked 字段 cell 评论正文和值快照
```

执行记录：已运行 `python manage.py migrate`，结果应用 `schemas.0004_expand_period_units... OK` 与 `comments.0001_initial... OK`。已使用 `APIClient(HTTP_HOST="localhost")` 在事务内执行可回滚 smoke：row 评论创建返回 `201 open 1`；cell 评论创建返回 `201` 且 `value_snapshot == 3200`；summary 返回 row/cell `open_count == 1`；shared viewer 对 masked `salary` cell 创建返回 `403`。首次 smoke 因 APIClient 默认 `testserver` 不在 `ALLOWED_HOSTS` 失败，已用 `localhost` 重跑通过，事务回滚不污染数据。

### Task 13: 前端手工验收

- [x] **Step 1: 打开当前视图**

启动：

```powershell
cd backend
python manage.py runserver
```

```powershell
cd frontend
npm run dev
```

打开：

```text
http://localhost:5173
```

- [x] **Step 2: 创建单元格评论**

操作：

```text
1. 进入某张表当前视图
2. 选择一个可见单元格
3. 点击评论图标
4. 输入评论正文
5. 选择一个协作者 @
6. 提交
```

Expected:

```text
drawer 显示新线程
单元格出现 open 评论数量
刷新页面后评论仍存在
```

- [x] **Step 3: 创建行级评论**

操作：

```text
1. 点击行级评论入口
2. 输入评论
3. 提交
```

Expected:

```text
行头显示评论数量
cell 评论数量不受影响
```

- [x] **Step 4: 回复和关闭线程**

操作：

```text
1. 在 drawer 中回复
2. 点击 resolve
3. 点击 reopen
```

Expected:

```text
回复追加到线程
resolve 后 open_count 减少
reopen 后 open_count 恢复
```

- [x] **Step 5: 数据变更后上下文快照验证**

操作：

```text
1. 对某 cell 创建评论
2. 修改该 cell 数据
3. 打开评论 drawer
```

Expected:

```text
线程仍挂在当前 cell
drawer 能展示创建时上下文值
当前值与创建时值不同时有明确提示
```

执行记录：已完成前端 smoke。`localhost:5173` 被 `D:\code\tauriapps\BookReading` 占用，ChronoTrace 前端改用 `http://localhost:5174`；后端 smoke 以运行时环境变量临时加入 `localhost:5174` / `127.0.0.1:5174` 的 CSRF/CORS trusted origins，未修改仓库配置。Browser 插件 `iab` 当前列表为空，页面验收降级使用 Chrome DevTools MCP。使用 smoke 表 `Comment UI Smoke`（schema `32`，entity `23555`）验证：viewer 登录后当前视图可见 `ASSET-001`；Amount 单元格可创建线程并显示 open 数量，刷新后仍存在；行级入口可创建 row 线程，row 与 cell badge 独立计数；Amount 线程可回复、resolve、reopen。验收中发现 TanStack mutation `variables` 成功后仍保留导致 resolve 后 reopen / reply 临时禁用，已改为仅在 `isPending` 时传入 pending id；同时补充 drawer 上下文快照 UI。viewer 会话因现有 `/schemas/{id}/collaborators/` 对只读协作者返回 `403`，前端 @ 选择列表不可用；已通过评论 API 追加带 `mention_user_ids=[39]` 的回复，并断言 `CommentMention(comment_id=6, user_id=39)` 持久化。随后通过现有 ChangeSet 编辑链路将 Amount 从 `3200` 应用为 `3300`（ChangeSet `63`），重新打开 Amount drawer 可见 `创建时值 3200`、`当前值 3300`、提示 `当前值与创建时值不同`。

## 7. 最终验证命令

- [x] **Step 1: 后端局部测试**

Run:

```powershell
cd backend
pytest tests/test_comments_models.py tests/test_comments_api.py tests/test_comments_summary_api.py -q
```

Expected:

```text
all tests passed
```

- [x] **Step 2: 后端回归测试**

Run:

```powershell
cd backend
pytest tests/test_current_view_filters_api.py tests/test_m1_permissions.py tests/test_p2_field_masking_api.py -q
```

Expected:

```text
all tests passed
```

- [x] **Step 3: Django 检查**

Run:

```powershell
cd backend
python manage.py check
```

Expected:

```text
System check identified no issues
```

- [x] **Step 4: 前端检查**

Run:

```powershell
cd frontend
npm run lint
npm run build
```

Expected:

```text
lint passes
build completes without TypeScript errors
```

执行记录：已 fresh run 最终验证命令。`pytest tests/test_comments_models.py tests/test_comments_api.py tests/test_comments_summary_api.py -q` 结果 `24 passed in 35.57s`；`pytest tests/test_current_view_filters_api.py tests/test_m1_permissions.py tests/test_p2_field_masking_api.py -q` 结果 `17 passed in 23.23s`；`python manage.py check` 结果 `System check identified no issues (0 silenced)`；`npm run lint` 退出码 0 且无 lint errors；`npm run build` 完成 `tsc -b && vite build`，退出码 0，仅保留 Vite chunk size warning。

## 8. 第一完成标准

第一期完成必须同时满足：

- 当前视图可对 row 创建评论线程。
- 当前视图可对 cell 创建评论线程。
- 线程可回复。
- 线程可 resolve/reopen。
- @ 协作者被持久化到 `CommentMention`。
- `CommentReadState` 可支持 unread。
- 当前页 summary 能一次性返回 row/cell 评论计数。
- drawer 能展示完整线程与创建时上下文。
- 评论不进入 `data_payload`。
- masked/hidden/system 字段不会泄露评论正文和值快照。
- 后端 comments 测试、current-view 权限回归、前端 lint/build 均通过。

完成标准审计：已逐项核对。当前视图 smoke 已覆盖 row 线程、cell 线程、回复、resolve/reopen、刷新持久化与上下文差异提示；后端 API/DB 审计返回 summary `row.open_count=1`、`cells.amount.open_count=1`，Amount thread `comment_count=3`、`value_snapshot=3200`、当前记录 `amount=3300`；`CommentMention(comment_id=6, user_id=39)` 与 viewer `CommentReadState` 均存在；当前记录 `data_payload` 为 `asset_no/amount/note/salary` 业务字段，实际评论正文未进入 payload；masked 字段访问控制由 comments API 测试与 Task 12 smoke 覆盖；最终验证命令已 fresh run 通过。
