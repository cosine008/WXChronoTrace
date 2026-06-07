# ChronoTrace · 数据版本与演进管理平台

**需求规格与技术方案 (SRS + Tech Spec)**

版本：v1.0 (Grill 封版)
日期：2026-06-01
替代：`数据版本与演进管理平台_需求分析与实现方案.md`（保留为历史参考）

---

## 目录

1. [产品概述](#1-产品概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [数据模型](#3-数据模型)
4. [功能规格](#4-功能规格)
5. [权限、隔离与审计](#5-权限隔离与审计)
6. [性能、部署与运维](#6-性能部署与运维)
7. [技术栈](#7-技术栈)
8. [API 设计](#8-api-设计)
9. [开发路线图](#9-开发路线图)
10. [附录](#10-附录)
11. [视觉设计规范 (Nothing Design 应用)](#11-视觉设计规范-nothing-design-应用)

---

## 1. 产品概述

### 1.1 一句话定位

**面向中小型组织（20-30 人起步，支持扩展）的"数据版本管理平台"**：管理员/业务骨干可在前台自助建表，所有表数据随时间演化可追溯，任意时间点可回溯、可导出、可统计；不同业务负责人数据隔离、共享可控、操作留痕。

### 1.2 目标用户

| 角色                  | 占比     | 主要行为                       |
| ------------------- | ------ | -------------------------- |
| **系统管理员**           | 1-2 人  | 账号管理、全局审计、表移交、结构性破坏操作、备份恢复 |
| **建表员 / 业务 owner**  | 5-10 人 | 新建表、设计字段、维护数据、分享协作         |
| **协作者 editor**      | 若干     | 在被邀请的表上录入、修改数据             |
| **协作者 viewer / 全员** | 全部     | 查看共享/公共表，导出、检索             |

### 1.3 典型场景

- **固定资产清单**（连续型）：IT 小组 3 人协同维护单位所有设备；随时登记入库、调拨、维修、报废；年终盘点时回溯任意月份状态。
- **社保 / 医保清单**（周期型）：HR 实时登记入离职、调基，月末对账；任意月份回溯全员基数；导出当月表对账 / 报送。
- **未来扩展**：合同清单、软件授权清单、部门字典、职位字典……由业务方自助建表，无需开发介入。

### 1.4 核心需求

| 需求          | 说明                           |
| ----------- | ---------------------------- |
| **前台自助建表**  | 无需改代码、无需 DB migration，前台拖拽即建 |
| **时间轴回溯**   | 任意时间点能看到数据快照                 |
| **变更可追溯**   | 每次修改归属于一个"变更批次"，可回滚、可审计      |
| **数据隔离与协作** | 私有 / 共享 / 公共三层模式，支持角色区分      |
| **导入导出**    | Excel 导入带预览、标准 Excel/CSV 导出  |
| **统计与可视化**  | 时间轴滑块 + 折线柱状趋势图              |

### 1.5 非目标（明确不做）

- ❌ SaaS 多租户（仅服务单一组织）
- ❌ 对外独立 OpenAPI（仅内部 API 自动文档）
- ❌ 流程引擎式审批（仅表级简单审批开关）
- ❌ 富文本 / 附件 / 公式字段（MVP 不做）
- ❌ 双屏 Diff / 地铁线路图 / 桑基图（二期再做）
- ❌ 读写分离 / 分库分表 / K8s（规模永远用不上）

---

## 2. 核心概念与术语

建立一致的词汇表，所有代码、API、UI 文案都沿用：

| 术语          | 英文                 | 释义                                                    |
| ----------- | ------------------ | ----------------------------------------------------- |
| **数据表 / 表** | DataSchema         | 一种业务数据类型的定义（如"固定资产表"），含字段配置、时态模式、可见性、协作者等             |
| **字段**      | Field              | 表中一列，有 key / label / type / 校验规则                      |
| **实体**      | Entity             | 表中"一个事物"的稳定 ID（如一台具体路由器、一位员工）。在整个生命周期保持不变             |
| **时态记录**    | TemporalRecord     | 某个 Entity 在某段有效时间内的一个数据快照。Append-only                 |
| **变更批次**    | ChangeSet          | 一次提交的变更集合（可含多条增改删）。所有变更必须归属于某个 ChangeSet              |
| **当期视图**    | Current View       | 用户选定某个时间点 T，系统合成该时刻所有 Entity 的有效状态                    |
| **变更流视图**   | Change Stream      | 按时间倒序展示 ChangeSet 列表                                  |
| **时态模式**    | Temporal Mode      | 表的时间演化方式：`continuous`（随时变）或 `periodic`（按周期快照）         |
| **有效时间**    | Valid Time         | 数据在现实世界的生效时间段 `[valid_from, valid_to)`                |
| **事务时间**    | Transaction Time   | 数据在系统里被写入 / 修改的时间戳                                    |
| **回溯模式**    | Retrospective Mode | UI 切换到"用当年 Schema 渲染历史数据"的模式                          |
| **终止**      | Terminate          | 给 Entity 的最新 TemporalRecord 设 `valid_to`，等同于"删除"但不物理删 |
| **移交**      | Handover           | 表的 owner 换人（如离职交接）                                    |
| **建表员**     | Table Creator      | 有账号即可建表。建出的表自己是 owner                                 |
| **协作者**     | Collaborator       | 表 owner 邀请的其他用户，角色为 editor 或 viewer                   |

### 2.1 UI 文案 ↔ 代码术语对照

UI 给用户看的是业务词，代码 / API / 文档用精确术语。**不要混淆**：

| UI 文案（给用户看） | 代码 / API / 文档术语                     | 说明                           |
| ----------- | ----------------------------------- | ---------------------------- |
| 草稿          | ChangeSet `status=draft`            | 用户正在编辑、尚未提交的变更批次             |
| 已提交 / 待审核   | ChangeSet `status=submitted`        | 仅当表启用审批时出现                   |
| 已生效 / 已发布   | ChangeSet `status=applied`          | 写入 TemporalRecord，对时间线可见     |
| 已驳回         | ChangeSet `status=rejected`         | 终态                           |
| 已撤销         | ChangeSet `status=reverted`         | 被另一个 ChangeSet revert 推平     |
| 当前（时间点）     | 用户选定的 `at` 查询参数；默认 today            | 不是一个独立的数据库对象                 |
| 历史快照        | `at < today` 时合成的 TemporalRecord 视图 | 只读                           |
| 未来预期        | `at > today` 时合成的视图（基于已登记未来生效变更）    | 只读 + Banner 提示               |
| 回溯模式        | `retro=true` 查询参数                   | 用 at 时刻的 SchemaVersion 渲染字段列 |
| 终止 / 下线     | ChangeEntry `action=terminate`      | 给 TemporalRecord 写 valid_to  |
| 数据集         | DataSchema                          | 一张业务表                        |
| 表主人         | DataSchema.owner                    | 表的拥有者                        |
| 协作者         | TableCollaborator                   | editor / viewer              |
| 共享给我的       | 当前用户作为 collaborator 的 schemas       | —                            |
| 公共表         | `visibility=public`                 | 全员 viewer                    |
| 变更批次        | ChangeSet                           | 代码里也叫 ChangeSet，UI 简称"批次"    |
| 变更明细 / 变更条目 | ChangeEntry                         | 一个 ChangeSet 下的单条变更          |
| 业务编号        | Entity.business_code                | 工号 / 资产编号等人眼识别码              |

---

## 3. 数据模型

### 3.1 核心表（5 张）

```
┌─────────────────────┐     ┌──────────────────┐
│   DataSchema        │────<│  Entity          │
│ (表定义 + 版本)      │     │ (实体锚点)        │
└─────────────────────┘     └──────────┬───────┘
         │                             │
         │                             │
         │                   ┌─────────▼─────────┐
         │                   │ TemporalRecord    │
         │                   │ (时态快照,append) │
         │                   └─────────▲─────────┘
         │                             │
         │                             │
┌────────▼──────────────┐    ┌─────────┴─────────┐
│  SchemaVersion        │    │  ChangeSet        │
│ (Schema 版本历史)      │    │ (变更批次)         │
└───────────────────────┘    └───────────────────┘
         ▲                             ▲
         │                             │
         └──────────┬──────────────────┘
                    │
            ┌───────▼────────┐
            │  AuditLog      │
            │ (操作流水)      │
            └────────────────┘
```

### 3.2 DataSchema（表定义）

```python
class DataSchema(models.Model):
    # 标识
    id                  = BigAutoField(primary_key=True)
    schema_code         = CharField(max_length=64, unique=True)  # 稳定业务码,如 'asset_list'
    name                = CharField(max_length=100)              # 显示名 "固定资产表"
    description         = TextField(blank=True)
    icon                = CharField(max_length=50, blank=True)   # lucide 图标名

    # 时态模式
    temporal_mode       = CharField(choices=[('continuous','连续型'),('periodic','周期型')])
    period_unit         = CharField(null=True, choices=[('day','日'),('week','周'),('month','月'),('quarter','季'),('half_year','半年'),('year','年')])

    # 实体标识
    identity_field_key  = CharField(max_length=64)   # 哪个字段作为业务主键显示(如 employee_no)

    # 字段配置 (动态 Schema)
    fields_config       = JSONField()                # 见 3.3
    current_version     = IntegerField(default=1)    # 当前 Schema 版本号
    config_migrated_at  = DateTimeField(auto_now=True)

    # 权限
    owner               = ForeignKey(User, on_delete=PROTECT)
    visibility          = CharField(choices=[('private','私有'),('shared','共享'),('public','公共')])
    approval_required   = BooleanField(default=False)  # 表级审批开关

    # 审计
    created_at          = DateTimeField(auto_now_add=True)
    created_by          = ForeignKey(User, related_name='+', on_delete=PROTECT)
    is_archived         = BooleanField(default=False)  # 软归档,不再出现在默认列表

    class Meta:
        indexes = [
            Index(fields=['owner','visibility']),
            Index(fields=['schema_code']),
        ]
```

### 3.3 fields_config JSON 结构

每个字段的配置示例（MVP 10 种字段类型 + auto-number）：

```json
[
  {
    "key": "employee_no",
    "label": "工号",
    "type": "text",
    "required": true,
    "indexed": true,
    "validators": {"min_length": 1, "max_length": 32},
    "deprecated": false,
    "introduced_in_version": 1
  },
  {
    "key": "social_base",
    "label": "社保基数",
    "type": "number",
    "required": true,
    "indexed": true,
    "validators": {"min": 0, "max": 30000, "decimals": 2},
    "introduced_in_version": 1
  },
  {
    "key": "status",
    "label": "状态",
    "type": "enum",
    "required": true,
    "validators": {"options": ["在用","维修","报废"]},
    "introduced_in_version": 1
  },
  {
    "key": "owner_dept",
    "label": "所属部门",
    "type": "reference",
    "validators": {"target_schema": "dept_dict"},
    "introduced_in_version": 1
  }
]
```

**支持的字段类型**（MVP）：
`text` · `longtext` · `number` · `date` · `datetime` · `boolean` · `enum` · `multi-enum` · `person` · `reference` · `auto-number`

**字段属性共同字段**：`key`（不可改）、`label`、`type`（不可改）、`required`、`indexed`、`validators`、`deprecated`、`introduced_in_version`、`deprecated_in_version`（可选）。

### 3.4 SchemaVersion（Schema 版本历史）

用于**回溯模式**——查询历史数据时渲染当年的字段结构。

```python
class SchemaVersion(models.Model):
    schema        = ForeignKey(DataSchema, on_delete=CASCADE, related_name='versions')
    version       = IntegerField()                # 自增版本号
    fields_config = JSONField()                   # 此版本时的字段配置快照
    changelog     = TextField(blank=True)         # "新增字段 xxx" / "废弃字段 yyy"
    created_at    = DateTimeField(auto_now_add=True)
    created_by    = ForeignKey(User, on_delete=PROTECT)

    class Meta:
        unique_together = [('schema','version')]
```

**规则**：

- 任何 `fields_config` 的结构性变更（增字段、改类型、改校验、标记废弃）都会 +1 版本并写入 SchemaVersion
- 纯 label 修改 **不** 产生新版本（label 是展示层）
- TemporalRecord 记录它写入时基于的 `schema_version`

### 3.5 Entity（实体锚点）

```python
class Entity(models.Model):
    id             = BigAutoField(primary_key=True)
    schema         = ForeignKey(DataSchema, on_delete=PROTECT)
    business_code  = CharField(max_length=128, db_index=True)  # 如工号/资产编号,用于人眼识别
    created_at     = DateTimeField(auto_now_add=True)
    created_by     = ForeignKey(User, on_delete=PROTECT)

    class Meta:
        unique_together = [('schema','business_code')]
```

- **id** 是系统内部主键，永远不变
- **business_code** 是人眼识别码（用户在 identity_field 填的值）。如果用户改了这个字段，Entity 不变，只是新 TemporalRecord 里字段值变了；business_code 字段跟随最新值更新用于快速查找

### 3.6 TemporalRecord（时态记录，核心引擎）

```python
class TemporalRecord(models.Model):
    id              = BigAutoField(primary_key=True)
    entity          = ForeignKey(Entity, on_delete=CASCADE, related_name='records')
    schema_version  = IntegerField()          # 写入时的 schema 版本

    # 业务数据
    data_payload    = JSONField()             # 按 fields_config 存 {key: value}

    # 时态控制
    valid_from      = DateField()
    valid_to        = DateField(null=True)    # null = 至今仍有效

    # 事务时间 & 变更归属
    change_set      = ForeignKey('ChangeSet', on_delete=PROTECT)
    recorded_at     = DateTimeField(auto_now_add=True)  # 事务时间
    recorded_by     = ForeignKey(User, on_delete=PROTECT)

    # 软删 / 超越
    is_superseded   = BooleanField(default=False)  # 后续 Revert 或修正后置为 True
    superseded_by   = ForeignKey('self', null=True, on_delete=SET_NULL)

    class Meta:
        indexes = [
            Index(fields=['entity','valid_from']),
            Index(fields=['entity','-valid_from']),
            # JSONB GIN (见迁移脚本)
        ]
        constraints = [
            CheckConstraint(check=Q(valid_to__isnull=True) | Q(valid_to__gt=F('valid_from')),
                            name='valid_range_ok'),
        ]
```

**时态语义（α 模式）**：

- 用户屏幕上只看到"当前正确的时间线"（`is_superseded=False` 的记录）
- 修正历史时：旧记录 `is_superseded=True`，新记录覆盖，两者都保留
- 审计日志里可查"曾经是什么"

### 3.7 ChangeSet（变更批次）

```python
class ChangeSet(models.Model):
    id                 = BigAutoField(primary_key=True)
    schema             = ForeignKey(DataSchema, on_delete=PROTECT)
    summary            = CharField(max_length=200)          # "2024-05 月度社保调整"

    status             = CharField(choices=[
                            ('draft','起草中'),
                            ('submitted','已提交'),
                            ('approved','已审批'),
                            ('rejected','已驳回'),
                            ('applied','已生效'),
                            ('reverted','已撤销'),
                         ])

    # 审批
    approval_required  = BooleanField(default=False)
    approver           = ForeignKey(User, null=True, related_name='+', on_delete=SET_NULL)
    approved_at        = DateTimeField(null=True)
    rejected_reason    = TextField(blank=True)

    # 时间线
    created_at         = DateTimeField(auto_now_add=True)
    created_by         = ForeignKey(User, on_delete=PROTECT)
    applied_at         = DateTimeField(null=True)   # 事务时间:系统生效时刻

    # Revert
    revert_of          = ForeignKey('self', null=True, related_name='reverted_by_sets', on_delete=SET_NULL)

    # 导入来源
    source             = CharField(choices=[('manual','手工'),('excel','导入'),('api','API')],
                                   default='manual')

    class Meta:
        indexes = [Index(fields=['schema','-applied_at'])]


class ChangeEntry(models.Model):
    """ChangeSet 下的单条变更明细"""
    change_set     = ForeignKey(ChangeSet, on_delete=CASCADE, related_name='entries')
    entity         = ForeignKey(Entity, on_delete=PROTECT)
    action         = CharField(choices=[('create','新增'),('update','修改'),('terminate','终止')])

    data_before    = JSONField(null=True)   # 变更前快照(update/terminate 才有)
    data_after     = JSONField(null=True)   # 变更后快照(create/update 才有)
    valid_from     = DateField()
    valid_to       = DateField(null=True)

    new_record     = ForeignKey(TemporalRecord, null=True, on_delete=SET_NULL, related_name='+')
```

### 3.8 AuditLog（操作日志）

```python
class AuditLog(models.Model):
    id            = BigAutoField(primary_key=True)
    actor         = ForeignKey(User, on_delete=PROTECT)
    action        = CharField(max_length=64)   # login / schema.create / data.export / ...
    target_type   = CharField(max_length=32)   # schema / entity / changeset / user / ...
    target_id     = BigIntegerField(null=True)
    detail        = JSONField(default=dict)    # 操作参数摘要
    is_sensitive  = BooleanField(default=False)
    ip_address    = GenericIPAddressField(null=True)
    created_at    = DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            Index(fields=['actor','-created_at']),
            Index(fields=['target_type','target_id']),
            Index(fields=['is_sensitive','-created_at']),
        ]
        # 约束:不可修改,不可删除 - 通过 DB 级触发器保证
```

### 3.9 辅助表

```python
class TableCollaborator(models.Model):
    """shared 表的协作者名单"""
    schema   = ForeignKey(DataSchema, on_delete=CASCADE, related_name='collaborators')
    user     = ForeignKey(User, on_delete=CASCADE)
    role     = CharField(choices=[('editor','编辑者'),('viewer','查看者')])
    added_at = DateTimeField(auto_now_add=True)
    added_by = ForeignKey(User, related_name='+', on_delete=PROTECT)

    class Meta:
        unique_together = [('schema','user')]


class UserProfile(models.Model):
    """扩展 User 信息"""
    user         = OneToOneField(User, on_delete=CASCADE)
    display_name = CharField(max_length=64)
    is_active    = BooleanField(default=True)  # 离职置 False
    left_at      = DateField(null=True)
```

### 3.10 索引策略

- `TemporalRecord.entity + valid_from`（时态查询主索引）
- `TemporalRecord.data_payload` **GIN** 索引（JSONB 通用查询）
- 按字段 `indexed: true` 的字段建**表达式索引**：
  
  ```sql
  CREATE INDEX idx_asset_brand
  ON temporal_record ((data_payload->>'brand'))
  WHERE schema_id = <asset_schema_id>;
  ```
- `AuditLog` 按 `actor / target / is_sensitive` 建复合索引

---

## 4. 功能规格

### 4.1 账号与登录

#### 4.1.1 账号模型

- 使用 Django 自带 `auth.User` + `UserProfile` 扩展
- 所有账号由系统管理员在后台创建（MVP 不做自助注册）
- 离职：`UserProfile.is_active=False` + `left_at` 填入日期；账号保留，不删除（历史引用完整）

#### 4.1.2 登录

- 账号 + 密码
- 登录失败 5 次锁定 15 分钟（防爆破）
- 登录成功后 AuditLog 记录 `login` 事件 + IP
- 会话过期：默认 8 小时；"记住我" 7 天

#### 4.1.3 非目标

- ❌ SSO / OAuth / LDAP 对接（MVP 不做，二期可加）
- ❌ 双因子认证
- ❌ 自助注册 / 找回密码（管理员重置）

---

### 4.2 表管理（DataSchema）

#### 4.2.1 建表入口

- 菜单栏 `我的表` → 右上角 `+ 新建表`
- 所有登录用户都能建表，创建者自动成为 owner

#### 4.2.2 建表向导（5 步）

```
Step 1 · 基本信息
  · 表名称        [固定资产表            ]
  · 唯一码 (自动) [asset_list           ]  ← 根据名称生成 pinyin,可修改
  · 图标          [📦 下拉选 lucide 图标]
  · 描述          [多行文本                ]

Step 2 · 时态模式
  ○ 随时会有变动(如设备进出、员工异动)       [推荐,已选中]
     → 底层 continuous 模式,UI 用连续时间轴
  ○ 每隔一段时间更新一批(如月度社保、年度盘点)
     → 底层 periodic 模式,选择周期:
        [ 月 ▼ ] / 季 / 年

  ⚠ 提示:时态模式 MVP 阶段一旦选定不可修改

Step 3 · 字段设计
  (卡片式编辑器,见 4.3)
  · 左侧:字段列表 (可拖拽排序)
  · 右侧:选中字段的属性面板
  · 底部:实时预览

  [+ 添加字段]  [从模板导入…]

Step 4 · 实体标识
  从上一步的字段中选一个作为"业务主键":
  [ 工号 ▼ ]  ← 用于人眼识别,不同于系统 ID

Step 5 · 可见性与审批
  可见性:
    ○ 私有 (private) - 仅自己可见
    ○ 共享 (shared) - 指定协作者可见    [展开协作者名单]
    ○ 公共 (public) - 全员只读

  审批:
    ☐ 此表启用 ChangeSet 审批 (默认关)
```

#### 4.2.3 表设置页

已建好的表，owner 可在"表设置"修改：

- 基本信息、图标、描述
- 可见性（private ↔ shared ↔ public）
- 协作者名单（editor/viewer）
- 审批开关 + 审批人白名单
- 字段配置（走 Schema 演化流程，见 4.3.3）
- 归档表（`is_archived=True`，不在默认列表但数据保留）

#### 4.2.4 移交（Handover）

- 入口：表设置 → 高级 → `移交 owner`
- 操作者：**仅系统管理员**（MVP 不让原 owner 自己移交，避免越权）
- 流程：选择新 owner → 确认 → 原 owner 从协作者中移除（α 方案）
- 历史 ChangeSet 的 `created_by` 不改（历史事实保留）
- AuditLog 打敏感标记

#### 4.2.5 表列表页

- 默认显示当前用户有权访问的所有表（private owned + shared 协作 + public）
- 左侧分组：`我拥有的` / `共享给我的` / `公共表` / `已归档`
- 每张表卡片显示：名称、图标、时态模式标签、行数、最后变更时间
- 支持搜索、排序、收藏

---

### 4.3 字段与 Schema 演化

#### 4.3.1 字段卡片编辑器（建表时 & 改表时）

```
┌─ 字段列表 ──────────┐  ┌─ 属性面板 ─────────────────┐
│ ≡ 工号 · text      │  │ 字段 key:    employee_no   │
│ ≡ 姓名 · text      │  │ 显示名:      [工号        ] │
│ ≡ 部门 · reference │  │ 类型:        text (锁定)   │
│ ≡ 社保基数 · number│  │ ☑ 必填                     │
│ ≡ 入职日期 · date  │  │ ☑ 参与索引(本表已用 2/5)   │
│                     │  │                            │
│ [+ 添加字段]         │  │ 校验规则:                  │
│                     │  │   最小长度: [1         ]   │
│                     │  │   最大长度: [32        ]   │
└─────────────────────┘  └────────────────────────────┘

┌─ 实时预览 ──────────────────────────────────────────┐
│ 工号*  姓名*  部门  社保基数*  入职日期             │
│ [    ] [    ] [▼ ] [        ] [📅]                 │
└────────────────────────────────────────────────────┘
```

#### 4.3.2 字段类型与校验规则表

| 类型            | 存储                 | 可配置校验                                             |
| ------------- | ------------------ | ------------------------------------------------- |
| `text`        | str                | min_length / max_length / regex (仅预设:email/phone) |
| `longtext`    | str                | min_length / max_length                           |
| `number`      | float              | min / max / decimals / positive_only              |
| `date`        | date (ISO)         | min_date / max_date / not_future / not_past       |
| `datetime`    | datetime (ISO UTC) | min_date / max_date / not_future / not_past       |
| `boolean`     | bool               | —                                                 |
| `enum`        | str                | options: [...]                                    |
| `multi-enum`  | [str]              | options: [...], min_count / max_count             |
| `person`      | user_id            | must_be_active                                    |
| `reference`   | entity_id          | target_schema (必填), filter (可选)                   |
| `auto-number` | str                | prefix / padding / sequence_reset_period          |

通用校验：`required` · `indexed`

#### 4.3.3 Schema 演化规则（C+A 混合）

| 操作                  | 前台  | 管理员后台 | 影响                                    |
| ------------------- | --- | ----- | ------------------------------------- |
| 新增字段                | ✅   | ✅     | SchemaVersion +1；老数据该字段默认空（UI 显示 `—`） |
| 修改 label            | ✅   | ✅     | **不产生新版本**（label 是展示层）                |
| 修改校验规则              | ✅   | ✅     | SchemaVersion +1；新规则仅对新写入生效；老数据不回校验   |
| 调整字段排序              | ✅   | ✅     | 不产生新版本                                |
| 标记字段废弃 (deprecated) | ✅   | ✅     | SchemaVersion +1；新录入**仍显示但标灰**（γ 方案）  |
| 删除字段（物理移除配置）        | ❌   | ✅     | 历史数据里仍保留该字段值                          |
| 修改字段 key            | ❌   | ✅     | 旧数据失联，需管理员走迁移脚本                       |
| 修改字段 type           | ❌   | ✅     | 同上                                    |

任何结构性变更自动写 SchemaVersion 记录。

#### 4.3.4 回溯模式（Retrospective Mode）

- 默认查看数据时**用最新 Schema 渲染**：老数据缺字段显示 `—`，废弃字段标灰显示
- UI 右上角开关：`回溯模式`。开启后：
  - 选择时间点 T → 用 T 时刻最新的 SchemaVersion 渲染字段列
  - 表格列名、列顺序、字段类型都回到当年样子
  - 导出 Excel 时标题行也按当年 Schema

---

### 4.4 数据录入

#### 4.4.1 三种录入入口

| 入口              | 场景                | 触发              |
| --------------- | ----------------- | --------------- |
| **A. 当期视图直编**   | 日常零散改动，类 Excel 体验 | 在表格单元格双击编辑      |
| **B. 批量变更登记**   | 月末盘点、集中调整         | 顶部按钮 `批量登记`     |
| **C. Excel 导入** | 首次上线、大批量（>20 行）   | 顶部按钮 `导入 Excel` |

**统一归宿**：三种入口最终都生成 **ChangeSet**。

#### 4.4.2 当期视图直编（入口 A）

- 用户选定时间点 T（默认今天），表格合成该时刻快照
- 编辑流程：
  1. 点 `编辑模式` 进入草稿态 → 系统创建一个 `draft` ChangeSet
  2. 任意单元格可直接编辑（支持复制粘贴多单元格）
  3. 右上角 `批量操作`：新增行 / 标记终止 / 撤销
  4. 编辑过程中底部悬浮 `草稿变更栏`：显示已改 N 格 / 已新增 M 行 / 已终止 K 行
  5. 点 `提交` → 填 summary + 生效日期 → 转为 `submitted`（如启用审批）或 `applied`（直接生效）
- 默认生效日期 = 当前时间点 T（用户可改）

#### 4.4.3 批量变更登记（入口 B）

专为"我知道要改哪几行"的场景。表单式登记：

```
ChangeSet 登记
─────────────────────────────
摘要:   [2024-05 月度调薪                 ]
生效:   [2024-05-01]  (默认当期首日)

变更条目:
  ├─ [新增] 王五 · 工号 E123 · 基数 8000  [✕]
  ├─ [修改] 张三 · 基数 8000 → 9000       [✕]
  ├─ [终止] 李四 · 离职日 2024-04-30       [✕]
  └─ [+ 添加条目 ▼]  新增 | 修改已有 | 终止

[预览影响]  [暂存草稿]  [提交]
```

#### 4.4.4 Excel 导入（入口 C）

**流程**：

1. 点 `导入 Excel` → 弹出向导
2. **Step 1**：下载模板（系统按当前 Schema 生成 `.xlsx` 模板，含列说明、校验规则注释）
3. **Step 2**：用户上传填好的 Excel
4. **Step 3**：字段映射
   - 默认按列名自动匹配
   - 列名不一致时弹出映射界面（`Excel 的列 A → 系统字段 xxx`）
5. **Step 4**：生效日期设定
   - 默认 `统一使用某日期`（用户输入）
   - 若 Excel 中有 `valid_from` 列，优先使用 Excel 值
6. **Step 5**：预览 Diff
   - 系统比对导入内容 vs 当前视图
   - 显示：新增 X 行、修改 Y 行、Excel 缺失 Z 行
   - 校验失败的行红色高亮（可在预览里修正）
   - **缺失行处理**：用户勾选"一并终止"或"保留不动"（快照型默认终止、连续型默认保留）
7. **Step 6**：填 ChangeSet summary → 确认提交

#### 4.4.5 大批量性能约束

- Excel 单次导入上限 10000 行
- 后端处理同步（<3000 行）/ 异步任务队列（≥3000 行，Celery 可选）
- MVP 用同步 + 前端进度条即可

---

### 4.5 数据查看与回溯

#### 4.5.1 表主视图布局

```
┌──────────────────────────────────────────────────┐
│ 固定资产表  │ [当期视图] [变更流] [统计]  [导出▼] │
├──────────────────────────────────────────────────┤
│ 时间轴滑块  ━━━━━╋━━━━━━━━━━▌░░░░                │
│            2024-01        Now  2026-07            │
│  [◀ 月] [◀ 日]  2026-05-12 [日 ▶] [月 ▶]  [今日]  │
├──────────────────────────────────────────────────┤
│ 🔍 搜索  📎 筛选  ⚙ 列设置   [编辑模式]           │
├──────────────────────────────────────────────────┤
│ 编号 │ 名称 │ 状态 │ 部门 │ 价格 │ 入库 │        │
│ A001 │ ...  │ 在用 │ 研发 │ 5000 │ 2024 │        │
│ ...                                             │
└──────────────────────────────────────────────────┘
```

#### 4.5.2 时间轴滑块（自研组件）

- 过去区段：实线滑轨；未来区段：虚线滑轨
- `Now` 竖线标记当前时刻
- 每个 ChangeSet 在时间轴上是一个可见刻度点（hover 显示摘要）
- 拖动滑块：300ms 防抖后请求数据，表格 / 图表联动更新
- 精度：连续型 = 天；周期型 = 周期单位（日/周/月/季/半年/年）
- 默认范围：过去 3 月 + 未来 1 月；鼠标滚轮缩放
- 拖到未来区：顶部黄色 banner `⚠ 当前查看预期未来状态（基于已登记变更）`

#### 4.5.3 变更流视图

- 按时间倒序展示所有 ChangeSet 列表
- 每条卡片：摘要 / 操作人 / 生效日期 / 条目数（新增X·修改Y·终止Z）
- 点进去看明细：每行 `data_before → data_after` 对比
- 支持筛选：按操作人 / 日期范围 / 关键字
- 顶部按钮 `Revert` (owner / editor 可用，需确认)

#### 4.5.4 单实体生命周期

- 在表格中任意点击一行 → 右侧抽屉弹出
- 时间轴（垂直）显示该 Entity 所有 TemporalRecord：
  - 每个节点：日期 + 操作人 + 变更摘要
  - 点节点展开当时的完整 data_payload
- 抽屉底部 `导出该实体生命周期`

---

### 4.6 ChangeSet 生命周期

#### 4.6.1 状态机

```
   draft ─┬─► submitted ─┬─► approved ──► applied ─┬─► (终态)
          │   (需审批)    │                         │
          │               └─► rejected (终态)       ├─► reverted (终态)
          └─► applied (直接生效,无审批)              │
                                                    │
  (任何 applied 状态可被另一个 ChangeSet 通过 Revert 推平)
```

#### 4.6.2 规则

- **draft**：用户编辑中。私有可见，仅创建者能看、能改。
- **submitted**：提交后等待审批（仅当表开启 approval_required）
- **approved → applied**：审批人点通过 → 系统自动 applied
- **applied**：所有 ChangeEntry 写入 TemporalRecord，生效
- **reverted**：被另一个 ChangeSet revert 推平

#### 4.6.3 applied_at 与 valid_from 的关系

- `applied_at`（事务时间）= 系统真正生效的时刻（不可逆）
- 每个 ChangeEntry 的 `valid_from`（业务时间）可以是过去（补录）、当前或未来（提前登记）
- 示例：5 月 10 日提交 ChangeSet，里面有"张三 5-1 调薪"（补录）和"李四 6-1 离职"（提前登记），两者都合法

#### 4.6.4 Revert 机制

- 选中一个 `applied` 状态的 ChangeSet → 点 `Revert`
- 系统生成一个新的 ChangeSet（source=`revert`），里面的 ChangeEntry 完全反向
- 被 revert 的 ChangeSet 状态改为 `reverted`
- 所有被该 ChangeSet 创建的 TemporalRecord：`is_superseded=True`
- **主时间线干净**：默认不显示被 reverted 的变更（需到 AuditLog / 变更流的"已撤销"筛选里看）

#### 4.6.5 审批

- 表设置开启 `approval_required` 后，所有该表的 ChangeSet 必须指定审批人
- 审批人来源：表的协作者名单（owner 勾选哪些 editor 可作审批人）
- 审批界面：`我的待审批` 导航栏红点提醒
- 审批人查看 ChangeSet 完整明细（before/after）→ 通过 / 驳回（驳回填理由）
- **审批人 ≠ 创建者**（不能自己批自己）

---

### 4.7 权限模型

#### 4.7.1 三层可见性

| 层级          | 默认可见        | owner 权限   | editor 权限         | viewer 权限        |
| ----------- | ----------- | ---------- | ----------------- | ---------------- |
| **private** | 仅 owner     | 全部         | —                 | —                |
| **shared**  | owner + 协作者 | 全部 + 协作者管理 | 增删改数据（不能改 Schema） | 只读 + 导出          |
| **public**  | 全员          | 全部         | N/A               | N/A（全员自动 viewer） |

**关键补充规则**：

- `shared` 表的 Schema 变更（加字段、改校验等）**仅 owner 能做**
- `public` 表的数据变更仅 owner 能做（其他人只读）
- private → public 升级：任何人可直接升，无需审批（风险自担）
- 系统管理员：拥有所有表的超级权限，用于审计、移交、故障处理

#### 4.7.2 数据隔离实现

**Django ORM 层统一过滤**：

```python
class PermissionManager(models.Manager):
    def for_user(self, user):
        if user.is_superuser:
            return self.all()

        owned  = Q(owner=user)
        shared = Q(visibility='shared', collaborators__user=user)
        public = Q(visibility='public')

        return self.filter(owned | shared | public).distinct()

# 所有视图必须走:
DataSchema.objects.for_user(request.user)
TemporalRecord.objects.for_user(request.user)  # 通过 entity.schema 反查
```

**Code Review 强制规则**：任何直接 `.objects.all()` 或 `.objects.filter()`（不带 `for_user`）的代码必须 review 通过。通过 DRF 的 `ViewSet.get_queryset()` 统一封装。

#### 4.7.3 建表权限

- 任何登录用户都能建表（前置已确认）
- 建出的表自己是 owner
- 系统层无"建表员"白名单，管理简单

---

### 4.8 审计日志

#### 4.8.1 记录范围

| 事件类型                                                                       | 敏感                                         |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| login / logout                                                             | —                                          |
| schema.create / schema.update_fields / schema.archive                      | 仅 schema.update_fields 中的删/改字段 key/type 敏感 |
| schema.visibility_change (private → public)                                | ✅                                          |
| schema.handover                                                            | ✅                                          |
| collaborator.add / collaborator.remove / collaborator.role_change          | —                                          |
| changeset.submit / changeset.approve / changeset.reject / changeset.revert | changeset.revert ✅                         |
| data.export (> 500 行触发敏感标记)                                                | 视行数                                        |
| data.import                                                                | —                                          |
| admin.impersonate (管理员代查他人 private 表)                                      | ✅                                          |

**数据变更本身**由 ChangeSet 的 `data_before/data_after` 覆盖，不重复记录。

#### 4.8.2 不可变约束

- 应用层永不提供 AuditLog 的 Update / Delete 接口
- 数据库层：PostgreSQL 触发器，对 AuditLog 的 UPDATE / DELETE 抛异常（仅 migration 工具例外，由 DBA 手动关闭）

#### 4.8.3 查看权限

- **系统管理员**：全站所有日志
- **表 owner**：自己表关联的所有日志（通过 `target_type='schema' AND target_id=xxx` 或关联 ChangeSet）
- **普通用户**：仅自己作为 `actor` 的日志

#### 4.8.4 敏感操作看板

- 管理员专属页面
- 默认筛选 `is_sensitive=True`，近 30 天
- 支持按类型 / 用户 / 时间筛选
- 可导出供上级审计

---

### 4.9 导出

#### 4.9.1 导出场景（MVP 三种）

| 场景               | 入口                            | 格式          |
| ---------------- | ----------------------------- | ----------- |
| **导出当前视图**       | 表主视图 → 顶部 `导出 ▼ → 当期视图`       | Excel / CSV |
| **导出 ChangeSet** | 变更流 → 某个 ChangeSet → `导出变更明细` | Excel       |
| **导出单实体生命周期**    | 实体抽屉 → `导出生命周期`               | Excel       |

#### 4.9.2 Excel 文件结构

所有导出 Excel 包含至少 2 个 Sheet：

1. **Sheet1：数据**（主内容）
2. **Sheet2：元信息**（系统自动生成，用于事后追溯）

```
Sheet2 · 元信息
─────────────────────────────────
导出时间:      2026-05-12 14:32:01
导出人:        张三 (工号 E001)
表名称:        固定资产表
Schema 版本:   v3
数据时间点:    2026-05-12
数据行数:      1234
回溯模式:      否
筛选条件:      (无)
导出 ID:       EXP-20260512-1432-001
─────────────────────────────────
```

#### 4.9.3 导出权限

- 原则：能在屏幕上看到的，能导出
- 行数 > 500：AuditLog 打敏感标记
- public 表：任何人可导出
- shared 表：editor + viewer 均可导出
- private 表：仅 owner 可导出

---

### 4.10 统计与可视化（MVP 基础）

#### 4.10.1 表级统计卡片

每张表的主视图顶部可展开"统计面板"：

- **数值卡片**：总行数、本月新增、本月修改、本月终止、最近变更时间
- **趋势折线图**：近 12 月（可选近 6 周、近 2 年）的总行数变化
- **分布柱状图**：按用户配置的"统计字段"（enum 类型字段）分组计数
  - 如资产表按 `状态` 分组：在用 / 维修 / 报废
  - 配置在表设置里，默认选前 1-2 个 enum 字段

#### 4.10.2 全局仪表盘

- 登录后默认首页
- 显示用户有权访问的所有表的摘要（卡片墙）
- 最近 30 天全站变更数、活跃用户数、待审批 ChangeSet 数
- 图表使用 ECharts，统一暗色/浅色主题切换

#### 4.10.3 图表实现要点

- 时间序列查询后端一次性返回所有数据点，前端切换时无需重新请求
- 默认时间范围：近 12 月
- 所有图表支持"导出 PNG"按钮（ECharts 内置能力）

#### 4.10.4 MVP 不做

- ❌ 双屏 Diff（二期）
- ❌ 地铁线路图（二期，等 1 年数据沉淀）
- ❌ 桑基图（二期）
- ❌ 自定义报表引擎

---

（续见下一轮：第 5-7 章）

---

## 5. 权限、隔离与审计

本章是第 4.7 / 4.8 节的补充总纲，列出**跨模块**的安全约束。

### 5.1 隔离原则

| 级别          | 实现                                                            |
| ----------- | ------------------------------------------------------------- |
| **物理隔离**    | 单库单 schema（不分库、不分 PG schema）                                  |
| **逻辑隔离**    | Django ORM 层 `for_user(user)` 统一过滤                            |
| **Code 规范** | ViewSet 的 `get_queryset` 必须走 `for_user`；不允许裸 `.objects.all()` |
| **前端防御**    | API 返回的数据天然不含无权内容；前端不做权限决策，只做 UX 隐藏                           |

### 5.2 跨表引用与权限

- `reference` 字段指向其他表的 Entity。如果当前用户**对被引用的表无权**，在渲染时显示 `—`（隐藏引用值）而不报错
- 查询性能考量：批量 reference 解析使用 `prefetch_related` + 权限过滤

### 5.3 敏感操作清单（AuditLog 打标）

| 操作                                   | 触发条件  |
| ------------------------------------ | ----- |
| 表可见性从 private/shared 升为 public       | 不论谁操作 |
| 表 owner 移交                           | 始终    |
| 管理员查看非自己有权访问的表                       | 始终    |
| ChangeSet Revert                     | 始终    |
| 大批量导出 (>500 行)                       | 始终    |
| Schema 结构性破坏（删字段/改 key/改 type，管理员后台） | 始终    |
| 管理员重置他人密码                            | 始终    |

### 5.4 密码与存储

- 密码使用 Django 内置 `PBKDF2` 哈希
- 数据库连接：强制 SSL（生产环境）
- 磁盘加密：云盘启用服务端加密（阿里云/腾讯云默认即可）
- 会话 Cookie：`HttpOnly` + `Secure` + `SameSite=Lax`

### 5.5 数据合规提示

- 社保 / 医保基数、身份证号、手机号属 PII
- 数据上云要求：
  - 云服务商国内合规区域（不使用境外节点）
  - 数据库传输 SSL
  - 磁盘加密
- 导出 Excel 元信息 Sheet 提供事后溯源能力

---

## 6. 性能、部署与运维

### 6.1 规模假设

| 指标                 | MVP 规模   | 3 年预估   |
| ------------------ | -------- | ------- |
| 并发用户               | 20-30    | 50-80   |
| DataSchema 表数      | 5-10     | 30-50   |
| Entity 数/表         | 100-2000 | ≤5000   |
| TemporalRecord/表/年 | ≤5000    | ≤20000  |
| AuditLog 年增        | ≤50 万条   | ≤200 万条 |
| DB 总大小             | <5 GB    | <50 GB  |

### 6.2 性能策略

| 层        | 策略                                                                    |
| -------- | --------------------------------------------------------------------- |
| **索引**   | `(entity, valid_from)` · GIN on `data_payload` · 字段级表达式索引（indexed 字段） |
| **查询**   | 时态快照查询使用 `DISTINCT ON` + 窗口函数；时间序列统计一次性计算多个时间点                        |
| **缓存**   | MVP 不做；有瓶颈再加 Redis（二期）                                                |
| **分页**   | 所有列表接口强制分页，默认 50/页                                                    |
| **单表硬限** | > 2000 行给出性能提示（软性提示，不阻塞）                                              |

### 6.3 索引策略示例

```sql
-- TemporalRecord 时态主索引
CREATE INDEX idx_tr_entity_vfrom ON temporal_record(entity_id, valid_from DESC);

-- JSONB GIN (通用查询)
CREATE INDEX idx_tr_payload_gin ON temporal_record
  USING GIN (data_payload jsonb_path_ops);

-- 表达式索引(indexed=true 字段,每表最多 5 个,动态建)
-- 例:资产表的 brand 字段
CREATE INDEX idx_tr_asset_brand ON temporal_record
  ((data_payload->>'brand'))
  WHERE entity_id IN (SELECT id FROM entity WHERE schema_id = <asset_id>);
```

### 6.4 部署形态

**MVP（第一阶段）：单机部署**

```
 ┌────────────────────────────────────┐
 │   云服务器 (4c8g)                  │
 │                                     │
 │  Nginx (80/443)  ←── SSL            │
 │    │                                │
 │    ├──> /api/  → Gunicorn (Django)  │
 │    └──> /     → React 静态文件       │
 │                                     │
 │  PostgreSQL 15 (本机, 数据盘加密)    │
 │                                     │
 │  systemd 管理进程                    │
 └────────────────────────────────────┘
```

**二期：Docker Compose 化**

```yaml
services:
  nginx:     ports: [80, 443]
  backend:   django + gunicorn
  frontend:  react build 静态
  db:        postgres:15
  redis:     (如启用缓存)
```

### 6.5 备份策略

| 频率     | 方式                      | 保留     |
| ------ | ----------------------- | ------ |
| **每日** | `pg_dump` 全量，输出到本机备份目录  | 近 30 天 |
| **每周** | 异地备份到管理员电脑 / 外接盘 / 对象存储 | 近 6 个月 |
| **每月** | 归档到冷存储（OSS 低频访问）        | 永久     |
| **演练** | 部署后 3 个月内完成一次"从备份还原"演练  | —      |

**备份脚本示例**（cron / systemd timer）：

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR=/var/backups/chronotrace
pg_dump -U chronotrace -d chronotrace | gzip > $BACKUP_DIR/db_$DATE.sql.gz
# 保留 30 天
find $BACKUP_DIR -name 'db_*.sql.gz' -mtime +30 -delete
```

### 6.6 监控与告警（MVP 轻量）

| 指标       | 工具                                            |
| -------- | --------------------------------------------- |
| 进程存活     | systemd + 简单邮件告警                              |
| 磁盘 / CPU | 云厂商控制台                                        |
| 慢查询      | PostgreSQL `log_min_duration_statement=500ms` |
| 应用错误     | Django logging → 本地文件 + 管理员每周看                |
| Sentry   | 二期接入                                          |

### 6.7 升级与向后兼容

- `fields_config` 结构改动必须**向后兼容**（新字段默认值处理）
- 每次启动自动运行 `schema_config_migrator` 补齐历史 SchemaVersion 缺失字段
- Django Model migration 走标准 `python manage.py migrate`
- 前端静态资源版本化（Vite 自动带 hash）

### 6.8 账号管理运维

- 管理员后台批量创建账号（支持 CSV 导入）
- 新员工入职：管理员手工新增
- 离职：`UserProfile.is_active=False` + `left_at` 填入；其拥有的表走移交流程
- 密码重置：仅管理员可操作

---

## 7. 技术栈

### 7.1 后端

| 组件                    | 版本    | 用途                           |
| --------------------- | ----- | ---------------------------- |
| Python                | 3.11+ | —                            |
| Django                | 5.x   | Web 框架                       |
| Django REST Framework | 3.14+ | API                          |
| drf-spectacular       | 最新    | OpenAPI 自动文档                 |
| PostgreSQL            | 15+   | 数据库（JSONB / GIN / DateRange） |
| psycopg               | 3.x   | PG 驱动                        |
| openpyxl              | 最新    | Excel 处理                     |
| gunicorn              | 最新    | WSGI server                  |
| python-dateutil       | —     | 日期处理                         |
| celery + redis（可选）    | 二期    | 异步任务（大导入）                    |

### 7.2 前端

| 组件                | 版本  | 用途                   |
| ----------------- | --- | -------------------- |
| React             | 18  | 框架                   |
| TypeScript        | 5.x | 语言                   |
| Vite              | 5+  | 构建                   |
| React Router      | 6   | 路由                   |
| Shadcn UI         | —   | 组件库（复制源码到项目）         |
| Tailwind CSS      | 3.x | 样式                   |
| react-hook-form   | 7.x | 表单状态                 |
| zod               | 3.x | 表单校验 + 元数据 schema 基础 |
| TanStack Table    | 8.x | 表格                   |
| TanStack Query    | 5.x | 异步数据                 |
| Zustand           | 4.x | 全局状态                 |
| ECharts           | 5.x | 图表                   |
| echarts-for-react | 最新  | React 包装             |
| axios             | 1.x | HTTP                 |
| date-fns          | 最新  | 日期                   |
| SheetJS (xlsx)    | 最新  | Excel 前端处理           |
| lucide-react      | 最新  | 图标库                  |

### 7.3 元数据驱动表单的核心技术路线

由于放弃 Formily，元数据驱动表单基于 **zod + react-hook-form** 自研渲染器：

```typescript
// 1. 将 fields_config 动态转为 zod schema
function buildZodSchema(fields: FieldConfig[]) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) {
    let s = mapTypeToZod(f.type);
    if (f.validators?.min) s = s.min(f.validators.min);
    if (f.required) s = s.refine(v => v != null);
    else s = s.optional();
    shape[f.key] = s;
  }
  return z.object(shape);
}

// 2. 渲染器根据 fields_config 输出 Shadcn 组件
<DynamicForm
  fields={schema.fields_config}
  defaultValues={record.data_payload}
  onSubmit={handleSubmit}
/>
```

### 7.4 关键自研组件清单

#### 7.4.1 页面级自研组件（功能重）

| 组件                              | 估工    | 复杂度 | 备注                              |
| ------------------------------- | ----- | --- | ------------------------------- |
| 时间轴滑块 (TimelineScrubber)        | 2 周   | 高   | 过去实线/未来虚线/Now 竖线/ChangeSet 刻度点  |
| 动态表单渲染器 (DynamicForm)           | 1 周   | 中   | 基于 zod schema + react-hook-form |
| 字段卡片编辑器 (FieldEditor)           | 1 周   | 中   | 建表向导左列表+右属性面板+实时预览              |
| 当期视图表格 (CurrentGrid)            | 1.5 周 | 高   | TanStack Table + 单元格编辑 + 状态编码   |
| Excel 导入预览 (ImportPreview)      | 1 周   | 中   | 字段映射 + Diff 预览 + 错误修正           |
| ChangeSet 编辑器 (ChangeSetEditor) | 1 周   | 中   | 批量变更登记界面                        |

#### 7.4.2 基础组件（视觉语义层，M0 优先建）

这些是**全站高频复用**的基础语义组件，必须在 M0 阶段先搭好，后续所有业务页面直接用：

| 组件                     | 用途                       | 状态值                                                 |
| ---------------------- | ------------------------ | --------------------------------------------------- |
| **StatusBadge**        | ChangeSet 状态标            | draft / submitted / applied / rejected / reverted   |
| **ChangeBadge**        | Diff 汇总徽章                | `[+ 新增 N]` / `[~ 修改 N]` / `[× 终止 N]` / `[! 失败 N]`   |
| **RowStatusStripe**    | 表格行左侧状态细线                | new（绿）/ modified（黄）/ terminated（红）/ error（红边）       |
| **DataMetric**         | 可点击的统计数字                 | 数值 + 标签 + 点击跳转筛选到明细                                 |
| **DiffCell**           | 字段 before/after 对比       | `<旧值> → <新值>` 颜色编码                                  |
| **MaskedValue**        | 无权限 / 脱敏 / 空值统一展示        | `—` / `无权查看` / `***`（预留）                            |
| **AuditMarker**        | 敏感操作 / 导出 / 权限变更标记       | `[敏感]` 等宽文本标                                        |
| **VersionTimeline**    | 垂直 / 水平时间线（实体生命周期、审计日志）  | 节点状态 + 变化强度                                         |
| **PermissionTag**      | 用户角色 / 表可见性标             | owner / editor / viewer / public / private / shared |
| **TimePointIndicator** | 当前时间点 / 历史 / 未来指示器       | Now / 历史 / 预期                                       |
| **ValidityRange**      | valid_from / valid_to 展示 | `2024-05-01 → 至今` / `2024-01-01 → 2024-05-01`       |
| **EntityIdChip**       | business_code 展示（等宽+可复制） | `E001` / `A2024001`                                 |

**开发约定**：

- 所有基础组件**统一 props 命名**（`variant` / `size` / `className`）
- 全部支持 light / dark 主题（通过 CSS 变量）
- 全部支持 `font-mono` 渲染（数字/ID 场景）
- 独立 Storybook 文档（二期）

#### 7.4.3 布局级组件

| 组件                | 用途                                     |
| ----------------- | -------------------------------------- |
| **AppShell**      | 工作台外框（左导航 + Header + 主区 + 右抽屉）         |
| **PageHeader**    | 面包屑 + 当前数据集 + 时间点 + 主操作按钮              |
| **DetailDrawer**  | 右侧滑出详情面板（实体生命周期 / ChangeSet 详情 / 字段差异） |
| **ConfirmDialog** | 高风险操作确认（public 升级 / Revert / 大批量导出）    |
| **EmptyState**    | 空状态插画 + 引导操作                           |

### 7.5 开发工具链

| 工具                             | 用途          |
| ------------------------------ | ----------- |
| Git                            | 版本控制        |
| pre-commit                     | 提交前 hook    |
| Black / isort / ruff           | Python 规范   |
| ESLint / Prettier              | 前端规范        |
| pytest + pytest-django         | 后端测试        |
| Vitest + React Testing Library | 前端测试        |
| Playwright                     | 端到端测试（关键路径） |

### 7.6 项目目录结构

```
chronotrace/
├── backend/
│   ├── chronotrace/          # Django 项目
│   ├── apps/
│   │   ├── accounts/         # 用户 / 权限
│   │   ├── schemas/          # DataSchema / SchemaVersion / 字段校验
│   │   ├── temporal/         # Entity / TemporalRecord / 时态查询
│   │   ├── changesets/       # ChangeSet / Revert / 审批
│   │   ├── audit/            # AuditLog
│   │   ├── imports/          # Excel 导入导出
│   │   └── stats/            # 统计查询
│   ├── manage.py
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/ui/    # Shadcn 组件源码(复制)
│   │   ├── components/       # 业务组件
│   │   │   ├── timeline/
│   │   │   ├── form/
│   │   │   ├── grid/
│   │   │   └── changeset/
│   │   ├── pages/
│   │   ├── api/              # axios + TanStack Query hooks
│   │   ├── stores/           # Zustand
│   │   ├── lib/              # utils
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── docs/                     # 本文档所在目录
├── deploy/
│   ├── nginx.conf
│   ├── systemd/
│   └── backup.sh
└── README.md
```

---

（续见下一轮：第 8-10 章）

---

## 8. API 设计

### 8.1 风格约定

- **RESTful** 为主，复杂操作允许 RPC 风格
- URL 前缀：`/api/v1/`
- 所有 API 返回 JSON；时间统一 ISO 8601 UTC
- 认证：Session Cookie（前端同域部署）+ CSRF token
- 分页：`?page=1&page_size=50`，响应含 `{results, count, next, previous}`
- 错误：标准 `{error: {code, message, details}}`，HTTP 状态码遵循语义

### 8.2 资源清单

#### 8.2.1 认证

| 方法   | 路径                      | 说明                           |
| ---- | ----------------------- | ---------------------------- |
| POST | `/api/v1/auth/login`    | 登录（body: username, password） |
| POST | `/api/v1/auth/logout`   | 登出                           |
| GET  | `/api/v1/auth/me`       | 当前用户信息 + 权限摘要                |
| POST | `/api/v1/auth/password` | 修改自己密码                       |

#### 8.2.2 用户 / 管理

| 方法    | 路径                                  | 权限         |
| ----- | ----------------------------------- | ---------- |
| GET   | `/api/v1/users/`                    | 登录用户（列表精简） |
| POST  | `/api/v1/users/`                    | 管理员（创建）    |
| PATCH | `/api/v1/users/{id}/`               | 管理员        |
| POST  | `/api/v1/users/{id}/deactivate`     | 管理员（离职）    |
| POST  | `/api/v1/users/{id}/reset_password` | 管理员        |

#### 8.2.3 DataSchema

| 方法     | 路径                                              | 说明                         |
| ------ | ----------------------------------------------- | -------------------------- |
| GET    | `/api/v1/schemas/`                              | 列出有权访问的表                   |
| POST   | `/api/v1/schemas/`                              | 建表                         |
| GET    | `/api/v1/schemas/{id}/`                         | 表详情 + 当前 fields_config     |
| PATCH  | `/api/v1/schemas/{id}/`                         | 改基本信息 / 可见性 / 审批开关         |
| POST   | `/api/v1/schemas/{id}/fields/`                  | 新增字段（自动 +SchemaVersion）    |
| PATCH  | `/api/v1/schemas/{id}/fields/{key}/`            | 改 label / 校验规则 / 标记废弃      |
| POST   | `/api/v1/schemas/{id}/fields/reorder`           | 字段排序                       |
| GET    | `/api/v1/schemas/{id}/versions/`                | SchemaVersion 历史列表         |
| GET    | `/api/v1/schemas/{id}/versions/{v}/`            | 指定版本的 fields_config 快照     |
| POST   | `/api/v1/schemas/{id}/handover`                 | 移交（仅管理员）                   |
| POST   | `/api/v1/schemas/{id}/archive`                  | 归档                         |
| GET    | `/api/v1/schemas/{id}/collaborators/`           | 协作者名单                      |
| POST   | `/api/v1/schemas/{id}/collaborators/`           | 添加协作者（body: user_id, role） |
| DELETE | `/api/v1/schemas/{id}/collaborators/{user_id}/` | 移除                         |
| PATCH  | `/api/v1/schemas/{id}/collaborators/{user_id}/` | 改角色                        |

#### 8.2.4 时态数据查询

| 方法  | 路径                                                                                 | 说明                          |
| --- | ---------------------------------------------------------------------------------- | --------------------------- |
| GET | `/api/v1/schemas/{id}/records/`                                                    | 当期视图；`?at=2024-05-15`（默认今天） |
| GET | `/api/v1/schemas/{id}/records/?at=2024-05-15&page=1`                               | 支持分页、筛选、排序、搜索               |
| GET | `/api/v1/entities/{id}/timeline/`                                                  | 单实体生命周期                     |
| GET | `/api/v1/schemas/{id}/timeseries/?field=status&from=2024-01&to=2024-12&unit=month` | 统计时间序列                      |

**查询参数**：

- `at`：时间点（ISO 日期，默认 today）
- `q`：全文搜索
- `filter[field]`：字段过滤，如 `filter[status]=在用`
- `order_by`：`-created_at` / `business_code`
- `retro=true`：回溯模式（用 at 时刻的 schema 渲染）

**响应示例**：

```json
{
  "at": "2024-05-15",
  "schema_version": 3,
  "fields": [/* fields_config 快照 */],
  "count": 234,
  "results": [
    {
      "entity_id": 100001,
      "business_code": "E001",
      "data": {"name": "张三", "social_base": 9000, ...},
      "valid_from": "2024-05-01",
      "valid_to": null,
      "last_changed_by": {"id": 5, "display_name": "HR李"},
      "last_changed_at": "2024-05-10T09:23:00Z"
    }
  ]
}
```

#### 8.2.5 ChangeSet

| 方法     | 路径                                            | 说明                                |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/schemas/{id}/changesets/`            | 变更流列表                             |
| POST   | `/api/v1/schemas/{id}/changesets/`            | 创建 draft                          |
| GET    | `/api/v1/changesets/{id}/`                    | 详情 + 所有 entries                   |
| PATCH  | `/api/v1/changesets/{id}/`                    | 修改 summary / 追加 entry（仅 draft 状态） |
| POST   | `/api/v1/changesets/{id}/entries/`            | 追加 entry                          |
| DELETE | `/api/v1/changesets/{id}/entries/{entry_id}/` | 删除 entry（仅 draft）                 |
| POST   | `/api/v1/changesets/{id}/submit`              | 提交（draft → submitted 或 applied）   |
| POST   | `/api/v1/changesets/{id}/approve`             | 审批通过（submitted → applied）         |
| POST   | `/api/v1/changesets/{id}/reject`              | 驳回（body: reason）                  |
| POST   | `/api/v1/changesets/{id}/revert`              | Revert                            |
| GET    | `/api/v1/changesets/pending/`                 | 我的待审批列表                           |

#### 8.2.6 导入 / 导出

| 方法   | 路径                                                      | 说明                         |
| ---- | ------------------------------------------------------- | -------------------------- |
| GET  | `/api/v1/schemas/{id}/import/template`                  | 下载 Excel 模板                |
| POST | `/api/v1/schemas/{id}/import/preview`                   | 上传 Excel → 返回 diff 预览（不落库） |
| POST | `/api/v1/schemas/{id}/import/commit`                    | 确认导入（生成 ChangeSet）         |
| GET  | `/api/v1/schemas/{id}/export?at=2024-05-15&format=xlsx` | 导出当期视图                     |
| GET  | `/api/v1/changesets/{id}/export`                        | 导出 ChangeSet 明细            |
| GET  | `/api/v1/entities/{id}/export`                          | 导出实体生命周期                   |

#### 8.2.7 统计

| 方法  | 路径                                                                | 说明                                                      |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| GET | `/api/v1/schemas/{id}/stats/summary`                              | 数值卡片（总数、本月新增/修改/终止）                                     |
| GET | `/api/v1/schemas/{id}/stats/trend?field=count&unit=auto&range=12` | 当前记录数趋势折线数据，`unit` 支持 `auto` / `day` / `week` / `month` |
| GET | `/api/v1/schemas/{id}/stats/distribution?field=status`            | 分布柱状图数据                                                 |
| GET | `/api/v1/dashboard/`                                              | 全局仪表盘汇总                                                 |

#### 8.2.8 审计日志

| 方法  | 路径                             | 权限                                 |
| --- | ------------------------------ | ---------------------------------- |
| GET | `/api/v1/audit-logs/`          | 按权限过滤：管理员全站 / owner 自己表 / 普通用户自己操作 |
| GET | `/api/v1/audit-logs/sensitive` | 敏感操作看板（管理员）                        |

### 8.3 错误码约定

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "你对该表无编辑权限",
    "details": {"schema_id": 42, "required_role": "editor"}
  }
}
```

常用 code：

- `VALIDATION_ERROR`（字段校验失败）
- `PERMISSION_DENIED`
- `NOT_FOUND`
- `SCHEMA_LOCKED`（字段已废弃不可修改）
- `CHANGESET_INVALID_STATE`（状态机非法跃迁）
- `TEMPORAL_CONFLICT`（valid 时间段冲突）
- `IMPORT_VALIDATION_FAILED`（导入预览失败）

### 8.4 OpenAPI 自动生成

使用 `drf-spectacular`：

- 访问 `/api/schema/` 获取 OpenAPI 3 规范 JSON
- 访问 `/api/docs/` 查看 Swagger UI（仅开发/管理员环境）
- ViewSet + Serializer 自动推导类型；手动标注用 `@extend_schema`

---

## 9. 开发路线图

### 9.1 里程碑划分

| 里程碑            | 时长                      | 内容                                                                           | 目标用户 |
| -------------- | ----------------------- | ---------------------------------------------------------------------------- | ---- |
| **M0 · 脚手架**   | 1 周                     | 项目初始化、DB / 认证 / CI / 部署自动化                                                   | 自用   |
| **M1 · 核心引擎**  | 3 周                     | DataSchema + Entity + TemporalRecord + ChangeSet 全链路跑通（后端 API + 少量前端 demo 页） | 自用   |
| **M2 · 建表与字段** | 2 周                     | 前台建表向导 + 字段卡片编辑器 + Schema 演化 + 回溯模式                                          | 管理员  |
| **M3 · 数据视图**  | 3 周                     | 当期视图表格 + 时间轴滑块 + 变更流视图 + 单实体抽屉                                               | 核心用户 |
| **M4 · 录入与导入** | 2 周                     | 三种录入入口 + Excel 模板 + 导入预览                                                     | 核心用户 |
| **M5 · 权限与审计** | 1.5 周                   | 三层可见性 + 协作者 + 审计日志 + 敏感看板                                                    | 管理员  |
| **M6 · 统计与导出** | 1.5 周                   | 仪表盘 + 表级统计 + 三种导出                                                            | 全部   |
| **M7 · 打磨上线**  | 2 周                     | UI 美化 + Bug 修复 + 文档 + 用户培训                                                   | 全部   |
| **合计 MVP**     | **约 16 周 / 4 个月（单人全职）** | vibe coding 加速后约 10-12 周                                                     | —    |

### 9.2 二期规划（MVP 稳定运行 3 个月后）

| 主题    | 内容                                          |
| ----- | ------------------------------------------- |
| 酷炫可视化 | 双屏 Diff · 地铁线路图 · 桑基图 · 热力标记时间轴             |
| 高级字段  | attachment · image · formula · auto-link    |
| 工作流   | 多级审批 · 条件审批 · 审批模板                          |
| 集成    | SSO / LDAP · Webhook · 对外 OpenAPI + API Key |
| 性能    | Redis 缓存 · 异步导入 · 读写分离（如果规模扩大）              |
| 运维    | Docker 化 · Sentry · Prometheus · 审计日志归档     |
| 协作    | 表内评论 · @提醒 · 订阅变更通知                         |

### 9.3 优先级决策原则

- **MVP 只做封版清单内的**；新需求默认进二期
- **功能范围锁定**，实现细节 vibe coding 大胆发挥
- **核心引擎（时态、ChangeSet、权限）必须 code review**；UI 层 vibe

### 9.4 风险与缓解

| 风险                     | 缓解                                                |
| ---------------------- | ------------------------------------------------- |
| 动态 Schema 的性能坑         | 限制 indexed 字段数（5/表）+ 软告警 > 2000 行                 |
| ChangeSet 并发写同一 Entity | 事务 + `SELECT FOR UPDATE` + DB 约束 `valid_range_ok` |
| Excel 导入行数爆炸           | 硬限 10000 行；超过走异步（二期）                              |
| 用户建表无序增长               | 归档功能 + 管理员可标记"僵尸表"提醒删除                            |
| vibe coding 生成的代码质量不一  | 核心引擎必看；UI 层靠测试兜底                                  |
| 离职同事数据漂移               | 移交流程 + is_active 过滤 + 定期巡检                        |

---

## 10. 附录

### 10.1 典型时态查询 SQL

**查询 schema=1 在 2024-05-15 那天的所有有效数据**：

```sql
SELECT DISTINCT ON (tr.entity_id)
  tr.entity_id, tr.data_payload, tr.valid_from, tr.valid_to,
  e.business_code
FROM temporal_record tr
JOIN entity e ON e.id = tr.entity_id
WHERE e.schema_id = 1
  AND tr.is_superseded = false
  AND tr.valid_from <= '2024-05-15'
  AND (tr.valid_to IS NULL OR tr.valid_to > '2024-05-15')
ORDER BY tr.entity_id, tr.valid_from DESC;
```

**查询单实体生命周期**：

```sql
SELECT tr.*, cs.summary, cs.created_by
FROM temporal_record tr
JOIN change_set cs ON cs.id = tr.change_set_id
WHERE tr.entity_id = 100001
  AND tr.is_superseded = false
ORDER BY tr.valid_from ASC;
```

**时间序列统计**（每月行数）：

```sql
WITH months AS (
  SELECT generate_series('2024-01-01'::date, '2024-12-01', '1 month') AS m
)
SELECT m,
  (SELECT COUNT(DISTINCT tr.entity_id)
   FROM temporal_record tr
   JOIN entity e ON e.id = tr.entity_id
   WHERE e.schema_id = 1
     AND tr.is_superseded = false
     AND tr.valid_from <= m
     AND (tr.valid_to IS NULL OR tr.valid_to > m)
  ) AS count
FROM months;
```

### 10.2 ChangeSet 提交伪代码

```python
@transaction.atomic
def apply_changeset(cs: ChangeSet, user: User):
    if cs.status != 'draft' and not (cs.status == 'submitted' and cs.approved_at):
        raise ChangesetInvalidState

    for entry in cs.entries.all():
        # 锁实体,防并发写
        entity = Entity.objects.select_for_update().get(id=entry.entity_id)

        if entry.action == 'create':
            tr = TemporalRecord.objects.create(
                entity=entity,
                data_payload=entry.data_after,
                valid_from=entry.valid_from,
                valid_to=entry.valid_to,
                change_set=cs,
                schema_version=entity.schema.current_version,
                recorded_by=user,
            )
            entry.new_record = tr
            entry.save()

        elif entry.action == 'update':
            # 找到当前生效记录,闭合它
            current = TemporalRecord.objects.select_for_update().filter(
                entity=entity, is_superseded=False,
                valid_from__lte=entry.valid_from,
            ).filter(Q(valid_to__isnull=True) | Q(valid_to__gt=entry.valid_from)).first()

            if current:
                current.valid_to = entry.valid_from
                current.save()

            tr = TemporalRecord.objects.create(
                entity=entity,
                data_payload=entry.data_after,
                valid_from=entry.valid_from,
                valid_to=entry.valid_to,
                change_set=cs,
                schema_version=entity.schema.current_version,
                recorded_by=user,
            )
            entry.new_record = tr
            entry.save()

        elif entry.action == 'terminate':
            current = TemporalRecord.objects.select_for_update().filter(
                entity=entity, is_superseded=False, valid_to__isnull=True,
            ).first()
            if current:
                current.valid_to = entry.valid_from
                current.save()

    cs.status = 'applied'
    cs.applied_at = timezone.now()
    cs.save()

    AuditLog.objects.create(
        actor=user, action='changeset.apply',
        target_type='changeset', target_id=cs.id,
        detail={'summary': cs.summary, 'entries': cs.entries.count()},
    )
```

### 10.3 Grill 封版决策索引

所有设计决策的溯源（Grill 过程中的每次"封版"）：

| #   | 领域              | 决策                                               |
| --- | --------------- | ------------------------------------------------ |
| 1   | 规模              | 20-30 人，平级，可扩展                                   |
| 2   | 建模              | B 元数据驱动 + JSONB（前台建表）                            |
| 3   | 时态              | α+ 底层连续 + 逻辑快照 / 连续                              |
| 4   | 时态语义            | α 修正后正确历史 + 审计日志                                 |
| 5   | 隔离              | 三层 private/shared/public + ORM 层                 |
| 6   | Schema 演化       | C+A 混合 + 回溯模式 + γ 废弃标灰                           |
| 7   | 字段              | 10 种 + auto-number；reference β 历史引用              |
| 8   | 建表 UX           | B 卡片式 + 时态模式不可改                                  |
| 9   | ChangeSet       | Y 批次 + B 自审 + 表级审批                               |
| 10  | applied / valid | 可错位                                              |
| 11  | Revert          | 干净α                                              |
| 12  | 删除              | 无硬删                                              |
| 13  | 数据录入            | γ 混合 + 三入口                                       |
| 14  | 导入              | 模板 + 映射兜底 + γ 缺失预览 + C 校验失败 + β 生效日期             |
| 15  | 可视化             | MVP 基础，酷炫二期                                      |
| 16  | 时间轴             | β 实时 + 未来虚线 banner                               |
| 17  | 性能              | 索引 + 2000 告警                                     |
| 18  | 协作              | editor/viewer + α 移交消失                           |
| 19  | public 升级       | 任何人可直升无审批                                        |
| 20  | 审计日志            | A 操作流水 + 永久 + 三层可见 + 敏感标记                        |
| 21  | 导出              | ①②④ Excel+CSV + 元信息 sheet                        |
| 22  | OpenAPI         | 仅内部自动文档                                          |
| 23  | 部署              | MVP 单机 + 公有云 + 每日/周/月备份                          |
| 24  | 技术栈             | React + Shadcn + Tailwind + RHF + zod + TanStack |

### 10.4 术语补充

- **valid_from / valid_to**：半开区间 `[valid_from, valid_to)`，`valid_to=NULL` 表示至今仍有效
- **is_superseded**：布尔值，`True` 表示该记录已被后续修正/revert 替代
- **business_code**：Entity 上的人眼识别码（如工号、资产编号），可变
- **schema_code**：DataSchema 的稳定业务码（如 `asset_list`），建表后不可改

### 10.5 相关文档

- `数据版本与演进管理平台_需求分析与实现方案.md`（初版蓝图，已被本文档替代）
- `数据版本与演进管理平台_深化设计报告.md`（深化设计参考）
- 后续补充：
  - `ChronoTrace_API_Reference.md`（由 drf-spectacular 自动生成）
  - `ChronoTrace_部署手册.md`
  - `ChronoTrace_用户手册.md`

---

**本文档为 Grill 封版结果，对应项目 MVP 阶段。二期需求需重新进入 Grill 流程或单独立项。**

---

## 11. 视觉设计规范

> 本章整合自 `docs/design-principles.md` 与 Grill 封版决策，是 ChronoTrace 所有前端实现的视觉底线。

### 11.1 一句话原则

> **ChronoTrace 是一个有审计感的时间机器式数据工作台，而不是一个炫技型可视化作品。**

界面必须首先像一个可靠的业务工作台，其次才是视觉作品。可以吸收 Nothing-inspired 的克制、单色、机械感、排版驱动和仪表盘气质，但这些只服务于三个更高优先级：

1. 让用户快速看清**当前数据版本、变更数量、发布状态、权限边界**
2. 让用户高效完成**导入、编辑、校验、Diff、发布、导出**等真实工作流
3. 让**审计、历史、生命周期和敏感数据处理**在界面上始终可解释、可追踪、可复核

### 11.2 五条总体原则（不可违反）

#### 11.2.1 表格效率优先

- 表头、固定列、行状态、筛选条件、批量操作**始终清晰可见**
- 行高、列宽、编辑控件不能为视觉风格牺牲可点击性和可读性
- 中文字段名和业务值**优先保证可读性**，不为英文字体牺牲中文显示
- 新增、修改、终止、校验失败必须有**稳定且可复用的视觉编码**（见 11.10）

#### 11.2.2 时间是主轴

- 页面始终显示：**当前数据集 / 当前时间点 / 最近变更 / 审批状态**
- 时间线用于表达**版本节点、变化强度、可回看历史**，不是装饰性进度条
- 用户切换时间点后，必须明确知道自己处于"历史快照"、"当前"还是"未来预期"
- 历史快照默认只读；回滚或基于旧版本操作必须显式提示后果

#### 11.2.3 Diff 是核心阅读模式

- 行级变化和字段级变化都要可定位
- 新增 / 修改 / 终止 / 未变 / 校验失败 **必须明确区分**
- 汇总数字帮助判断影响面，明细列表支持复核
- 优先支持按状态、字段、责任人筛选与跳转

#### 11.2.4 权限和审计可见

- 当前用户的角色、可编辑范围、导出权限在**关键操作附近可见**
- 无权访问的引用字段使用稳定占位（`—`），不与空值混淆
- 大批量导出、public 升级、Schema 破坏性变更必须**明确确认**
- 审计日志支持按数据集、操作者、类型、敏感标记、时间筛选

#### 11.2.5 可视化服务于核对

- 统计卡片、图表、时间线、生命周期图**必须能回到明细**
- 图表旁边**保留数值读数**，不只靠图形表达精确信息
- MVP 优先表格、变更流、时间线、统计，不做桑基/大屏/复杂动画

### 11.3 页面适配策略

ChronoTrace 采用 **"强风格化 / 弱风格化 / 不风格化"** 三档策略，而不是简单的"Nothing 风 vs Shadcn 风"：

#### 11.3.1 强 Nothing-inspired 页面（门面级 + 仪表感）

这些页面可以明显使用单色、点阵、仪表、分段进度条、机械式标签：

| 页面               | 路径                        | 特征应用                                   |
| ---------------- | ------------------------- | -------------------------------------- |
| 登录页              | `/login`                  | 全屏单色 + Space Grotesk 大字号 + 分段装饰 + 极简输入 |
| 全局仪表盘首屏          | `/dashboard`              | 大字号关键数字 + 分段进度条 + 仪表风状态卡               |
| 数据集首页 / 数据集工作台顶部 | `/schemas/:id`            | 期间/变更数/发布状态以仪表风陈列                      |
| 版本时间线（变更流顶部）     | `/schemas/:id/changesets` | 节点强度 + 等宽时间戳                           |
| 发布/提交确认页         | ChangeSet 提交弹窗            | 仪表风确认 + 明细回显                           |
| Diff 汇总页         | ChangeSet 详情顶部            | 分段柱形摘要 + 仪表数字                          |
| 单实体生命周期详情        | Entity 抽屉                 | 垂直时间线 + 节点状态标                          |
| 审计敏感操作看板         | `/admin/sensitive`        | 单色警示风 + 等宽时间戳                          |
| 错误页              | `/404` `/500` `/403`      | 工业错误码 + 简洁文案                           |

#### 11.3.2 弱 Nothing-inspired 页面（只用基础 token，不强风格化）

这些页面只使用颜色/间距/字体 token，不做机械感装饰：

| 页面                  | 理由      |
| ------------------- | ------- |
| 表列表页 / 表主视图数据区      | 数据密度高   |
| 表格编辑器（当期视图）         | 需紧凑布局   |
| 建表向导 / 字段卡片编辑器      | 交互复杂    |
| Excel 导入字段映射        | 表单密集    |
| 导入 Diff 预览          | 业务多色高亮  |
| 权限矩阵 / 协作者管理        | 标准 CRUD |
| 用户和角色管理             | 标准 CRUD |
| 表设置（基本信息 / 审批 / 归档） | 标准表单    |

#### 11.3.3 不应风格化的内容（准确性优先）

以下内容不允许被风格化干扰：

- 错误提示 / 校验失败详情
- 权限拒绝信息 / 无权访问提示
- 发布 / 导出 / public 升级确认弹窗
- 审批驳回原因
- 数据校验规则说明

#### 11.3.4 过渡带

- **顶部 Header**：字体用 Space Grotesk，布局用 Shadcn，作为"强/弱"风格切换时的视觉缓冲
- **Toast / 通知**：字体用 sans stack，颜色用 Shadcn 语义色

### 11.4 字体系统（四档字体栈）

#### 11.4.1 字体配置

```ts
// tailwind.config.ts
fontFamily: {
  sans: [
    '"Space Grotesk"',
    '"Noto Sans SC"',
    'system-ui',
    'sans-serif'
  ],
  mono: [
    '"Space Mono"',
    '"Noto Sans SC"',
    'ui-monospace',
    'monospace'
  ],
  display: [
    '"Space Grotesk"',
    '"Noto Sans SC"',
    'sans-serif'
  ],
  dot: ['"Doto"', 'monospace']    // 仅 hero moment
}
```

浏览器按**字符归属**自动选字体：英文 / 数字走 Space Grotesk / Space Mono，中文自动回退 Noto Sans SC —— 同一段落中英混排视觉和谐。

#### 11.4.2 字体使用约定

| 场景                                           | 字体                          | 说明                     |
| -------------------------------------------- | --------------------------- | ---------------------- |
| 全站正文 / 按钮 / 菜单 / 标签                          | `font-sans`                 | 混排自动切换                 |
| 中文字段名 / 中文业务值                                | `font-sans`                 | Noto Sans SC 生效        |
| **数字、日期、时间戳**                                | `font-mono`                 | 表格数字列强制右对齐             |
| **business_code / entity_id / changeset_id** | `font-mono`                 | 便于扫读与对齐                |
| 大标题 / 仪表盘关键数字 / Hero                         | `font-display` + 字重 600/700 | 品牌感                    |
| 登录页大标 / 启动欢迎 / 装饰点阵                          | `font-dot`                  | **只用于极少数 hero moment** |

#### 11.4.3 字体加载（国内 CDN · 阿里云）

使用阿里云 Web 字体镜像，避免 Google Fonts 在国内不可达：

```html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.alicdn.com">
<link rel="stylesheet" href="https://fonts.alicdn.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Doto:wght@400..900&display=swap">
```

备选：若阿里云镜像不可用，fallback 到 **self-host**：

- 下载 .woff2 文件放 `public/fonts/`
- 本地 `@font-face` 声明
- `font-display: swap`，避免首屏阻塞

#### 11.4.4 字体硬约束

- **Doto 不用于**：正文、中文字段名、表格数据、错误提示、业务操作反馈
- **表格内优先中文可读性**，不强行使用装饰字体
- **同一页面最多使用 3 个字号层级**表达主要结构，复杂表格区可独立使用紧凑字号体系
- **所有数字列默认 `font-mono` + 右对齐**

### 11.5 主题切换

#### 11.5.1 主题模式

| 主题        | 特征                          | 默认使用场景                         |
| --------- | --------------------------- | ------------------------------ |
| **light** | 近白背景 + 近黑文字                 | **默认**：工作台、表格编辑、字段建模、权限配置、导入向导 |
| **dark**  | 深色背景 + 近白文字（非纯黑）            | 演示、统计仪表盘、审计看板、发布确认、版本时间线、长时间查看 |
| **auto**  | 跟随系统 `prefers-color-scheme` | 用户选择                           |

**重要约束**：

- **不使用纯黑 `#000` 承载长时间中文表格编辑**。纯黑仅允许出现在登录 / 欢迎 / 启动页等 hero moment
- 两种模式下**状态语义必须一致**：同一颜色不能在不同模式下表达不同含义

#### 11.5.2 实现方式

- 使用 **CSS 变量 + Tailwind `dark:` 前缀**
- 主题状态：`localStorage` + Zustand store 双向同步
- Nothing 强风格化页面额外添加 `.nothing-mode` class 覆盖圆角 / 阴影 / 装饰

```css
:root {
  --background: 0 0% 99%;      /* 近白非纯白 */
  --foreground: 0 0% 9%;
  --muted: 0 0% 96%;
  --muted-foreground: 0 0% 45%;
  --border: 0 0% 90%;
  --card: 0 0% 100%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
}

.dark {
  --background: 0 0% 8%;       /* 深灰非纯黑,长时间看不刺眼 */
  --foreground: 0 0% 96%;
  --muted: 0 0% 14%;
  --muted-foreground: 0 0% 64%;
  --border: 0 0% 18%;
  --card: 0 0% 10%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
}

/* 仅登录 / 欢迎页等 hero moment 使用 */
.nothing-hero {
  background: #000;
  color: #fff;
}
```

#### 11.5.3 主题切换入口

- 右上角头像菜单 → `主题：☀️ 浅色 / 🌙 暗色 / 💻 跟随系统`
- 切换即时生效，150ms 淡入，不刷新页面
- Nothing 页面跟随全局主题，不独立持久化

### 11.6 颜色语义

ChronoTrace 颜色体系以**黑/白/灰为主**，状态色仅用于业务语义。

#### 11.6.1 语义色清单

| 语义               | 颜色           | 用途                          |
| ---------------- | ------------ | --------------------------- |
| 主文本              | 近黑 / 近白（按主题） | 标题、表格值                      |
| 次级文本             | 中性灰          | 标签、说明、元信息                   |
| 边界线              | 浅灰 / 深灰（按主题） | 表格线、分组线、面板边界                |
| **新增 / 成功**      | 绿            | 新增行、发布成功、校验通过               |
| **删除 / 终止 / 危险** | 红            | 终止行、导出风险、校验错误、破坏性确认         |
| **修改 / 待处理**     | 黄 / 琥珀       | 字段变更、待审批、待修正                |
| **当前选择 / 链接**    | 蓝 / 高亮灰      | 当前时间点、链接、可跳转信息              |
| **敏感标记**         | 深灰+边框        | 不用红色大面积；用小面积 `[敏感]` 文字标+深灰边 |

#### 11.6.2 使用约束

- **颜色优先编码状态，不作为装饰**
- Diff 视图允许使用绿 / 红 / 黄，因为这是**业务语义**
- **不使用大面积红色背景或彩色卡片堆叠**；状态色优先作用在**值、边线、图标、小面积标记**
- **不只靠颜色表达关键状态**——必须配合文本、图标、边线或标签
- ECharts 图表类别过多时，优先**灰阶 / 线型 / 透明度 / 直接标签**，最后才加颜色

### 11.7 间距与布局

#### 11.7.1 工作台 Shell 结构

```
┌────────────────────────────────────────────────────────┐
│  Header: Logo · 面包屑 · 当前数据集 · 当前时间点 · 用户   │
├──────┬─────────────────────────────────────────────────┤
│      │  主内容区                                         │
│ 左   │  - 数据集工作台 / 表格 / Diff / 时间线 / 统计     │
│ 侧   │                                                   │
│ 导   │                                       ┌─────────┐│
│ 航   │                                       │ 右侧    ││
│      │                                       │ 详情    ││
│      │                                       │ 抽屉    ││
│      │                                       └─────────┘│
├──────┴─────────────────────────────────────────────────┤
│  底部时间线滑块（当前数据集页面可见）                    │
└────────────────────────────────────────────────────────┘
```

- **左侧**：工作区、数据集导航、最近访问、收藏
- **顶部**：当前数据集、时间点、审批状态、主要操作
- **中部**：统计摘要、筛选、表格 / Diff 主视图
- **右侧**：选中行详情、生命周期、变更详情（抽屉）
- **底部**：时间线滑块（仅表主视图）

#### 11.7.2 布局原则

- **信息分组优先使用间距，其次分割线，最后才用卡片**
- **不要层层套卡片**
- **表格 / 时间线 / 详情面板尺寸可预测**，避免状态变化导致布局跳动
- **关键操作靠近对应上下文**：发布按钮靠近草稿状态，导出按钮靠近当前快照或 Diff 结果
- **Tailwind 刻度**：`p-2 / p-4 / gap-6`，不使用任意值
- **圆角统一**：`rounded-md`（卡片）/ `rounded-sm`（输入框）/ `rounded-full`（标签）；Nothing 页面无圆角

### 11.8 动效与阴影

#### 11.8.1 动效克制

- **只在状态变化时用 150ms 线性过渡**（linear / ease-out），不用弹性 / 超时动画
- **主题切换** / 时间轴拖动 / Diff 展开：150ms 淡入
- **不使用**：弹跳、视差滚动、光斑扫过、装饰性动画
- 图表切换使用 ECharts 内置的 `universalTransition: false`，避免过度炫技

#### 11.8.2 阴影克制

- 全局 `shadow-sm` 为主；数据表内部无阴影
- Nothing 风页面**无阴影**（只用边线和间距）
- 弹窗 / Toast / 抽屉可用稍强阴影，但不使用 `shadow-2xl`

### 11.9 关键 UI 元素示例

#### 11.9.1 登录页（强风格化）

```
─────────────────────────────────────────

              ▮▮▮▮▮▮▮▮▮▮▮▮▮▮              

              CHRONOTRACE                  
              时溯 · 数据版本管理平台        


         ┌─────────────────────┐         
         │ 账号                │         
         └─────────────────────┘         

         ┌─────────────────────┐         
         │ 密码                │         
         └─────────────────────┘         

         ┌─────────────────────┐         
         │      登  录          │         
         └─────────────────────┘         

              v1.0 · 2026                  
─────────────────────────────────────────
```

- 全屏 `.nothing-hero`（纯黑 / 纯白允许）
- 顶部点阵"▮"装饰（Doto 字体）
- 大标题 Space Grotesk 字重 700
- 输入框极简边框，无圆角装饰
- 版本信息 Space Mono

#### 11.9.2 仪表盘首屏（强风格化 + 标准业务区混合）

```
顶部区（强风格化）
─────────────────────────────────────
  总表数           本月变更           
  ██ 12            ██ 347             

  ▮▮▮▮▮▮▮▮▯▯▯▯  (进度分段)          
─────────────────────────────────────

下半区（弱风格化：表卡片墙）
┌─────────┐ ┌─────────┐ ┌─────────┐
│ 📦 资产表│ │ 👤 社保表│ │ 🏥 医保表│
│ 1234 行 │ │  150 行 │ │  148 行 │
└─────────┘ └─────────┘ └─────────┘
```

#### 11.9.3 审计日志时间轴（强风格化）

```
2026-05-12  ─────────────────────────
  14:32:01  │ 张三 · data.export
            │ 固定资产表 · 1234 行 [敏感]
            │
  10:15:22  │ 李四 · changeset.apply
            │ 社保表 · #CS-2024-05

2026-05-11  ─────────────────────────
  17:48:10  │ ...
```

- 日期分组用 `─` 等宽横线分隔
- 时间戳 Space Mono
- 单色展示，敏感操作用 `[敏感]` 文字标记（不用红色）

### 11.10 表格与 Diff 状态视觉编码（核心规范）

这是 ChronoTrace 最关键的视觉契约，所有表格、ChangeSet 详情、导入预览必须遵守。

#### 11.10.1 表格行状态标记

| 状态          | 视觉编码                                              | 说明                           |
| ----------- | ------------------------------------------------- | ---------------------------- |
| **新增**      | 左侧**绿色细线**（宽 3px）+ 行右侧 `新增` 标签                    | ChangeSet 中 action=create 的行 |
| **修改**      | 左侧**黄色细线**（宽 3px）+ 变更字段**单元格高亮**                  | action=update；字段级高亮指向具体列     |
| **终止**      | 左侧**红色细线**（宽 3px）+ 行内容**整体弱化**（50% 透明 + 删除线）      | action=terminate             |
| **校验失败**    | 错误字段**红色边线**（不填充背景）+ 单元格右下角 `!` 图标 + hover 显示错误详情 | 导入预览、编辑保存失败                  |
| **无权限**     | 稳定占位 `无权查看` 或 `—`，灰色文本                            | reference 跨表无权时              |
| **空值 / 未录** | 稳定占位 `—`，浅灰色文本                                    | 区别于"无权限"                     |
| **未变**      | 无标记                                               | 默认状态                         |

**约束**：

- **新增/修改/终止的颜色仅用于左侧细线、小标签、字段高亮**，不用于整行背景填充
- **无权限 ≠ 空值**：视觉占位不同（`无权查看` vs `—`），防止误以为字段为空
- **脱敏**（MVP 暂不实现，预留）：`***`（Space Mono）+ hover `已脱敏`

#### 11.10.2 Diff 字段级编码

ChangeSet 详情或导入预览中的字段 before/after：

```
修改前              →      修改后
基数: 8000                 基数: 9000
       (黄底红字)              (黄底绿字)
```

- `修改前` 值：**红色文本 + 浅黄底**
- `修改后` 值：**绿色文本 + 浅黄底**
- 单元格间用 `→` 连接
- 未变化字段不显示（只列出变化字段）

#### 11.10.3 Diff 汇总徽章

ChangeSet 卡片顶部的摘要徽章（`ChangeBadge` 组件）：

```
[+ 新增 12]  [~ 修改 47]  [× 终止 3]  [! 失败 1]
```

- `+` 绿 / `~` 黄 / `×` 红 / `!` 红
- 数字 Space Mono
- 点击徽章可筛选出对应类型的行

### 11.11 落地执行

#### 11.11.1 开发顺序

1. **M0 脚手架阶段**：先定义字体栈、CSS 变量 token、主题切换基础设施、基础组件（StatusBadge / ChangeBadge / DataMetric / MaskedValue）
2. **M1-M6 业务阶段**：默认使用**弱风格化**构建所有业务页面
3. **M7 打磨阶段**：专门为**强风格化页面**（登录 / 仪表盘 / 审计看板）做视觉升级

#### 11.11.2 资产准备

- **字体资产**：使用阿里云 Web 字体 CDN（见 11.4.3），无需下载
- **CSS 变量**：参考 `nothing-design-skill/references/tokens.md` 抽取基础 token
- **组件样式**：参考 `nothing-design-skill/references/components.md` 生成强风格化页面

#### 11.11.3 调用 Nothing Design Skill 生成代码

开发强风格化页面时，通过 Claude Code 触发：

```
/nothing-design 为 ChronoTrace 生成登录页,要求:
- React + Tailwind + Shadcn 基础组件
- 集成项目的 CSS 变量系统
- 支持 light / dark 主题切换
- 集成 react-hook-form + zod 做登录表单校验
```

生成后手工调整使其融入项目的路由、状态、认证流程。

### 11.12 明确禁止项

以下做法**明确禁止**，code review 见到必须打回：

- ❌ 营销站式 hero 页面作为登录后的第一屏
- ❌ 大面积渐变、模糊背景、发光背景、装饰光斑
- ❌ 多层嵌套卡片（`card > card > card`）
- ❌ 为视觉效果降低表格密度
- ❌ **只靠颜色表达关键状态**（必须配合文本/图标/边线）
- ❌ 花哨动画、弹跳动效、视差滚动、光斑扫过
- ❌ 不能回到明细的图表
- ❌ **把历史快照展示得像可直接编辑的当前数据**（必须有明显的"历史"标识 + 只读样式）
- ❌ 把无权限字段展示得像普通空值（必须稳定占位 `无权查看`）
- ❌ 在业务操作页面使用装饰性插画替代明确的操作反馈
- ❌ 使用纯黑 `#000` 承载长时间中文表格编辑（hero moment 除外）
- ❌ Doto 字体用于正文、中文字段名、表格数据、错误提示
- ❌ 同一页面超过 3 个字号层级（紧凑表格区除外）
- ❌ 硬编码颜色值（必须通过 CSS 变量）
- ❌ 使用任意值间距（必须走 Tailwind 刻度）

### 11.13 设计验收清单

每个新页面或重要组件**合并到主干前**，必须逐项检查：

**信息呈现**

- [ ] 用户能否在 3 秒内看出**当前数据集 / 时间点 / 审批状态**？
- [ ] 页面是否明确区分**当前时间点 / 历史快照 / 未来预期**？
- [ ] 关键数字能否**跳转或筛选**到明细？
- [ ] 图表是否保留**数值读数**和**明细入口**？

**状态编码**

- [ ] 表格状态是否**不只依赖颜色**（有文本/图标/边线）？
- [ ] Diff 是否能定位到**具体行和字段**？
- [ ] **无权限字段 / 空值**是否有不同展示？
- [ ] 校验失败是否指明**错误字段和原因**？

**权限与审计**

- [ ] **发布 / 导出 / public 升级**等高风险操作是否有确认？
- [ ] 敏感操作是否自动写入 AuditLog？
- [ ] 用户的**角色和权限边界**在关键操作附近是否可见？

**可读性**

- [ ] 中文字段名、长值、错误提示在**常见宽度**下是否不溢出？
- [ ] 数字列是否**强制 mono 字体 + 右对齐**？
- [ ] 是否避免了**嵌套卡片、无意义装饰、过度动画**？

**主题**

- [ ] **light 和 dark** 两种模式下状态语义是否一致？
- [ ] 主题切换是否**即时无闪烁**？

### 11.14 常见陷阱规避

| 陷阱                           | 规避                                        |
| ---------------------------- | ----------------------------------------- |
| 强对比纯黑背景在长时间阅读业务数据时刺眼         | 业务页面 dark 主题使用深灰 `hsl(0 0% 8%)` 而非 `#000` |
| 强/弱风格化页面切换时视觉割裂              | 字体统一 + Header 过渡带 + 150ms 淡入              |
| Space Grotesk 在密集表格里不如系统字号紧凑 | 表格区用 Tailwind `text-sm leading-tight` 压缩  |
| 主题切换导致强风格化页面"太亮"或"太暗"        | 强风格化页面跟随全局主题，不独立持久化                       |
| Shadcn 默认圆角 / 阴影与强风格化冲突      | 在强风格化容器加 `.nothing-mode` class 覆盖         |
| 数字列字体切换时对齐错位                 | 全站数字列强制 `font-mono` + 右对齐 + tabular-nums  |
| 中文字符在 Space Grotesk 下不显示     | 字体栈自动回退 Noto Sans SC                      |
| Google Fonts 国内不可达导致字体闪烁     | 使用阿里云 CDN（见 11.4.3），fallback self-host    |

---

**视觉设计规范是"可执行"的风格指南，不是审美主张。遵守它的目的是：开发时决策成本低、用户体验一致、品牌调性稳定。**
