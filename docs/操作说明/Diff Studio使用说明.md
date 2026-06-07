# Diff Studio 使用说明

## 适用场景

Diff Studio 用于查看同一张业务表在不同批次或不同时间点之间的字段级差异。

适用于以下情况：

- 想比较两个 ChangeSet 批次到底改了哪些实体和字段。
- 想比较某张表在两个日期快照之间发生了哪些变化。
- 想从“实体 / 字段 / 操作类型”三个角度快速定位差异。
- 想查看某一条差异背后的证据，例如 before、after、记录 ID、ChangeSet ID 和生效时间。
- 想从差异结果回跳到当前视图继续查看业务数据。

Diff Studio 是审计和分析工作台，不是数据编辑页面。当前版本不在 Diff Studio 中直接修改数据。

## 权限要求

用户必须先登录，并且对目标业务表有访问权限。

Diff Studio 会沿用当前系统的权限规则：

- 看不到某张表的用户，不能进入该表的 Diff Studio。
- 字段级可见性会按当前用户权限过滤。
- 敏感字段会按已有脱敏规则展示。
- 系统隐藏字段不会作为普通业务差异展示。

如果进入页面后显示加载失败或权限错误，通常说明当前用户没有访问目标表、目标批次或相关记录的权限。

## 支持的比较模式

Diff Studio 当前支持两种模式：

| 模式 | 用途 | 典型入口 |
|---|---|---|
| ChangeSet Diff | 比较两个变更批次 | 当前视图右侧“变更检查器”选择 A / B 批次后打开 |
| Snapshot Diff | 比较两个日期的数据快照 | 当前视图顶部“Snapshot Diff”入口 |

## 操作入口

### 从当前视图进入 Snapshot Diff

进入目标业务表的当前视图后，点击顶部操作区中的：

```text
Snapshot Diff
```

系统会把当前视图上下文带入 Diff Studio。

当前版本中：

- A Snapshot 通常是当前视图正在查看的日期。
- B Snapshot 通常是今天。
- 当前搜索关键词会被带入。
- 当前排序会被带入。
- 是否启用回溯 Schema 也会被带入。

例如，当前视图日期是 `2026-05-15`，今天是 `2026-05-25`，点击 Snapshot Diff 后，会进入类似下面的地址：

```text
/schemas/{schema_id}/diff-studio?mode=snapshot&left_at=2026-05-15&right_at=2026-05-25&retro=false&search=&ordering=business_code&page=1
```

其中 `{schema_id}` 是当前业务表 ID。

### 从变更检查器进入 ChangeSet Diff

进入目标业务表的当前视图后，在右侧或底部的“变更检查器”中选择两个批次。

操作步骤：

1. 打开目标表的当前视图。
2. 找到“变更检查器”。
3. 在批次列表中选择一个批次作为 A。
4. 再选择另一个批次作为 B。
5. 切换到“对比”页签。
6. 点击“打开 Diff Studio”。

进入后地址类似：

```text
/schemas/{schema_id}/diff-studio?mode=changeset&left={left_change_set_id}&right={right_change_set_id}
```

其中：

- `{schema_id}` 是业务表 ID。
- `{left_change_set_id}` 是 A 批次 ID。
- `{right_change_set_id}` 是 B 批次 ID。

## 页面区域说明

Diff Studio 页面由五个主要区域组成。

### 顶部工具条

顶部工具条展示当前比较任务的摘要。

常见内容包括：

- 当前模式：`ChangeSet Diff` 或 `Snapshot Diff`。
- 当前业务表名称和 Schema ID。
- A / B 对象，例如 A 批次、B 批次，或 A Snapshot、B Snapshot。
- 字段差异数量。
- 影响实体数量。
- “定位当前视图”链接。
- “导出”按钮。

当前 P1 版本中，“导出”按钮是占位能力，暂不提供实际导出。

### 左侧差异大纲

左侧大纲用于快速筛选和定位差异。

支持三种视角：

| 视角 | 说明 |
|---|---|
| 实体 | 按实体分组，适合先找哪条业务对象发生变化 |
| 字段 | 按字段分组，适合找哪个字段变化最集中 |
| 操作 | 按新增、修改、终止分组，适合审计操作类型 |

点击左侧任意分组，系统会选中该分组下的第一条差异，并在中间双屏和右侧证据抽屉中显示对应内容。

### 中间 A / B 双屏

中间区域是主要对比区。

在 ChangeSet Diff 模式中：

- A ChangeSet 显示 A 批次相关字段差异。
- B ChangeSet 显示 B 批次相关字段差异。
- 每条差异会展示实体、字段、操作类型、before 和 after。

在 Snapshot Diff 模式中：

- A Snapshot 显示左侧时间点的字段值。
- B Snapshot 显示右侧时间点的字段值。
- 同一条差异会在左右两侧展示对应时间点的值。

点击任意差异行，会打开或刷新右侧证据抽屉。

### 右侧证据抽屉

证据抽屉用于查看某一条差异的详细证据。

ChangeSet Diff 模式中通常会看到：

- `entry_id`
- `change_set_id`
- `action`
- `recorded_at`
- `valid_from`
- `before`
- `after`

Snapshot Diff 模式中通常会看到：

- `left_record_id`
- `right_record_id`
- `left_change_set_id`
- `right_change_set_id`
- `left_at`
- `right_at`
- `action`
- `recorded_at`
- `before`
- `after`

抽屉底部提供回跳入口。

常见入口包括：

- `Open Records View`
- `Open A Snapshot`
- `Open B Snapshot`

这些入口会带着对应日期、搜索、排序和回溯上下文回到当前视图。

### 底部热力轨

底部热力轨展示当前页差异密度。

使用方式：

1. 查看每个热度块的高度，越高表示该区域差异越集中。
2. 点击热度块，可以跳到对应差异。
3. 使用“上一页 / 下一页”切换字段差异分页。

如果差异数量超过当前页容量，需要通过底部分页继续查看。

## Snapshot Diff 使用流程

### 基础流程

1. 登录系统。
2. 打开目标业务表。
3. 在当前视图中选择要比较的日期。
4. 如有需要，输入搜索关键词或调整排序。
5. 点击 `Snapshot Diff`。
6. 在 Diff Studio 中查看 A Snapshot 和 B Snapshot。
7. 使用左侧大纲按实体、字段或操作类型定位差异。
8. 点击差异行查看证据抽屉。
9. 使用 `Open A Snapshot` 或 `Open B Snapshot` 回到对应时间点的当前视图。

### 什么时候使用 Snapshot Diff

适合以下问题：

- “这张表从上周到今天发生了什么变化？”
- “某个搜索范围内，两个日期之间哪些实体变了？”
- “今天的数据和某个历史快照相比，新增、修改、终止了哪些字段？”

### Snapshot Diff 的范围说明

Snapshot Diff 会继承当前视图上下文。

这意味着：

- 如果当前视图带搜索条件，Diff Studio 默认只比较搜索命中的范围。
- 如果当前视图启用了回溯 Schema，Diff Studio 会带入该上下文。
- `ordering` 只影响差异展示顺序，不改变实际比较范围。

如果想比较全表快照，应先清空当前视图搜索条件，再进入 Snapshot Diff。

## ChangeSet Diff 使用流程

### 基础流程

1. 登录系统。
2. 打开目标业务表。
3. 打开“变更检查器”。
4. 在批次列表中选择一个批次作为 A。
5. 选择另一个批次作为 B。
6. 进入“对比”页签。
7. 点击 `打开 Diff Studio`。
8. 在 Diff Studio 中查看 A ChangeSet 和 B ChangeSet。
9. 使用左侧大纲定位实体、字段或操作类型。
10. 点击差异行查看证据抽屉。
11. 使用 `Open Records View` 回到当前视图继续分析。

### 什么时候使用 ChangeSet Diff

适合以下问题：

- “两个导入批次有什么区别？”
- “某次人工编辑和某次 Excel 导入分别影响了哪些字段？”
- “A 批次新增了什么，B 批次终止了什么？”
- “两个批次都改了同一批实体吗？”

## 常见字段含义

| 字段 | 说明 |
|---|---|
| `entity` | 发生变化的业务实体 |
| `field` | 发生变化的字段 |
| `before` | 变化前的值 |
| `after` | 变化后的值 |
| `action` | 操作类型，通常是新增、修改或终止 |
| `entry_id` | ChangeSet 明细 ID |
| `change_set_id` | 变更批次 ID |
| `recorded_at` | 记录或批次写入时间 |
| `valid_from` | 业务生效日期 |
| `left_record_id` | Snapshot Diff 左侧记录 ID |
| `right_record_id` | Snapshot Diff 右侧记录 ID |

## 操作类型说明

| 操作类型 | 含义 |
|---|---|
| 新增 | 右侧或目标批次中出现了新实体或新字段值 |
| 修改 | 同一实体同一字段在两侧值不同 |
| 终止 | 右侧或目标时间点中该实体不再有效 |

## 注意事项

### Diff Studio 不用于编辑数据

Diff Studio 只用于查看差异和证据。

如果需要修改数据，应回到当前视图、批量登记、单条新增、Excel 导入或其他录入入口操作。

### 导出暂未开放

当前 P1 版本中，Diff Studio 顶部的“导出”按钮暂不提供实际导出。

如果需要导出当前数据快照，可以先回到当前视图，使用当前视图的 CSV 或 Excel 导出能力。

### 分页只影响当前展示页

Diff Studio 的字段差异明细是分页加载的。

如果底部显示多页，需要点击“下一页”继续查看后续差异。

### 脱敏值是预期行为

如果某些字段显示为脱敏值，不代表 Diff Studio 丢失数据，而是当前用户权限下只能看到脱敏后的结果。

需要查看原始值时，应联系表 owner 或管理员确认权限配置。

### Snapshot Diff 和 ChangeSet Diff 解决的问题不同

Snapshot Diff 比较的是两个时间点下的数据状态。

ChangeSet Diff 比较的是两个变更批次本身。

如果想回答“两个日期之间最终状态有什么不同”，使用 Snapshot Diff。

如果想回答“两个批次各自做了什么”，使用 ChangeSet Diff。

## 常见问题

### 进入 Diff Studio 后提示参数无效

通常是 URL 参数不完整。

ChangeSet Diff 必须包含：

```text
mode=changeset
left={change_set_id}
right={change_set_id}
```

Snapshot Diff 必须包含：

```text
mode=snapshot
left_at={YYYY-MM-DD}
right_at={YYYY-MM-DD}
```

建议从当前视图的按钮进入，避免手工拼错 URL。

### Snapshot Diff 没有差异

可能原因：

- A Snapshot 和 B Snapshot 选择的是同一天。
- 当前搜索条件范围内没有差异。
- 当前用户看不到相关字段或记录。
- 差异字段被权限规则过滤。

处理方式：

1. 确认两个日期不同。
2. 清空搜索条件后重新进入 Snapshot Diff。
3. 确认当前用户对目标表有足够权限。
4. 如果仍有疑问，联系表 owner 或管理员检查字段权限和数据历史。

### ChangeSet Diff 某一侧没有行

这不一定是异常。

例如：

- A 批次是新增，B 批次是终止。
- 当前页的差异主要来自其中一个批次。
- 字段级差异分页后，某一页可能只包含 A 或 B 的行。

可以使用底部“上一页 / 下一页”查看其他页。

### 点击“定位当前视图”后看到的数据和 Diff Studio 不完全一样

可能原因：

- 当前视图按日期快照展示，ChangeSet Diff 按批次证据展示。
- 当前视图可能还有搜索、排序或回溯上下文。
- 用户权限或字段脱敏规则在两个页面中都会生效。

如果要复查 Snapshot Diff，请优先使用证据抽屉中的 `Open A Snapshot` 或 `Open B Snapshot`。

### 看不到“打开 Diff Studio”按钮

可能原因：

- 尚未在变更检查器中选择 A / B 两个批次。
- 当前用户没有查看该表批次对比的权限。
- 页面不是目标表的当前视图。

处理方式：

1. 回到目标表当前视图。
2. 打开变更检查器。
3. 分别设置 A 批次和 B 批次。
4. 进入“对比”页签后再查看按钮。

## 推荐使用顺序

如果只是想快速看某张表最近发生了什么变化，建议：

1. 先在当前视图选择一个历史日期。
2. 点击 `Snapshot Diff`。
3. 在左侧大纲按“字段”查看哪些字段变化最多。
4. 再按“实体”定位具体业务对象。
5. 点开证据抽屉确认 before / after。

如果是在复核某次导入或审批，建议：

1. 在变更检查器中找到相关批次。
2. 选择 A / B 两个批次。
3. 点击 `打开 Diff Studio`。
4. 先看操作类型分组，确认新增、修改、终止比例。
5. 再进入实体或字段分组逐条复查。

## 管理员检查清单

管理员或表 owner 排查 Diff Studio 问题时，可以按以下顺序检查：

1. 当前用户是否已经登录。
2. 当前用户是否能打开目标业务表。
3. 目标表是否存在足够的 ChangeSet 或历史记录。
4. ChangeSet Diff 是否同时提供了 `left` 和 `right`。
5. Snapshot Diff 是否同时提供了 `left_at` 和 `right_at`。
6. 当前搜索条件是否过窄，导致没有差异。
7. 字段是否因为敏感字段、隐藏字段或权限配置被过滤。
8. 底部分页是否还有下一页。
9. 浏览器控制台或网络请求中是否有接口错误。

## 推荐给用户的说明话术

```text
Diff Studio 是用来审计差异的全屏工作台。
如果你想比较两个批次，请在当前视图的变更检查器里选 A / B 批次，再点击“打开 Diff Studio”。
如果你想比较两个日期，请在当前视图选择历史日期后点击“Snapshot Diff”。
进入后可以用左侧“实体 / 字段 / 操作”切换差异分组，点击任意差异后在右侧查看证据，再用底部热力轨和分页继续定位。
```

## 相关规则

- Diff Studio 是表级能力，入口路径包含业务表 ID。
- ChangeSet Diff 必须有两个批次 ID。
- Snapshot Diff 必须有两个日期。
- Snapshot Diff 会继承当前搜索、排序、回溯和权限上下文。
- 字段脱敏和字段可见性规则始终生效。
- 当前版本不支持在 Diff Studio 内编辑数据。
- 当前版本不支持从 Diff Studio 直接导出差异。
