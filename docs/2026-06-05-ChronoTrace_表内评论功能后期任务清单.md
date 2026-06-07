# ChronoTrace 表内评论功能后期任务清单

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` before implementing any stage below. This document is a roadmap checklist; each stage should be expanded into its own implementation plan before code changes.

**Goal:** 在第一期行级与单元格评论 MVP 稳定后，逐步扩展 ChangeSet 审批协作、待办通知、搜索筛选、Workbench 沉淀、治理指标、导出和 AI 增强能力。

**Architecture:** 后期能力继续复用第一期 `comments` app，不拆分独立数据库。扩展顺序遵循“审批协作优先、个人待办其次、治理沉淀最后”的原则，避免在未验证基础评论闭环前引入通知、搜索、AI 等复杂系统。

**Tech Stack:** Django + DRF + PostgreSQL + pytest；React + TypeScript + TanStack Query + Vite；后期可按需接入异步任务和全文检索能力。

---

## 0. 后期推进原则

- 每个阶段独立成计划、独立验收，不把所有后期能力一次性合并。
- 不新增独立数据库，除非评论量级、合规隔离或部署策略出现明确需求。
- 优先复用 `CommentThread / Comment / CommentMention / CommentReadState`。
- 对外 API 需要保持第一期契约兼容。
- 涉及通知、搜索、导出、AI 前必须完成权限和字段脱敏审查。
- 每个阶段必须新增后端测试；有 UI 的阶段必须跑 `npm run lint` 和 `npm run build`。

## 1. 后期阶段建议顺序

推荐顺序：

```text
Phase 2A: ChangeSet Entry 评论与审批协作
Phase 2B: 我的评论待办与 @ 提醒
Phase 2C: 评论搜索与筛选
Phase 2D: 通知中心与轻量提醒
Phase 3A: 评论沉淀为 Workbench Note
Phase 3B: 评论治理指标与长期未解决提醒
Phase 3C: 评论导出
Phase 3D: AI 摘要与辅助归档
```

## 2. Phase 2A: ChangeSet Entry 评论与审批协作

**目标：** 审批人能针对某条 ChangeEntry 留下具体问题，修改人能在同一线程中解释并处理。

**前置条件：**

- 第一期开启 `comments` app。
- `CommentThread.anchor_type = changeset_entry` 已在模型中预留。
- ChangeSet detail 页已有 entry 列表和 changed fields 展示。

**涉及文件：**

- Modify: `backend/apps/comments/permissions.py`
- Modify: `backend/apps/comments/services.py`
- Modify: `backend/apps/comments/api.py`
- Modify: `backend/apps/changesets/api.py`
- Modify: `frontend/src/api/comments.ts`
- Modify: `frontend/src/api/schemas.ts`
- Modify: `frontend/src/features/current-view/ChangeStreamPanel.tsx`
- Create: `frontend/src/features/comments/ChangeEntryCommentAnchor.tsx`
- Create: `backend/tests/test_comments_changeset_entry_api.py`

**任务清单：**

- [ ] 新增 `changeset_entry` anchor 的权限规则。
- [ ] 校验 `change_entry.change_set.schema_id == schema_id`。
- [ ] 审批人、ChangeSet 创建者、表 owner/editor 可查看 ChangeEntry 评论。
- [ ] 只读 viewer 默认不能查看 ChangeSet 审批评论，除非本身能查看该 ChangeSet 详情。
- [ ] API 开放 `anchor_type=changeset_entry` 的 list/create。
- [ ] 创建 ChangeEntry 评论时保存 `change_entry_id`，并可选保存 `entity_id` 与 `field_key` 快照。
- [ ] 在 ChangeSet detail entries 中附加评论 summary。
- [ ] 在变更明细行显示评论图标、open 数和 unread 点。
- [ ] 在审批驳回流程中允许把驳回原因关联到具体 entry 评论。
- [ ] 新增测试：审批人创建 entry 评论。
- [ ] 新增测试：修改人回复 entry 评论。
- [ ] 新增测试：无权用户不能读取 entry 评论。
- [ ] 新增测试：entry 评论不污染 `rejected_reason` 和 `data_after`。

**验收标准：**

- 审批人可以在具体 ChangeEntry 上提问。
- 修改人能回复问题。
- entry 评论能 resolve/reopen。
- ChangeSet 列表或详情能显示存在未解决 entry 评论。
- 权限不弱于 ChangeSet 详情权限。

**验证命令：**

```powershell
cd backend
pytest tests/test_comments_changeset_entry_api.py tests/test_m4_changeset_editor_api.py -q
```

```powershell
cd frontend
npm run lint
npm run build
```

## 3. Phase 2B: 我的评论待办与 @ 提醒

**目标：** 用户能集中查看“我被 @、我创建的未解决、我参与过且未读”的评论任务。

**前置条件：**

- `CommentMention` 已持久化。
- `CommentReadState` 已能判断 unread。
- 线程状态已支持 `open / resolved`。

**涉及文件：**

- Create: `backend/apps/comments/inbox.py`
- Modify: `backend/apps/comments/api.py`
- Modify: `backend/apps/comments/urls.py`
- Create: `backend/tests/test_comments_inbox_api.py`
- Modify: `frontend/src/api/comments.ts`
- Create: `frontend/src/features/comments/MyCommentTasksPage.tsx`
- Modify: `frontend/src/routes` 或当前项目路由入口文件

**任务清单：**

- [ ] 定义 inbox 分类：`mentioned_open`、`created_open`、`participated_unread`。
- [ ] 实现 `/api/v1/comments/inbox/`。
- [ ] 支持 query 参数：`type`、`schema_id`、`status`、`page`、`page_size`。
- [ ] 每条 inbox item 返回 anchor 摘要：表名、实体 display code、field label、线程状态、最后活跃时间。
- [ ] 对 cell anchor 执行字段可见性过滤。
- [ ] 前端新增“我的评论待办”页面。
- [ ] 支持点击待办跳转到当前视图并打开对应 drawer。
- [ ] 对 resolved 线程默认隐藏，允许筛选显示。
- [ ] 新增测试：@ 我的 open 线程出现在 inbox。
- [ ] 新增测试：已读参与线程不出现在 unread。
- [ ] 新增测试：字段脱敏时 inbox 不泄露 field value。

**验收标准：**

- 用户能看到被 @ 的未解决线程。
- 用户能看到自己创建的未解决线程。
- 用户能看到自己参与但未读的线程。
- 点击待办可返回表格上下文。

**验证命令：**

```powershell
cd backend
pytest tests/test_comments_inbox_api.py tests/test_comments_summary_api.py -q
```

```powershell
cd frontend
npm run lint
npm run build
```

## 4. Phase 2C: 评论搜索与筛选

**目标：** 表 owner/editor 能按关键词、状态、参与人、字段、时间范围查找评论。

**前置条件：**

- 评论正文权限策略稳定。
- inbox 能返回 anchor 摘要。
- 字段可见性过滤已覆盖 summary 与 thread list。

**涉及文件：**

- Create: `backend/apps/comments/search.py`
- Modify: `backend/apps/comments/api.py`
- Modify: `backend/apps/comments/urls.py`
- Create: `backend/tests/test_comments_search_api.py`
- Modify: `frontend/src/api/comments.ts`
- Create: `frontend/src/features/comments/CommentSearchPanel.tsx`

**任务清单：**

- [ ] 实现 `/api/v1/comments/search/`。
- [ ] 支持 query 参数：`q`、`schema_id`、`status`、`anchor_type`、`field_key`、`created_by`、`mentioned_user`、`from`、`to`。
- [ ] PostgreSQL 第一版使用 `icontains`，不先引入全文检索配置。
- [ ] 搜索结果返回命中的 thread 和最近匹配 comment 摘要。
- [ ] 搜索结果不返回 masked 字段的 value_snapshot。
- [ ] 搜索结果不返回用户无权访问字段的 cell thread。
- [ ] 前端在当前视图侧栏或抽屉中增加搜索筛选入口。
- [ ] 支持点击搜索结果打开对应 thread drawer。
- [ ] 新增测试：关键词匹配正文。
- [ ] 新增测试：按 status 筛选。
- [ ] 新增测试：无权用户搜索不到隐藏字段线程。

**验收标准：**

- owner/editor 可搜索当前表评论。
- 搜索结果能定位回行或单元格。
- 权限过滤与普通 thread list 一致。

**验证命令：**

```powershell
cd backend
pytest tests/test_comments_search_api.py tests/test_comments_api.py -q
```

```powershell
cd frontend
npm run lint
npm run build
```

## 5. Phase 2D: 通知中心与轻量提醒

**目标：** 用户在被 @ 或线程被回复时能收到站内提醒，不要求第一版实时 WebSocket。

**前置条件：**

- inbox 已稳定。
- mention 与 reply service 已统一经过 `comments.services`。

**涉及文件：**

- Create: `backend/apps/comments/notifications.py`
- Modify: `backend/apps/comments/services.py`
- Modify: `backend/apps/comments/api.py`
- Modify: `backend/apps/comments/urls.py`
- Create: `backend/tests/test_comments_notifications_api.py`
- Modify: `frontend/src/api/comments.ts`
- Create: `frontend/src/features/comments/CommentNotificationBell.tsx`

**任务清单：**

- [ ] 先评估是否复用 `CommentMention` 作为通知来源，避免新增通知表。
- [ ] 若需要持久通知状态，新增 `CommentNotification` 表并单独写迁移。
- [ ] 实现 `/api/v1/comments/notifications/`。
- [ ] 实现 mark notification read。
- [ ] 被 @ 时生成提醒。
- [ ] 参与线程被别人回复时生成提醒。
- [ ] 自己回复自己参与线程不生成提醒。
- [ ] 前端顶部或工作台入口显示未读提醒数。
- [ ] 点击提醒打开对应 comment drawer。
- [ ] 新增测试：@ 生成通知。
- [ ] 新增测试：重复 @ 不生成重复未读提醒。
- [ ] 新增测试：无权后不再返回历史通知正文。

**验收标准：**

- 被 @ 用户能看到提醒。
- 回复参与线程能提醒其他参与者。
- 提醒可标记已读。
- 无实时刷新也可通过页面轮询或手动刷新获取。

**验证命令：**

```powershell
cd backend
pytest tests/test_comments_notifications_api.py tests/test_comments_inbox_api.py -q
```

```powershell
cd frontend
npm run lint
npm run build
```

## 6. Phase 3A: 评论沉淀为 Workbench Note

**目标：** 将已解决的重要评论线程沉淀为 Workbench Note，形成可长期复用的知识记录。

**前置条件：**

- Workbench Note API 稳定。
- 评论线程已支持 resolved。
- 线程正文、参与者和上下文快照能完整序列化。

**涉及文件：**

- Modify: `backend/apps/comments/services.py`
- Create: `backend/apps/comments/workbench_bridge.py`
- Create: `backend/tests/test_comments_workbench_bridge_api.py`
- Modify: `frontend/src/features/comments/CommentThreadDrawer.tsx`
- Modify: `frontend/src/api/comments.ts`

**任务清单：**

- [ ] 定义沉淀入口：仅 resolved 线程可沉淀。
- [ ] 允许线程创建者、owner/editor 执行沉淀。
- [ ] 生成 Workbench Note 标题：`评论沉淀：<表名> / <行或字段> / <日期>`。
- [ ] Note 正文包含：anchor、创建时值、当前值、完整讨论、resolved 信息。
- [ ] 创建 WorkbenchLink 关联到 DataSchema。
- [ ] 线程记录已沉淀的 Workbench item id，避免重复沉淀。
- [ ] 前端 drawer 增加“沉淀为笔记”按钮。
- [ ] 新增测试：resolved 线程可沉淀。
- [ ] 新增测试：open 线程不可沉淀。
- [ ] 新增测试：重复沉淀返回已有 note 或 409。

**验收标准：**

- 已解决线程可转成 Workbench Note。
- Note 能在 Workbench 中查看。
- 原线程保留，不被删除。

**验证命令：**

```powershell
cd backend
pytest tests/test_comments_workbench_bridge_api.py tests/test_p5_workbench_api.py -q
```

```powershell
cd frontend
npm run lint
npm run build
```

## 7. Phase 3B: 评论治理指标与长期未解决提醒

**目标：** 表 owner 能看到评论问题的治理状态，例如 open 数、长期未解决数、平均解决时间、字段热点。

**前置条件：**

- resolve/reopen 审计稳定。
- last_activity_at 与 resolved_at 数据完整。

**涉及文件：**

- Create: `backend/apps/comments/metrics.py`
- Modify: `backend/apps/comments/api.py`
- Modify: `backend/apps/comments/urls.py`
- Create: `backend/tests/test_comments_metrics_api.py`
- Modify: `frontend/src/api/comments.ts`
- Create: `frontend/src/features/comments/CommentMetricsPanel.tsx`

**任务清单：**

- [ ] 实现 `/api/v1/comments/metrics/?schema_id=...`。
- [ ] 统计 open thread 总数。
- [ ] 统计 unresolved 超过 7/14/30 天的数量。
- [ ] 统计 field_key 维度 open 热点。
- [ ] 统计平均解决时长。
- [ ] 统计 mentioned 未响应超过 N 天的任务。
- [ ] 前端在 current-view 或管理端增加治理面板。
- [ ] 支持点击指标跳转到搜索结果。
- [ ] 新增测试：open count。
- [ ] 新增测试：长期未解决 count。
- [ ] 新增测试：字段热点不包含 masked 字段。

**验收标准：**

- owner 能判断当前表评论积压情况。
- 指标不会暴露无权字段。
- 指标能定位到具体线程列表。

**验证命令：**

```powershell
cd backend
pytest tests/test_comments_metrics_api.py tests/test_comments_search_api.py -q
```

```powershell
cd frontend
npm run lint
npm run build
```

## 8. Phase 3C: 评论导出

**目标：** 表 owner/editor 可导出评论线程，用于审计、交接或线下复盘。

**前置条件：**

- 搜索筛选 API 稳定。
- 导出权限规则与数据导出权限一致。
- 敏感字段脱敏策略已确认。

**涉及文件：**

- Create: `backend/apps/comments/export.py`
- Modify: `backend/apps/comments/api.py`
- Modify: `backend/apps/comments/urls.py`
- Create: `backend/tests/test_comments_export_api.py`
- Modify: `frontend/src/api/comments.ts`
- Modify: current-view 或 admin export 入口

**任务清单：**

- [ ] 定义导出格式：CSV 第一版，XLSX 后续可选。
- [ ] 导出字段包含：schema、anchor、entity display、field label、status、created_by、created_at、resolved_by、resolved_at、comments。
- [ ] 导出时对 masked 字段隐藏 `value_snapshot`。
- [ ] 导出动作写 `AuditLog`：`comment.export`。
- [ ] 支持按搜索筛选条件导出。
- [ ] 前端增加导出按钮。
- [ ] 新增测试：owner 可导出。
- [ ] 新增测试：无权用户不能导出。
- [ ] 新增测试：导出内容不含 masked value。

**验收标准：**

- 用户能导出自己有权限的评论。
- 导出行为可审计。
- 导出不泄露敏感字段。

**验证命令：**

```powershell
cd backend
pytest tests/test_comments_export_api.py tests/test_m5_audit_api.py -q
```

```powershell
cd frontend
npm run lint
npm run build
```

## 9. Phase 3D: AI 摘要与辅助归档

**目标：** 对长线程生成简短摘要，辅助 owner 判断问题状态和沉淀为 Workbench Note。

**前置条件：**

- 评论沉淀为 Workbench Note 已稳定。
- AI 使用策略、费用、隐私边界已确定。
- 敏感字段不能直接传入外部模型，除非明确经过授权和脱敏。

**涉及文件：**

- Create: `backend/apps/comments/ai_summary.py`
- Modify: `backend/apps/comments/api.py`
- Modify: `backend/apps/comments/urls.py`
- Create: `backend/tests/test_comments_ai_summary_api.py`
- Modify: `frontend/src/api/comments.ts`
- Modify: `frontend/src/features/comments/CommentThreadDrawer.tsx`

**任务清单：**

- [ ] 定义 AI 摘要触发方式：手动触发，不自动生成。
- [ ] 定义可摘要范围：仅当前用户可见正文与上下文。
- [ ] 摘要前执行脱敏和字段可见性过滤。
- [ ] 保存摘要到线程级扩展字段或单独 `CommentThreadSummary` 表。
- [ ] 写审计：`comment.ai_summary_create`。
- [ ] 前端 drawer 增加“生成摘要”按钮。
- [ ] 摘要可复制到 Workbench Note。
- [ ] 新增测试：无权字段不进入摘要输入。
- [ ] 新增测试：生成摘要写审计。
- [ ] 新增测试：摘要失败返回明确错误。

**验收标准：**

- 用户可以手动生成线程摘要。
- 摘要不包含用户无权查看的字段值。
- 摘要可用于 Workbench 沉淀。

**验证命令：**

```powershell
cd backend
pytest tests/test_comments_ai_summary_api.py -q
```

```powershell
cd frontend
npm run lint
npm run build
```

## 10. 不建议近期做的能力

以下能力在评论 MVP 稳定前不建议启动：

- WebSocket 实时协作。
- 多级嵌套回复。
- 评论附件。
- 评论表情反应。
- 跨表评论。
- 评论权限矩阵。
- 自动根据导入异常批量生成评论。
- 独立评论数据库。

原因：

- 它们会显著增加权限、同步、搜索和 UI 复杂度。
- 当前最关键的产品价值是“数据上下文协作闭环”，不是实时聊天或社交互动。
- 第一阶段需要先验证评论线程、summary 聚合和字段可见性策略。

## 11. 后期总验收标准

后期能力整体完成后，应满足：

- 审批沟通能绑定到具体 ChangeEntry。
- 用户能集中处理“我被 @ / 我参与 / 我创建”的评论任务。
- owner/editor 能搜索、筛选和导出评论。
- 重要评论可沉淀为 Workbench Note。
- 管理员能看到长期未解决问题和字段热点。
- 所有评论相关查询都遵守表权限与字段脱敏。
- 评论仍然不污染 `data_payload`、ChangeSet diff、统计和导入导出业务数据。

