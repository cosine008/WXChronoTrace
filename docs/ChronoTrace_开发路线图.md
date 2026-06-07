# ChronoTrace 开发路线图

> 详细版。SRS 第 9 章是概要版,本文档是落地版。
> 当前位置:**M0-M6 已完成,M7 上线收口中;后台治理能力、P1 MVP(Phase A/B/C) 与 P2 高级字段已提前落地;P1+ 进入评估**

---

## 全局视图

```
┌────────────── 一期 MVP (~16 周) ──────────────┐ ┌────── 二期 (~12 周) ──────┐
│                                                │ │                            │
│  M0 ━━ M1 ━━ M2 ━━ M3 ━━ M4 ━━ M5 ━━ M6 ━━ M7  │ │  P1 ━━ P2 ━━ P3 ━━ P4     │
│  ✅    ✅    ✅    ✅    ✅    ✅    ✅    🔄       │ │  A✅   ✅*                 │
│  脚手架  核心引擎  建表  数据视图  录入  权限审计 │ │  酷炫可视化  高级字段       │
│                                            ↑      │ │  工作流  集成 / 运维加固    │
│                                            当前    │ │  *提前落地                 │
└────────────────────────────────────────────────┘ └────────────────────────────┘
```

| 阶段     | 时长(单人) | vibe coding 加速后 | 状态                                      |
| ------ | ------ | --------------- | --------------------------------------- |
| 一期 MVP | 16 周   | ~10-12 周        | M7 上线收口中                                |
| 二期     | 12 周   | ~8-10 周         | P1 Phase A/B/C 与 P2 高级字段已提前落地;P3/P4 未启动 |

---

## 一期:MVP

目标:**MVP 可上线给 20-30 人内部用户日常使用**。覆盖建表、录入、回溯、统计、导入导出、权限审计的完整闭环 。

### M0 · 脚手架(1 周)✅ 已完成

**目标**:项目可启动,认证打通,基础设施就位。

**完成项**:

- [x] Django 5 + DRF + PostgreSQL 18 项目结构
- [x] 7 个 app 目录(accounts/schemas/temporal/changesets/audit/imports/stats)
- [x] React 19 + Vite 8 + TS 6 + Tailwind v4 项目结构
- [x] 11 个基础语义组件(StatusBadge/ChangeBadge/DataMetric/...)
- [x] 主题系统 (light/dark/auto) + 字体栈
- [x] 认证 API + 路由守卫 + 登录页
- [x] OpenAPI 自动文档 (drf-spectacular)
- [x] `init` + `dev` 启动脚本 (Windows/Unix)
- [x] README + SRS + 设计原则文档

**当前 git 状态**:5 个 commit,M0 全部封板。

---

### M1 · 核心引擎(3 周)✅ 已完成

**目标**:数据模型 + 时态查询 + ChangeSet 全链路跑通。这是整个系统的**灵魂层**,要求**每一行 code review**。

#### 1.1 数据模型与迁移(0.5 周)

- [x] `DataSchema` model + `SchemaVersion` model
- [x] `Entity` + `TemporalRecord` model
- [x] `ChangeSet` + `ChangeEntry` model
- [x] `AuditLog` model + DB 触发器(防修改防删除)
- [x] `TableCollaborator` 协作者表
- [x] GIN 索引 + DateRange 约束 + 业务规则约束
- [x] 数据库迁移脚本

**验收**:✅ `python manage.py migrate` 成功,Django admin 能看到所有 model。

#### 1.2 字段类型与校验引擎(0.5 周)

- [x] 10 种字段类型的 Python 验证器
  - text / longtext / number / date / datetime / boolean
  - enum / multi-enum / person / reference / auto-number
- [x] `fields_config` JSON Schema 校验器
- [x] `data_payload` 按 fields_config 校验函数
- [x] reference 字段的引用完整性校验

**验收**:✅ 18 个字段校验单元测试覆盖所有字段类型 + 边界 case。

#### 1.3 时态查询引擎(0.75 周)

- [x] 当期视图查询(`DISTINCT ON entity_id` + 时间窗口)
- [x] 单实体生命周期查询
- [x] 时间序列统计查询(一次性计算多个时间点)
- [x] 回溯模式查询(用历史 SchemaVersion 渲染)
- [x] 性能基准:1 万条 record 单表查询 < 200ms

**验收**:✅ 种子数据 1000 entity × 5 个 valid range,各种查询都 < 100ms。

#### 1.4 ChangeSet 引擎(0.75 周)

- [x] ChangeSet 状态机(draft / submitted / approved / rejected / applied / reverted)
- [x] ChangeSet apply 原子事务(`select_for_update` 锁实体)
- [x] ChangeEntry 三种 action 的应用逻辑(create / update / terminate)
- [x] valid_to 自动闭合机制
- [x] Revert 机制(生成反向 ChangeSet,标记 is_superseded)
- [x] 表级审批开关 + 审批人校验

**验收**:✅ 并发场景下两个 ChangeSet 同时改一个 entity,后者排队不报错且数据正确。

#### 1.5 权限与隔离(0.5 周)

- [x] `PermissionManager.for_user(user)` 统一过滤
- [x] 三层可见性(private/shared/public)解析逻辑
- [x] editor/viewer 角色判定
- [x] 表级操作权限(建表 / 改 Schema / 移交)
- [x] AuditLog 自动写入(高敏感操作标记)

**验收**:✅ 5 个用户 × 3 张表 × 各种角色组合的权限矩阵测试通过。

**M1 风险**:

- 时态查询的 SQL 复杂度高,容易写错
- ChangeSet 并发场景容易出 race condition
- **建议**:M1 的每个子模块都写单元测试,不偷懒

---

### M2 · 建表与字段(2 周)

**目标**:用户能在前台自助建出一张可用的数据表。

#### 2.1 后端 Schema CRUD API(0.5 周)

- [x] `POST /api/v1/schemas/` 建表
- [x] `GET /api/v1/schemas/` 列出我能看到的所有表
- [x] `PATCH /api/v1/schemas/{id}/` 改基本信息
- [x] `POST /api/v1/schemas/{id}/fields/` 加字段(自动 +SchemaVersion)
- [x] `PATCH /api/v1/schemas/{id}/fields/{key}/` 改 label / 校验 / 标废弃
- [x] `POST /api/v1/schemas/{id}/handover` 移交(管理员)
- [x] `POST /api/v1/schemas/{id}/archive` 归档
- [x] 协作者管理 API

#### 2.2 前端建表向导(1 周)

- [x] 5 步向导:基本信息 / 时态模式 / 字段设计 / 实体标识 / 可见性
- [x] 字段卡片编辑器(左列表 + 右属性面板 + 实时预览)
- [x] 字段类型选择器 + 校验规则配置
- [x] reference 字段的目标表选择(从我能看到的表里选)

#### 2.3 表设置页(0.5 周)

- [x] 基本信息编辑
- [x] 字段列表 + 增改废弃
- [x] 协作者管理界面
- [x] 审批开关 + 审批人白名单(editor 协作者)
- [x] 归档 / 移交入口

**验收**:用户从零建出"固定资产表",带 10 个字段、3 个协作者、启用审批。

---

### M3 · 数据视图(3 周)

**目标**:用户能流畅查看、编辑、回溯数据。

#### 3.1 时态查询 API(0.5 周)

- [x] `GET /api/v1/schemas/{id}/records/?at=...` 当期视图
- [x] `GET /api/v1/entities/{id}/timeline/` 单实体生命周期
- [x] 当期视图 API 支持筛选、排序、分页、全文搜索

#### 3.2 当期视图表格(1 周)

- [x] 基于 TanStack Table 的只读当期视图表格
- [x] 虚拟滚动
- [x] 字段级状态编码(RowStatusStripe 左侧细线)
- [x] 单元格编辑模式(双击编辑,保存到 draft ChangeSet)
- [x] 复制粘贴多单元格
- [x] 列固定 / 排序 / 筛选 / 列设置

#### 3.3 时间轴滑块(1 周)

- [x] 自研组件:过去实线 + 未来虚线 + Now 竖线
- [x] ChangeSet 刻度点(hover 显示摘要)
- [x] 拖动防抖 300ms 联动数据表
- [x] 缩放 + 平移 + 键盘导航
- [x] 未来区间 banner 提示

#### 3.4 变更流视图(0.5 周)

- [x] ChangeSet 列表(按时间倒序)
- [x] 单 ChangeSet 详情(明细 + before/after)
- [x] DiffCell 字段级对比
- [x] 单实体生命周期抽屉

**验收**:用户能拖动时间轴看到任意时间点表状态,点击单元格编辑生成 draft。

---

### M4 · 录入与导入(2 周)

**目标**:三种录入方式 + Excel 闭环。

**当前进度(2026-05-13)**:

- [x] M4 完成:ChangeSet 编辑、Excel 模板、导入预览、导入生成草稿与审批看板已形成 MVP 闭环。
- [ ] 后续优化:审批人选择器、导入预览行内修正、异步大文件导入与更细字段映射体验。

#### 4.1 ChangeSet 编辑器(1 周)

- [x] 批量变更登记界面(新增 / 修改已有 / 终止条目混排)
- [x] draft 状态自动保存
- [x] 提交 / 审批 / Revert 流程
- [x] "待审批"看板

#### 4.2 Excel 模板下载(0.25 周)

- [x] 按当前 fields_config 生成 .xlsx 模板
- [x] 列说明、校验规则、示例值放在批注里

#### 4.3 Excel 导入预览(0.75 周)

- [x] 上传 + 字段映射界面(默认按列名匹配,可手工映射)
- [x] Diff 预览:新增 / 修改 / Excel 缺失 / 校验失败分类
- [x] 缺失行处理(快照型默认终止 / 连续型默认保留 / 可手工切换)
- [x] 预览阶段允许修正错误行
- [x] 确认后生成 ChangeSet

**验收**:导入 1000 行 Excel < 5 秒,预览 / 提交流程完整。

---

### M5 · 权限与审计(1.5 周)

**目标**:权限边界对用户可见,审计可查。

#### 5.1 权限 UI(0.5 周)

- [x] 协作者管理界面
- [x] 表可见性切换 (private ↔ shared ↔ public)
- [x] 移交 owner 确认弹窗
- [x] PermissionTag 在表卡片 / 详情页可见

#### 5.2 审计日志页(0.5 周)

- [x] 日志列表(按 actor / 目标 / 时间筛选)
- [x] 表 owner 看自己表的日志
- [x] 普通用户看自己操作的日志

#### 5.3 敏感操作看板(0.5 周)

- [x] 管理员专属页面
- [x] 敏感操作筛选(public 升级、移交、大批量导出等)
- [x] AuditMarker 标记

**验收**:审计日志覆盖所有 SRS 5.3 列出的敏感操作。

---

### M6 · 统计与导出(1.5 周)

**目标**:用户能看到数据演变趋势 + 能导出。

#### 6.1 统计 API(0.25 周)

- [x] `GET /api/v1/schemas/{id}/stats/summary` 数值卡片
- [x] `GET /api/v1/schemas/{id}/stats/trend` 时间序列
- [x] `GET /api/v1/schemas/{id}/stats/distribution` 分布数据

#### 6.2 仪表盘(0.5 周)

- [x] 全局仪表盘首页(Nothing 风顶部 + 表卡片墙)
- [x] 表级统计面板(数值卡 + 折线 + 柱状)
- [x] ECharts 集成

#### 6.3 导出(0.75 周)

- [x] 当期视图导出 (Excel / CSV)
- [x] ChangeSet 明细导出 (Excel)
- [x] 单实体生命周期导出 (Excel)
- [x] Excel 元信息 sheet 自动生成
- [x] > 500 行导出打敏感标记

**验收**:导出的 Excel 元信息 sheet 包含完整溯源信息。

---

### M7 · 打磨上线(2 周)

**目标**:从"能用"到"愿意用"。

#### 7.0 上线前后台治理(已完成)

- [x] 账号生命周期闭环:新增、编辑、停用、恢复、重置密码
- [x] 离职交接辅助:离职前提示并引导移交名下数据表
- [x] 敏感审计日志导出:CSV / XLSX 导出、权限守卫和审计记录
- [x] 管理控制台首页:`/admin` 汇总账号、审批、敏感审计和导出风险
- [x] 全站表资产台账:`/admin/schemas` 支持筛选、分页和治理入口
- [x] SchemaVersion 与字段治理:版本历史、字段顺序调整和快照预览
- [x] 全局审批治理:`/admin/changesets` 汇总待处理 ChangeSet

#### 7.1 视觉升级(1 周)

状态同步(2026-05-25):7.1 主体视觉升级已落地,但整项不判定完成;仍缺全页面明暗主题验收、字体加载优化和关键路径过渡验收记录。

- [x] 登录页 + 仪表盘首屏 + 审计日志的 Nothing 风专门打磨
- [ ] 暗色 / 浅色主题完整测试所有页面(已有 light / dark / auto 主题机制,缺逐页验收记录)
- [ ] 字体加载优化(国内 CDN / self-host;当前仍使用 Google Fonts)
- [x] 加载状态 / 空状态 / 错误状态统一化
- [ ] 关键路径加 150ms 过渡动画(已有基础过渡,缺关键路径逐项验收)
- [x] 当前视图抽屉化,减少多面板同时展开造成的视觉噪音

#### 7.2 性能与 Bug(0.5 周)

- [ ] 大表(1000+ 行)性能测试 + 索引调优
- [ ] 慢查询 log 检视
- [x] 高优先级页面问题完成一轮收口
- [ ] Bug 收集与修复持续进行

#### 7.3 上线准备(0.5 周)

- [ ] 生产环境部署文档
- [ ] 备份脚本验证
- [ ] 用户手册(操作向导 + FAQ)
- [ ] 一次"从备份还原"演练
- [ ] 管理员培训资料

**验收**:5 个真实业务用户独立完成"建表 → 录入 → 回溯 → 导出"全流程。

---

## 一期里程碑节点

| 里程碑 | 完成标志                             | 谁能开始用     |
| --- | -------------------------------- | --------- |
| M1  | 后端 API 跑通,可用 curl 完成建表 / 录入 / 查询 | 开发自测      |
| M2  | 前台可视化建表完成                        | 管理员预体验    |
| M3  | 可以编辑数据 + 拖时间轴                    | 1-2 个种子用户 |
| M4  | Excel 导入闭环                       | 5 个核心用户   |
| M5  | 协作场景可用                           | 10+ 用户    |
| M6  | 统计与导出闭环                          | 全员可用      |
| M7  | 视觉打磨完成                           | **正式上线**  |

---

## 二期:能力扩展(~12 周)

**触发条件**:MVP 稳定运行 3 个月以上,有真实使用反馈。

### P1 · 酷炫可视化(3 周)

需求基础:**MVP 期间收集到的"看数据不直观"的具体反馈**。

状态同步(2026-05-27):P1 需求探索、Phase A Diff Studio、Phase B Entity Metro MVP 与 Phase C Flow Board 已完成并合并回 `main`,P1 MVP 可按完成封板。Entity Metro 已接入 Current View 抽屉和 Diff Studio 全屏入口,继续沿用现有 `GET /api/v1/entities/:id/timeline/` contract,不绕过字段权限、脱敏和隐藏字段边界。Flow Board 新增 `/schemas/:id/flow-board` 与 `GET /api/v1/schemas/:id/stats/flow`,围绕 `left_at -> right_at` 展示状态、部门、字段级标签的流向,支持按 schema 自动选择可用维度、无可用维度空状态和回跳 Snapshot Diff。详细设计见 `docs/superpowers/specs/2026-05-25-p1-cool-visualization-design.md`,Phase A 实施计划见 `docs/superpowers/plans/2026-05-25-p1-phase-a-diff-studio.md`,Phase B 收口记录见 `docs/superpowers/plans/2026-05-26-p1-phase-b-entity-metro-task-list.md`,Phase C 使用说明见 `docs/操作说明/Flow Board使用说明.md`。

- [x] **Phase A · Diff Studio(主体已完成,2026-05-25)**
  - [x] 当前视图右侧保留轻量 Diff 摘要:A/B 对象、比较模式、差异数量、影响实体、热门字段和进入按钮
  - [x] 新增独立工作台 `/schemas/:id/diff-studio`:左侧差异大纲 + 中间左右双屏 + 按需右侧证据抽屉 + 底部热力轨
  - [x] ChangeSet Diff Studio 已补字段级差异明细分页(before / after、entity、field、action、entry_id)
  - [x] 新增 Snapshot Diff API:`/schemas/:id/snapshot-diff`,按当前筛选上下文比较 left_at / right_at
  - [x] 整合 ChangeSet / Snapshot 两种模式切换
  - [x] 差异导航默认按实体,支持切换字段聚合和操作类型聚合
  - [x] 首版视觉采用工业审计工作台风格:暗色/浅色适配、网格舞台、选中聚焦、热力轨和 reduced-motion 保护
  - [x] 点击差异先打开证据抽屉,并提供定位当前视图、打开 ChangeSet / Snapshot 相关记录的跳转;Entity Metro 深挖跳转随 Phase B 补齐
- [x] **Phase B · Entity Metro(MVP 已完成,2026-05-26)**
  - [x] 从 Diff Studio 证据抽屉和当前视图两个入口进入同一套 Entity Metro
  - [x] 支持抽屉 + 全屏两种形态:当前视图轻量查看,Diff Studio 深挖时全屏分析
  - [x] 默认关键站点模式,可切换显示全部版本小站点
  - [x] 站点点开后分层展示:摘要 + 关键字段变化,展开后看完整 payload
  - [x] 第一版前端基于现有 timeline records 计算站点分类,抽成纯函数并配单元测试,继续沿用现有 timeline contract 和权限脱敏边界
- [x] **Phase C · Flow Board(0.5-1 周)**
  - [x] 新增 `/api/v1/schemas/:id/stats/flow`,围绕两个时间点 left_at → right_at 统计流向
  - [x] 首批维度:状态、部门、字段级标签
  - [x] 用桑基图展示期初 → 期末流向,点击高流量路径可回跳 Snapshot Diff
  - [x] 时间轴热力标记用于展示变更密集区域
  - [x] Current View 增加 Flow Board 入口,并保留 `return_to` 回跳上下文
- [ ] **P1+ 增强项**
  - 状态同步(2026-05-27):已进入评估,不阻塞 P1 MVP 封板;优先评估完整全量 diff、异步 stats job/cache、导出和审计留痕的成本收益。
  
  - [ ] 完整全量 diff:全实体 / 全字段矩阵、完整覆盖率、批量导出和更深审计分析
  - [ ] 需要异步任务或缓存策略、大表阈值、取消任务、结果过期和审计留痕

---

### P2 · 高级字段与建模(3 周)

- [x] **附件字段**(1.5 周)
  - 本地文件资产模型与上传 / 下载 API 已完成
  - 权限贯穿(附件继承所在记录权限)
  - S3 / OSS 适配与真实缩略图生成后续按部署需求升级
- [x] **图片字段**(0.5 周,附件子集)
- [x] **公式字段**(0.5 周)
  - 仅支持简单算术 / 拼接
  - 公式字段不参与时态(渲染时实时计算)
- [x] **字段级脱敏**(0.5 周)
  - 配置可见字段范围
  - 后端序列化、搜索 / 排序防泄漏与 MaskedValue 展示已接入
- [x] Excel 模板 / 导入对高级字段的保守兼容
- [x] 建表向导和字段设置页的最小配置闭环

---

### P3 · 工作流与协作(3 周)

- [ ] **多级审批**(1.5 周)
  - 审批链配置
  - 条件审批(按金额 / 字段)
  - 审批模板
- [ ] **表内评论 + @提醒**(1 周)
  - 行级 / 字段级评论
  - 站内通知
- [ ] **订阅与通知**(0.5 周)
  - 订阅某张表的所有变更
  - 邮件 / 站内通知

---

### P4 · 集成与运维加固(3 周)

- [ ] **SSO / LDAP / 企业微信 / 钉钉登录**(1.5 周)
  - OAuth 2.0
  - 单位 AD 同步用户
- [ ] **对外 OpenAPI + API Key 鉴权**(0.5 周)
  - 真正给其他系统调用
- [ ] **Webhook**(0.5 周)
  - ChangeSet applied 时推送
- [ ] **Docker Compose 部署**(0.5 周)
  - 容器化前后端 + DB + Redis
  - 一键升级 / 回滚
- [ ] **Sentry + Prometheus 监控**(0.5 周)
- [ ] **Redis 缓存层**(性能瓶颈时启用)
- [ ] **异步导入(Celery)**(导入>3000 行时)

---

## 二期之后:可能性

不承诺,但保留思考:

| 方向               | 触发条件                   |
| ---------------- | ---------------------- |
| **AI 辅助建表 / 录入** | 字段类型识别、Excel 自动映射、异常检测 |
| **移动端 / 微信小程序**  | 巡检 / 现场录入需求            |
| **公开数据集 / 看板分享** | 跨单位数据公开场景              |
| **多租户 SaaS 化**   | 服务多个单位                 |
| **数据科学接口**       | Python / Jupyter 客户端   |

---

## 关键风险与对应措施

| 风险                     | 触发期 | 措施                                     |
| ---------------------- | --- | -------------------------------------- |
| **vibe coding 写错核心引擎** | M1  | 时态查询、ChangeSet apply、权限过滤**每行 review** |
| **元数据驱动表单的复杂度爆炸**      | M2  | 字段类型只 10 种,校验规则只标准库,砍掉跨字段校验            |
| **时间轴滑块工程量超预期**        | M3  | 自研 2 周硬上限,超时砍掉热力标记                     |
| **Excel 导入边界 case 多**  | M4  | 用真实 Excel(社保表)测试,不用造的数据                |
| **真实用户上手成本**           | M7  | M3 就找 1-2 个种子用户陪测,反馈到 M4-M6            |
| **数据量上来后性能崩**          | M7  | M1 阶段就建好索引,M7 用 5000 行规模压测             |

---

## 进度跟踪方式

- **每个 M 完成时**:打 git tag `m0` / `m1` / ...,写 CHANGELOG
- **每周**:更新本文档对应里程碑的 checklist
- **每个 Mn → Mn+1 之间**:跑一次完整功能 smoke test
- **M7 完成时**:正式发布 v1.0.0

---

**当前焦点**:核心 MVP 已完成到 M6,M7 正在做上线收口。后台治理能力、P1 MVP(Phase A/B/C)、P2 高级字段和 7.1 主体视觉升级已提前落地;下一步进入 P1+ 评估,同时继续完成 7.1 剩余的全页面明暗主题验收、字体加载优化和关键路径过渡验收,并推进部署/备份/还原演练、大表性能测试和用户手册。
