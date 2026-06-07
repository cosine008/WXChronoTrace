# ChronoTrace 表内评论功能设计与路线图

> 日期：2026-06-05  
> 状态：产品与技术设计草案  
> 实施状态：Phase 1 MVP 已按 `2026-06-05-ChronoTrace_表内评论功能第一期MVP实施计划.md` 完成实现、手工验收与最终验证。  
> 适用范围：ChronoTrace 当前视图、实体时间线、变更批次、工作台协作能力  
> 推荐方案：独立 `comments` 模块 + 单元格/行级上下文评论线程 + 后续接入 ChangeSet 与 Workbench

---

## 1. 核心结论

ChronoTrace 的表内评论不应被设计成普通表格里的“聊天气泡”，而应设计成 **绑定数据上下文的评论线程**。

这个功能的核心价值不是让用户“在格子里说话”，而是让中小组织在动态表、时态数据、审批批次和审计链路中，把以下信息沉淀下来：

- 这个值为什么这样填。
- 这个字段目前谁需要确认。
- 某次审批驳回的具体理由是什么。
- 某条数据争议后来如何解决。
- 某个时间点看到的值和当前值是否已经不同。

推荐产品定位：

> **Contextual Comment Thread：数据上下文评论线程。**

第一期推荐交付：

- 单元格评论。
- 行级评论。
- 评论回复。
- `open / resolved` 状态。
- @协作者。
- 表格内评论计数和未读提示。
- 右侧评论详情面板。
- 权限控制与基础审计。

第二期再接入：

- ChangeSet Entry 评论。
- 审批流程提示。
- 我的评论待办。
- 评论搜索与筛选。
- 通知中心。

第三期再做：

- 评论沉淀为 Workbench Note。
- 评论治理指标。
- 评论导出。
- 长期未解决提醒。
- AI 摘要等增强能力。

---

## 2. 项目语境

ChronoTrace 不是普通 CRUD 表格系统，而是面向中小组织的数据版本管理平台。

当前系统已有几个关键能力：

- 动态建表：管理员可在前台配置字段并发布业务表。
- 时态数据：记录随时间演化，可通过时间点查看快照。
- 变更批次：所有修改归属 ChangeSet，可审批、回滚、审计。
- 权限隔离：private / shared / public，加 owner / editor / viewer / admin 角色。
- 工作台：已有表级笔记、资料、材料清单等个人工作流能力。

相关现有代码边界：

- 当前表格主界面：`frontend/src/features/current-view/CurrentViewPage.tsx`
- 当前表格渲染：`frontend/src/features/current-view/CurrentGrid.tsx`
- 单元格渲染与编辑：`frontend/src/features/current-view/CurrentGridCell.tsx`
- 当前视图 API：`backend/apps/temporal/api.py`
- 时态对象模型：`backend/apps/temporal/models.py`
- 变更批次模型：`backend/apps/changesets/models.py`
- 权限模型：`backend/apps/schemas/permissions.py`
- 工作台模型：`backend/apps/workbench/models.py`

现有系统的核心对象关系可以概括为：

```text
DataSchema = 一张动态业务表
SchemaVersion = 表结构版本
Entity = 稳定业务对象
TemporalRecord = 某个 Entity 在一段时间内的数据快照
ChangeSet = 一次变更批次
ChangeEntry = 批次内单条新增/修改/终止
AuditLog = 谁在什么时候做了什么
TableCollaborator = 谁能看/改这张表
```

评论功能必须尊重这条数据链路。

如果评论只做成单元格 UI 附件，会失去 ChronoTrace 的时态和审计优势。

如果评论直接写入 `data_payload`，则会污染业务数据、影响导入导出、统计、差异对比和审批。

因此评论应作为独立协作对象存在，通过锚点引用业务对象。

---

## 3. 产品问题

当前系统能回答：

- 某个时间点数据是什么。
- 数据是谁改的。
- 哪个 ChangeSet 改了哪些字段。
- 当前表有哪些记录。
- 某个实体的生命周期是什么。

但还不能自然回答：

- 这个字段为什么暂时为空。
- 这条记录缺什么材料。
- 这个值是否已经被财务、人事、负责人确认。
- 审批人为什么驳回。
- 修改人对驳回意见如何解释。
- 某条争议是否已经关闭。
- 我被 @ 的数据问题在哪里。
- 数据修改后，旧评论讨论的到底是旧值还是当前值。

这些问题在中小组织的数据管理中非常高频。它们通常发生在 Excel 批注、微信群、邮件、口头沟通或个人笔记里，最终导致：

- 数据问题和数据本体分离。
- 交接时难以追踪原因。
- 审批沟通无法复盘。
- 表格中重复出现同类疑问。
- 修改过的数据无法知道“为什么这样改”。
- 管理员很难看到长期未解决的数据问题。

表内评论要解决的是 **数据协作上下文缺失**。

---

## 4. 用户画像

### 4.1 表 owner / 管理员

目标：

- 管理表结构和数据质量。
- 分派数据确认任务。
- 查看长期未解决问题。
- 确保修改和讨论都可追溯。

痛点：

- 现在问题散落在外部沟通工具。
- 表格数据正确，但不知道背后的确认过程。
- 审批驳回后，修改人不知道具体改哪里。

### 4.2 editor / 数据维护者

目标：

- 快速标注某个字段的问题。
- 回复审批意见。
- 根据评论修正数据。
- 处理别人 @ 自己的确认任务。

痛点：

- 不知道哪些字段需要关注。
- 不知道某个旧值为什么被保留。
- 处理完问题后缺少“关闭”动作。

### 4.3 viewer / 只读协作者

目标：

- 反馈自己看到的数据问题。
- 被 @ 后参与确认。
- 不修改数据也能参与协作。

痛点：

- 发现问题只能线下告诉 editor。
- 没有地方表达“这个字段我确认过”。

### 4.4 审批人

目标：

- 在审批 ChangeSet 时指出具体字段的问题。
- 驳回时留下清晰原因。
- 看到修改人是否已处理反馈。

痛点：

- 批次级驳回理由太粗。
- 很难表达“第 3 行的金额和第 5 行的日期有问题”。

---

## 5. 设计原则

### 5.1 评论是协作数据，不是业务数据

评论不进入 `data_payload`，也不参与普通统计、导入导出、字段校验。

评论应作为独立模型存在，通过锚点引用 `schema / entity / field / change_entry`。

### 5.2 锚点跟稳定对象走，上下文快照用于解释

评论主要绑定稳定业务对象，例如：

- `schema + entity + field_key`
- `schema + entity`
- `change_entry`

同时保存创建时的上下文：

- 当前查看日期 `at`
- 当时的 `record_id`
- 当时的 `valid_from / valid_to`
- 当时的字段值 `value_snapshot`

这样可以同时满足两个需求：

- 评论能跟着当前实体继续协作。
- 需要追溯时知道评论创建时看到的旧值。

### 5.3 表格只显示信号，详情放到侧边面板

当前视图是密集数据工作台，不能把完整评论展开在表格中。

表格内只展示：

- 是否有评论。
- open 评论数量。
- 未读状态。
- resolved 历史评论的轻量标记。

完整线程放在右侧 drawer 中。

### 5.4 评论必须可闭环

评论不是自由留言板。每个线程必须有状态：

- `open`：仍需关注。
- `resolved`：已解决。

后续可以扩展：

- `archived`
- `blocked`
- `needs_review`

第一期只做 `open / resolved`。

### 5.5 权限不能弱于数据权限

用户不能通过评论看到自己无权查看的敏感字段值。

评论正文、自动上下文、值快照、搜索结果都必须遵守字段可见性与表权限。

### 5.6 不重复造 Workbench

Workbench 是表级或个人知识沉淀。

评论是高频、短上下文、状态化、可解决的协作现场。

两者应互相连接，但不能混为同一个模型。

---

## 6. 方案对比

### 6.1 方案 A：只做单元格批注

描述：

每个单元格有一个评论列表，用户点击后显示留言。

优点：

- 实现最简单。
- 用户容易理解。
- 和 Excel 批注类似。

缺点：

- 无法表达行级问题。
- 无法表达 ChangeSet 审批问题。
- 和时态数据关系不清。
- 容易成为 UI 小功能，无法进入协作闭环。

结论：

不推荐作为完整方案。可以作为 MVP 的一个子能力，但不能作为整体架构。

### 6.2 方案 B：直接复用 Workbench Note

描述：

每条评论本质上是一个 Workbench Note，通过 WorkbenchLink 关联到表或实体。

优点：

- 能复用已有笔记、链接、审计能力。
- 表级知识沉淀一致。

缺点：

- WorkbenchItem 粒度太重。
- 不适合高频短回复。
- 很难做未读、@、解决状态、评论计数。
- 会污染个人工作台列表。
- 不适合虚拟表格内高性能聚合。

结论：

不推荐作为评论底层模型。Workbench 应作为“沉淀结果”，不是“评论现场”。

### 6.3 方案 C：独立 comments 模块 + 多类型锚点

描述：

新增 `comments` app，建模为 `CommentThread / Comment / CommentReadState / CommentMention`。线程支持多种 anchor：

- `schema`
- `row`
- `cell`
- `changeset_entry`

优点：

- 能覆盖表级、行级、单元格、审批等场景。
- 不污染业务数据和 ChangeSet。
- 可单独做未读、通知、解决状态。
- 与 current view 批量聚合性能更可控。
- 后续可沉淀到 Workbench。

缺点：

- 模型和 API 工作量更大。
- 权限和字段脱敏需要认真设计。
- 需要处理字段删除、实体终止、时态变化等边界。

结论：

推荐方案。

---

## 7. 推荐 MVP

### 7.1 MVP 范围

第一期只做最小但完整的协作闭环：

1. 单元格评论线程。
2. 行级评论线程。
3. 新增回复。
4. @协作者。
5. 线程 `open / resolved`。
6. 当前表格评论 summary。
7. 右侧评论 drawer。
8. 未读状态。
9. 基础权限。
10. 基础审计。

### 7.2 MVP 不做

以下能力不进入第一期：

- 实时 WebSocket。
- 富文本编辑器。
- 评论附件。
- AI 摘要。
- 评论导出。
- 跨表评论。
- 表情反应。
- 多级嵌套回复。
- 评论级复杂权限矩阵。
- 自动根据导入异常批量生成评论。

### 7.3 一句话验收标准

用户能在 ChronoTrace 当前视图里，对某个具体单元格或整行提出问题、@协作者、收到回复、看到该问题是否已解决，并且在数据值发生变化后仍能追溯这条评论创建时讨论的是哪个值。

---

## 8. 评论锚点模型

### 8.1 Anchor 类型

推荐支持四类锚点。

#### schema

绑定整张表。

适用场景：

- 表结构讨论。
- 表级资料缺失。
- 整体导入规则提醒。

MVP 可暂不作为主入口，因为已有 Workbench 表级笔记。

#### row

绑定 `schema + entity`。

适用场景：

- 这条记录整体待确认。
- 缺材料。
- 实体身份有争议。
- 某个对象需要终止但还没确定日期。

#### cell

绑定 `schema + entity + field_key`。

适用场景：

- 某个字段值不确定。
- 某个金额、日期、状态需要确认。
- 字段值变更需要说明。

这是第一期最重要的锚点。

#### changeset_entry

绑定 `ChangeEntry`。

适用场景：

- 审批人针对某条变更提问。
- 驳回时指出具体问题。
- 修改人解释为什么这样改。

建议第二期做。

### 8.2 稳定锚点与上下文快照

评论线程应主要绑定稳定对象，而不是仅绑定 `TemporalRecord`。

原因：

- 如果只绑定 `TemporalRecord`，数据一变评论就沉到旧版本里，当前协作会断裂。
- 如果只绑定当前值，没有快照，历史追溯会不清楚。

推荐做法：

```text
主锚点：schema_id + entity_id + field_key
上下文：record_id_at_creation + at + value_snapshot
```

当字段值发生变化时：

- 评论仍显示在当前单元格。
- 线程顶部提示“此字段值已变化”。
- 展示“创建时值”和“当前值”。
- 如果用户查看旧时间点，也能看到当时上下文。

### 8.3 字段删除或重命名

动态字段不是独立模型，`field_key` 存在于 `fields_config` JSON 中。

因此：

- 评论保存 `field_key`。
- 创建评论时校验 field exists。
- 字段被删除或隐藏后，评论保留。
- UI 显示为“已删除字段：field_key”。
- 若字段不可见，按权限策略隐藏正文或上下文。

---

## 9. 数据模型设计

建议新增 Django app：

```text
backend/apps/comments/
```

### 9.1 CommentThread

建议字段：

```text
id
schema_id
anchor_type: schema | row | cell | changeset_entry
entity_id nullable
field_key nullable
change_entry_id nullable

created_at_context_date nullable
record_id_at_creation nullable
record_valid_from_snapshot nullable
record_valid_to_snapshot nullable
value_snapshot json nullable

status: open | resolved
created_by
created_at
updated_at
last_activity_at
resolved_by nullable
resolved_at nullable
comment_count
```

可选字段：

```text
priority: normal | important
source: manual | changeset_review | import_review | system
title_snapshot
```

### 9.2 Comment

建议字段：

```text
id
thread_id
body
body_format: plain | markdown_lite
created_by
created_at
edited_at nullable
deleted_at nullable
is_system boolean
```

第一期 `body_format` 可固定为 `plain`，但保留字段，后续可支持 markdown-lite。

### 9.3 CommentMention

建议字段：

```text
id
comment_id
user_id
created_at
```

作用：

- 支持“提到我的评论”。
- 支持通知中心。
- 支持后续统计响应时间。

### 9.4 CommentReadState

建议字段：

```text
id
thread_id
user_id
last_read_at
```

作用：

- 判断线程是否未读。
- 支持表格内未读标记。

### 9.5 关键约束

建议在模型 clean 或 service 层做校验：

```text
anchor_type = schema:
  必须有 schema_id
  不允许 entity_id / field_key / change_entry_id

anchor_type = row:
  必须有 schema_id + entity_id
  不允许 field_key / change_entry_id

anchor_type = cell:
  必须有 schema_id + entity_id + field_key
  不允许 change_entry_id

anchor_type = changeset_entry:
  必须有 schema_id + change_entry_id
  entity_id / field_key 可从 ChangeEntry 推导或保存快照
```

索引建议：

```text
(schema_id, anchor_type, entity_id, field_key, status)
(schema_id, last_activity_at)
(entity_id, field_key)
(change_entry_id)
(created_by, last_activity_at)
CommentMention(user_id, comment_id)
CommentReadState(user_id, thread_id)
```

---

## 10. API 设计

### 10.1 当前视图评论聚合

为了避免虚拟表格滚动时逐格请求，当前视图应批量返回当前页评论 summary。

当前记录序列化可扩展：

```json
{
  "record_id": 12,
  "entity_id": 7,
  "data_payload": {},
  "comment_summary": {
    "row": {
      "open": 1,
      "resolved": 2,
      "unread": 1
    },
    "cells": {
      "amount": {
        "open": 2,
        "resolved": 0,
        "unread": 1
      },
      "status": {
        "open": 0,
        "resolved": 1,
        "unread": 0
      }
    }
  }
}
```

查询策略：

- 对当前页 `entity_ids` 批量查 `CommentThread`。
- 按 `entity_id / field_key / status` 聚合。
- 结合 `CommentReadState` 判断 unread。
- 不在每个单元格单独请求。

### 10.2 线程列表

```text
GET /api/v1/schemas/{schema_id}/comments/threads/
```

参数：

```text
anchor_type=row|cell|schema|changeset_entry
entity_id=123
field_key=amount
status=open|resolved|all
mentioned_me=true
unread=true
page=1
page_size=50
```

返回：

```json
{
  "count": 1,
  "results": [
    {
      "id": 42,
      "schema_id": 3,
      "anchor_type": "cell",
      "entity_id": 100,
      "field_key": "amount",
      "status": "open",
      "created_by": {
        "id": 5,
        "username": "alice"
      },
      "created_at": "2026-06-05T10:20:00+08:00",
      "last_activity_at": "2026-06-05T11:00:00+08:00",
      "comment_count": 3,
      "unread": true,
      "context": {
        "at": "2026-06-05",
        "record_id_at_creation": 88,
        "value_snapshot": "1200",
        "current_value": "1300",
        "value_changed": true
      }
    }
  ]
}
```

### 10.3 创建线程

```text
POST /api/v1/schemas/{schema_id}/comments/threads/
```

请求：

```json
{
  "anchor_type": "cell",
  "entity_id": 100,
  "field_key": "amount",
  "at": "2026-06-05",
  "body": "@bob 请确认这个金额是否包含税费",
  "mention_user_ids": [9]
}
```

后端负责：

- 校验用户可见表。
- 校验实体属于该表。
- 校验字段存在且用户可见。
- 解析当前 `TemporalRecord`。
- 保存 `record_id_at_creation` 和 `value_snapshot`。
- 创建首条 `Comment`。
- 创建 Mention。
- 写审计。

### 10.4 获取线程详情

```text
GET /api/v1/comment-threads/{thread_id}/
```

返回：

```json
{
  "id": 42,
  "status": "open",
  "anchor": {
    "type": "cell",
    "schema_id": 3,
    "entity_id": 100,
    "display_code": "EMP-001",
    "field_key": "amount",
    "field_label": "金额"
  },
  "context": {
    "created_at_context_date": "2026-06-05",
    "record_id_at_creation": 88,
    "value_snapshot": "1200",
    "current_value": "1300",
    "value_changed": true
  },
  "comments": [
    {
      "id": 1,
      "body": "@bob 请确认这个金额是否包含税费",
      "created_by": {
        "id": 5,
        "username": "alice"
      },
      "created_at": "2026-06-05T10:20:00+08:00",
      "mentions": [
        {
          "id": 9,
          "username": "bob"
        }
      ]
    }
  ]
}
```

### 10.5 新增回复

```text
POST /api/v1/comment-threads/{thread_id}/comments/
```

请求：

```json
{
  "body": "已确认，包含税费。",
  "mention_user_ids": []
}
```

### 10.6 解决与重新打开

```text
PATCH /api/v1/comment-threads/{thread_id}/resolve/
PATCH /api/v1/comment-threads/{thread_id}/reopen/
```

resolve 请求可选：

```json
{
  "resolution_note": "已按财务回执更新为含税金额"
}
```

建议后端创建一条 system comment：

```text
alice 标记为已解决：已按财务回执更新为含税金额
```

### 10.7 标记已读

```text
PATCH /api/v1/comment-threads/{thread_id}/read/
```

作用：

- 更新 `CommentReadState.last_read_at`。
- 当前视图下次刷新时未读标记消失。

### 10.8 删除或撤回评论

```text
DELETE /api/v1/comments/{comment_id}/
```

建议：

- 作者可在短时间窗口内撤回，例如 15 分钟。
- owner/admin 可管理删除。
- 使用 soft delete。
- 保留 tombstone。
- 写 AuditLog。

---

## 11. 前端交互设计

### 11.1 表格内信号

当前表格是高密度数据工作台，评论入口应低干扰。

建议单元格状态：

```text
无评论：
  不显示图标。

有 open 评论：
  单元格右上角显示 MessageSquare 图标和数量。

仅有 resolved 评论：
  显示低对比度图标，hover 或选中时更明显。

有未读：
  图标旁显示小点，或数量使用强调色。

当前选中单元格：
  显示评论按钮，与编辑按钮并列。
```

不建议：

- 每个单元格常驻大按钮。
- hover 时导致单元格布局跳动。
- 把完整评论内容放进表格。

### 11.2 行级入口

行级评论可以放在实体列附近：

- `EntityIdChip` 旁显示行级评论标记。
- 或在选择列/实体列之间增加紧凑图标。

点击后打开 row anchor 的评论面板。

### 11.3 右侧评论 Drawer

建议复用当前项目已有的右侧抽屉模式。

Drawer 内容结构：

```text
标题：评论

锚点信息：
  字段：金额
  实体：EMP-001
  当前值：1300
  创建时值：1200
  创建时日期：2026-06-05
  状态：值已变化

Open threads:
  Thread #42
    Alice: @Bob 请确认这个金额是否包含税费
    Bob: 已确认，包含税费
    [标记解决]

Resolved:
  Thread #31
    ...

回复框：
  输入内容
  @协作者
  [发送]
```

当从表格点击评论图标时：

- 表格高亮对应单元格。
- Drawer 打开并自动展示对应 anchor 的线程。
- 如果没有线程，直接显示新建评论输入框。

### 11.4 新建评论流程

用户路径：

1. 选中单元格。
2. 点击评论图标。
3. 右侧打开评论 Drawer。
4. 输入评论。
5. 可选择 @ 协作者。
6. 点击发送。
7. 表格该单元格出现 open 评论标记。

### 11.5 解决评论流程

用户路径：

1. 打开线程。
2. 查看上下文和回复。
3. 点击“标记解决”。
4. 可填写解决说明。
5. 线程进入 resolved。
6. 表格标记降级或消失，取决于是否展示 resolved。

### 11.6 未读处理

建议：

- 打开线程详情后自动标记已读。
- 也可提供“全部标记已读”。
- 未读只对参与者、被 @ 用户、线程创建者强调。

### 11.7 @ 协作者

候选用户：

- 表 owner。
- shared 表协作者。
- 管理员可选。

候选信息：

```text
username
role
是否在职 / 是否可用
```

第一期可以通过简单的下拉选择实现，不必做复杂富文本 @ 输入。

---

## 12. 与 ChangeSet 的关系

评论不应进入 ChangeSet，因为评论不是业务数据变更。

但评论必须服务 ChangeSet 流程。

### 12.1 当前推荐边界

```text
业务数据变化：ChangeSet / ChangeEntry
协作讨论：CommentThread / Comment
审计记录：AuditLog
```

### 12.2 提交草稿时

当用户提交 ChangeSet 时：

- 如果相关实体/字段存在 open 评论，提交弹窗提示。
- 提示不强制阻止提交。
- 后续可配置“有 open 评论不得提交”。

提示示例：

```text
本批次涉及 4 条仍未解决的评论：
- 金额：2 条
- 生效日期：1 条
- 行级问题：1 条

继续提交后，审批人仍可看到这些评论。
```

### 12.3 审批驳回时

第二期建议支持：

- 审批人可在 ChangeSet Detail 中对某条 `ChangeEntry` 评论。
- 驳回时可选择是否把驳回原因作为评论写入对应 entry。
- 修改人处理后可回复并 reopen/resolve。

### 12.4 应用 ChangeSet 后

当数据已被应用：

- cell/row 评论继续跟着实体/字段走。
- 如果该字段值被 ChangeSet 改过，线程上下文显示“此字段已由 ChangeSet #123 修改”。
- `changeset_entry` 评论留在变更详情中，作为审批复盘信息。

---

## 13. 与 Workbench 的关系

Workbench 是知识库和个人工作流，评论是数据现场协作。

### 13.1 不建议复用 WorkbenchItem 作为评论模型

原因：

- WorkbenchItem 粒度太重。
- 评论需要高频回复、未读、@、解决状态。
- Workbench 列表会被大量短评论污染。
- 表格内评论 summary 需要高性能聚合。

### 13.2 建议轻连接

后续支持：

- 评论线程一键沉淀为 Workbench Note。
- Workbench 表 drawer 展示当前表 open 评论摘要。
- Workbench Note 可以链接到某个 comment thread。

示例：

```text
评论线程 #42
  -> 转为 Workbench Note
  -> Note 标题：金额字段确认记录 - EMP-001
  -> Note 内容：线程摘要 + 原始评论链接
```

### 13.3 表级长讨论仍走 Workbench

如果讨论内容是：

- 表结构设计。
- 业务规则。
- 导入规范。
- 材料准备。

优先使用 Workbench Note 或 Material Checklist。

如果讨论内容是：

- 某行某字段是否正确。
- 某条变更为何被驳回。
- 某个具体值待确认。

优先使用 CommentThread。

---

## 14. 权限设计

### 14.1 查看权限

基础规则：

```text
能查看 schema 的用户，才能查看该 schema 下评论。
```

即基于：

- owner
- admin
- shared collaborator
- public viewer

### 14.2 评论权限

推荐 MVP：

```text
admin / owner / editor:
  可创建评论、回复、解决、重新打开。

viewer:
  可创建评论、回复。
  不可解决他人线程。
  可解决自己创建且无人回复的线程，是否开放可由产品决定。
```

这样 viewer 能反馈问题，不需要数据编辑权。

### 14.3 删除权限

建议：

```text
作者：
  可在 15 分钟内撤回自己的评论。

owner / admin：
  可删除不当评论。

editor：
  默认不可删除他人评论。
```

删除采用 soft delete，保留审计。

### 14.4 字段可见性

如果用户无权查看字段值：

保守策略：

- 不显示该字段评论入口。
- 不返回该字段线程正文。
- 不返回 `value_snapshot`。
- 当前视图 summary 不包含该字段评论计数。

中间策略：

- 显示“此字段存在受限讨论”。
- 不显示正文和字段值。

MVP 推荐保守策略，减少泄露风险。

### 14.5 public 表

当前 public 表仍在登录用户体系下。

建议：

- 登录用户按 viewer 规则可评论。
- 如果未来支持匿名访问，则匿名不能评论。
- public 表的评论默认对所有可见用户可见，除非后续引入私密线程。

---

## 15. 审计设计

评论不是业务变更，但仍应记录关键动作。

建议写入 AuditLog 的动作：

```text
comment.thread.create
comment.reply.create
comment.thread.resolve
comment.thread.reopen
comment.comment.delete
comment.mention.create
```

可不审计的动作：

```text
comment.read
```

敏感条件：

- schema 含敏感字段。
- 评论关联脱敏字段。
- 评论删除。
- 评论导出。

审计 detail 示例：

```json
{
  "schema_id": 3,
  "anchor_type": "cell",
  "entity_id": 100,
  "field_key": "amount",
  "thread_id": 42,
  "mentioned_user_ids": [9]
}
```

---

## 16. 通知与待办

评论的价值在于闭环，因此必须有待办路径。

### 16.1 MVP 待办

第一期可先做轻量待办：

- 当前表筛选“提到我的评论”。
- 当前表筛选“未读评论”。
- 当前表筛选“open 评论”。

### 16.2 第二期通知中心

建议新增：

```text
我的评论待办
  - 提到我的
  - 我创建但未解决
  - 我参与且有新回复
  - 长期未解决
```

通知触发：

- 被 @。
- 参与的线程有新回复。
- 线程被解决。
- 线程被重新打开。

### 16.3 不建议第一期做实时

不需要 WebSocket。

第一期可以：

- 手动刷新。
- TanStack Query 轮询。
- 切换页面时刷新。

---

## 17. 搜索与筛选

### 17.1 表格搜索

默认不把评论内容混入当前表格数据搜索。

原因：

- 用户搜索表格通常是在搜数据值。
- 评论搜索结果可能让用户误以为数据中存在该文本。

推荐做独立开关：

```text
包含评论内容
```

### 17.2 评论筛选

建议第二期支持：

```text
有 open 评论的行
有未读评论的行
提到我的评论
我参与过的评论
指定字段有评论
resolved 评论
```

### 17.3 评论全文搜索

建议单独 API：

```text
GET /api/v1/schemas/{schema_id}/comments/search/?q=
```

返回线程列表，而不是直接返回单条评论。

---

## 18. 性能设计

### 18.1 当前视图 summary 批量聚合

Current View 当前已有分页和虚拟滚动。

评论 summary 应基于当前页 records 批量聚合：

```text
records -> entity_ids -> CommentThread aggregate -> attach to serialized records
```

不要在前端对每个可见单元格单独请求。

### 18.2 索引

必须有：

```text
schema_id + anchor_type + entity_id + field_key + status
schema_id + last_activity_at
thread_id + created_at
user_id + last_read_at
mention user_id
```

### 18.3 评论正文长度

MVP 建议限制：

```text
单条评论 body <= 4000 字符
线程评论数软限制 <= 200
```

如果超出，分页加载评论。

### 18.4 当前页大小

当前视图页大小上限已有控制。评论 summary 只对当前页聚合，不对全表聚合。

如果用户筛选“有 open 评论的行”，后端可先查 comment thread entity ids，再与 current view records 求交集。

---

## 19. 前端实现边界

建议新增前端模块：

```text
frontend/src/api/comments.ts
frontend/src/features/comments/CommentThreadDrawer.tsx
frontend/src/features/comments/CommentThreadList.tsx
frontend/src/features/comments/CommentComposer.tsx
frontend/src/features/comments/commentAnchors.ts
frontend/src/features/current-view/CurrentGridCommentBadge.tsx
```

Current View 改动点：

- `CurrentViewRecord` 类型增加 `comment_summary`。
- `CurrentGrid` 接收评论 summary。
- `EditableCell` 增加评论 badge 与打开入口。
- `CurrentViewPage` 管理 active comment anchor 和 drawer state。

交互状态：

```text
activeCommentAnchor:
  anchor_type
  entity_id
  field_key
  at
  record_id
```

不要把评论 drawer 状态散落在每个 cell 内。

---

## 20. 后端实现边界

建议新增：

```text
backend/apps/comments/
  models.py
  services.py
  selectors.py
  serializers.py
  views.py
  urls.py
  api.py
  permissions.py
  tests/
```

核心 service：

```text
create_thread(user, schema, payload)
add_comment(user, thread, payload)
resolve_thread(user, thread, note)
reopen_thread(user, thread, note)
mark_thread_read(user, thread)
comment_summary_for_records(user, schema, records, fields_config)
```

核心 selector：

```text
visible_threads_for_schema(user, schema)
threads_for_anchor(user, schema, anchor)
thread_detail(user, thread_id)
mentioned_threads(user)
```

不要把创建评论的逻辑直接写在 views 里。

---

## 21. 测试策略

### 21.1 后端测试

建议覆盖：

- 创建 cell thread 成功。
- 创建 row thread 成功。
- 无权限用户不可创建/查看。
- viewer 可评论但不可解决他人线程。
- editor/owner 可解决线程。
- 字段不存在时报错。
- entity 不属于 schema 时报错。
- 脱敏字段用户不可见时不返回评论内容。
- value_snapshot 能正确保存创建时值。
- 当前值变化后 thread context 显示 `value_changed=true`。
- current view summary 聚合 open/resolved/unread。
- mention 创建正确。
- read state 正确影响 unread。
- 删除评论采用 soft delete。
- 审计记录写入。

### 21.2 前端测试

建议覆盖：

- 有 open 评论时显示 badge。
- 未读评论显示未读标记。
- 点击 badge 打开 drawer。
- 新建评论后刷新 summary。
- resolve 后 badge 状态变化。
- 无评论时不显示多余按钮。
- viewer 没有解决按钮。
- 字段值变化提示能展示。

### 21.3 验证级别

第一期是行为新增和共享数据模型新增，属于中高风险改动。

推荐：

- 后端模型和 API 单元测试。
- 前端组件测试。
- 至少一条端到端 smoke：
  - 打开 current view。
  - 对单元格创建评论。
  - 看到 badge。
  - 打开 drawer。
  - 回复。
  - resolve。

---

## 22. 产品指标

建议上线后观察：

### 22.1 使用指标

- 每张表 open 评论数。
- 单元格评论占比。
- 行级评论占比。
- 每日新增线程数。
- 每日新增回复数。
- @提及次数。

### 22.2 闭环指标

- 平均解决时长。
- 7 天以上未解决评论数。
- 被 @ 后首次响应时间。
- resolved 后重新打开比例。

### 22.3 数据质量指标

- 评论解决后产生数据变更的比例。
- 审批驳回中关联评论的比例。
- 有 open 评论的 ChangeSet 提交比例。
- 长期 open 评论集中在哪些字段。

这些指标能帮助判断评论功能是否真正降低数据确认成本，而不是变成装饰性沟通入口。

---

## 23. 完整路线图

### Phase 0：设计确认与边界收敛

目标：

确认产品边界和关键决策。

任务：

- 确认 viewer 是否可发表评论。
- 确认 public 表评论策略。
- 确认脱敏字段评论可见策略。
- 确认是否第一期支持 row + cell，还是只做 cell。
- 确认评论是否允许 markdown-lite。
- 确认评论删除窗口。

输出：

- 最终 PRD。
- 实施计划。
- 数据模型确认。

验收：

- 产品、技术、权限边界无重大歧义。

### Phase 1：表内评论 MVP

目标：

在当前表格中完成单元格/行级评论闭环。

后端任务：

- 新增 `comments` app。
- 新增 `CommentThread`、`Comment`、`CommentMention`、`CommentReadState`。
- 创建 migrations。
- 实现创建 thread。
- 实现 thread 列表与详情。
- 实现新增回复。
- 实现 resolve/reopen。
- 实现 read state。
- 实现 current view comment summary 聚合。
- 接入权限检查。
- 接入基础 AuditLog。
- 添加后端测试。

前端任务：

- 新增 `api/comments.ts`。
- 扩展 `CurrentViewRecord` 类型。
- 当前表格显示评论 badge。
- 实现 row/cell 评论入口。
- 实现 CommentThreadDrawer。
- 实现 CommentComposer。
- 实现 @协作者选择。
- 实现 resolve/reopen UI。
- 实现 unread 展示。
- 添加前端测试或 smoke 验证。

验收：

- 可对单元格创建评论。
- 可对整行创建评论。
- 可回复评论。
- 可 @协作者。
- 可标记解决和重新打开。
- 当前表格能显示 open 评论数量。
- 当前表格能显示未读。
- 无权限用户无法读取或创建。
- 字段值变化后能看到创建时值与当前值差异。

### Phase 2：ChangeSet 与审批协作

目标：

让评论进入变更批次和审批流程。

后端任务：

- 支持 `changeset_entry` anchor。
- ChangeSet detail API 返回相关评论 summary。
- 提交 ChangeSet 时返回 open comment warning。
- 审批驳回时可创建关联评论。
- 实现 `mentioned_me`、`unread` 列表 API。

前端任务：

- ChangeStreamPanel 中显示 entry 评论入口。
- 批次提交弹窗显示 open 评论警告。
- 审批驳回时支持关联评论。
- 当前表筛选“提到我的/未读/open 评论”。
- Dashboard 或独立入口展示我的评论待办。

验收：

- 审批人能对 ChangeEntry 评论。
- 修改人能在同一线程回复。
- 有 open 评论的批次提交时会提示。
- 被 @ 用户能在待办中找到评论。

### Phase 3：通知中心与搜索

目标：

把评论从表内协作扩展为个人待办系统。

任务：

- 实现通知中心入口。
- 评论全文搜索。
- 评论筛选和排序。
- 未读批量标记。
- 长期未解决提醒。
- 评论活动摘要。

验收：

- 用户能跨表查看提到自己的评论。
- 用户能搜索评论内容并定位到表格锚点。
- 用户能看到长期未解决问题列表。

### Phase 4：Workbench 沉淀与治理

目标：

把高价值讨论沉淀为知识资产。

任务：

- 评论线程转 Workbench Note。
- Workbench 表 drawer 展示 open 评论摘要。
- 评论导出。
- 评论健康度指标。
- 管理员查看评论治理报表。

验收：

- 用户能把评论线程沉淀为表级笔记。
- 管理员能看到哪些表/字段有长期未解决讨论。
- 评论可以按权限安全导出。

### Phase 5：智能增强

目标：

在数据量和评论量增长后提高理解效率。

候选能力：

- AI 总结线程。
- AI 提取待办。
- AI 识别重复问题。
- AI 建议相关 ChangeSet。
- AI 提示长期未解决风险。

验收：

- AI 只做辅助总结，不替代权限、审计和人工确认。
- 所有生成内容明确标识为辅助结果。

---

## 24. 关键风险与应对

### 24.1 评论和时态数据关系混乱

风险：

用户不知道评论讨论的是旧值还是当前值。

应对：

- 锚点绑定稳定对象。
- 创建时保存上下文快照。
- 当前值变化时明确提示。

### 24.2 权限泄露

风险：

用户通过评论看到本无权查看的字段值。

应对：

- 字段不可见时不返回对应评论正文。
- 不返回 `value_snapshot`。
- 搜索结果也按权限过滤。

### 24.3 表格性能下降

风险：

每个单元格请求评论导致当前视图变慢。

应对：

- 当前页批量聚合 summary。
- 线程详情按需加载。
- 添加必要索引。

### 24.4 评论沦为闲聊

风险：

评论大量堆积，没有闭环。

应对：

- 强制线程状态。
- 默认突出 open。
- 提供“我的待办”。
- 统计长期未解决。

### 24.5 与 Workbench 重叠

风险：

用户分不清评论和笔记。

应对：

- 评论用于具体数据锚点和短协作。
- Workbench 用于表级知识和资料沉淀。
- 后续提供“评论转笔记”。

---

## 25. 决策清单

实施前需要确认：

1. viewer 是否允许创建评论。
2. viewer 是否允许解决自己创建的线程。
3. public 表评论是否对所有登录用户开放。
4. 字段不可见时，是隐藏评论还是显示受限提示。
5. MVP 是否同时支持 row 和 cell。
6. 是否支持 markdown-lite。
7. 评论删除窗口是 15 分钟还是其他值。
8. resolve 是否必须填写解决说明。
9. ChangeSet 关联评论是否进入 Phase 1 或 Phase 2。
10. 评论是否进入导出能力，若进入应放在 Phase 4。

推荐默认：

```text
viewer 可评论，不可解决他人线程。
public 登录用户可评论。
字段不可见时隐藏评论正文和上下文。
MVP 同时支持 row 和 cell。
第一期 plain text，第二期 markdown-lite。
作者 15 分钟内可撤回。
resolve 说明可选。
ChangeSet 关联评论放 Phase 2。
评论导出放 Phase 4。
```

---

## 26. 初版实施顺序建议

如果进入开发，推荐顺序：

1. 后端建模和迁移。
2. 后端 service 层实现 anchor 校验。
3. 后端 thread CRUD 与权限测试。
4. current view summary 聚合。
5. 前端 API 类型。
6. CurrentGrid badge。
7. CommentThreadDrawer。
8. 新建/回复/resolve/reopen。
9. unread/read state。
10. @协作者。
11. 审计。
12. 整体验证。

不要先做复杂 UI，再补权限和模型。评论功能的风险主要在数据边界和权限，不在视觉按钮。

---

## 27. 推荐最终方案

最终推荐：

> 新增独立 `comments` 模块，把表内评论设计为多锚点 `CommentThread`。第一期支持单元格和行级评论，线程绑定稳定对象并保存创建时上下文快照。评论不进入 `data_payload` 和 ChangeSet，但可在第二期关联 ChangeSet Entry。Workbench 作为后续知识沉淀入口，不作为评论底层模型。

这条路线能同时满足：

- 表格内低摩擦协作。
- 数据上下文追溯。
- 权限安全。
- 审计感。
- 审批协作扩展。
- 工作台知识沉淀。

也符合 ChronoTrace 的产品气质：

> 有审计感的时间机器式数据工作台，而不是普通表格批注工具。
