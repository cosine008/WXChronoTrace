# Flow Board 使用说明

日期:2026-05-27

Flow Board 用于查看同一张业务表在两个时间点之间的流向变化。它不是展示大屏,而是面向核对、追溯和汇报的审计工作台:先回答“哪些实体从哪里流向哪里”,再提供可回跳 Snapshot Diff 的证据链。

## 入口

### 从 Current View 进入

在当前视图 `/schemas/:id/records` 中点击 `Flow Board`。

系统会把当前视图上下文带入 Flow Board:

- `left_at`:当前视图的 `at`
- `right_at`:今天
- `dimension`:系统按当前表可用字段自动选择,优先 `status`,其次 `department`,再其次 `labels`;没有可用维度时不传该参数,页面展示维度不可用空状态
- `retro`:沿用当前视图
- `search`:沿用当前搜索
- `ordering`:沿用当前排序
- `return_to`:用于返回当前视图

### 直接打开

也可以直接访问:

```text
/schemas/:id/flow-board?left_at=2026-05-01&right_at=2026-05-27&dimension=status&retro=false&search=&ordering=business_code
```

页面会在请求后端前校验并补齐:

- `left_at` 和 `right_at` 必须是 `YYYY-MM-DD`
- `right_at` 必须晚于或等于 `left_at`
- `dimension` 只支持 `status`、`department`、`labels`
- 如果 `dimension` 缺失或当前表不支持该维度,页面会根据 schema 自动切到可用维度
- 如果当前表没有任何可用 flow 维度,页面不请求 stats API,而是展示“当前表没有可用于 Flow Board 的维度”

## 维度口径

### 状态

`dimension=status`

第一版只接受单值 enum 字段。系统会按字段 key 或 label 匹配业务状态字段,并排除隐藏、system、deprecated、不可见或被脱敏字段。

### 部门

`dimension=department`

第一版只接受单值 enum 字段。系统会按字段 key 或 label 匹配部门/组织/团队类字段,并同样遵守字段可见性与脱敏边界。

### 标签

`dimension=labels`

第一版只接受字段级 `multi-enum` 标签字段,不使用实体物理标签系统。

标签维度的计数口径是 `label_assignments`,表示标签分配/移动次数,不是实体数。一个实体带多个标签时,每个标签赋值会独立贡献流向:

- 保留标签:`value -> value`
- 移除标签:`value -> (无标签)`
- 新增标签:`(无标签) -> value`

## 页面区域

### Toolbar

顶部工具栏用于:

- 返回 Current View
- 打开完整 Snapshot Diff
- 切换维度:状态、部门、标签
- 调整 Left / Right 日期

切换维度或日期会更新当前 URL,便于复制链接或刷新页面。

### Summary

Summary 展示当前 flow 的核心计数:

- 实体总数
- 变更实体
- 流向数
- 主流向

主流向字段来自后端 `top_flow`,结构为:

```json
{
  "from": "期初值",
  "to": "期末值",
  "value": 12
}
```

### Sankey

主图用桑基图展示 `left_at -> right_at` 的流动关系。

节点分为 left / right 两侧,link 的宽度代表流量。鼠标悬停时可查看起点、终点和计数。

### Top Changed Links

右侧列表展示变化量最高的 changed links。

点击可进入 Snapshot Diff,并带上:

- `left_at`
- `right_at`
- `retro`
- `search`
- `ordering`
- `flow_dimension`
- `flow_from`
- `flow_to`
- `return_to`

这样可以从宏观流向回到具体差异证据,再返回 Flow Board。

### Heat Rail

底部 Heat Rail 展示时间点热度。柱高和透明度代表该时间点附近的变更数量,用于辅助判断变化集中区域。

## 后端 API

```text
GET /api/v1/schemas/:id/stats/flow
```

支持 query:

- `left_at=YYYY-MM-DD`
- `right_at=YYYY-MM-DD`
- `dimension=status|department|labels`
- `search=<keyword>`
- `ordering=<field>`
- `retro=true|false`

不支持:

- `change_set`
- `page`
- `page_size`
- `mode`

`search` 是实体范围筛选,不是 dimension 值筛选。`ordering` 只用于校验、回显和回跳上下文,不改变聚合计数。

## 常见错误

### 日期参数无效

页面提示“Flow Board 日期参数无效”时,检查 URL 中的 `left_at` 和 `right_at`:

- 是否是 `YYYY-MM-DD`
- `right_at` 是否早于 `left_at`

### 维度不可用

如果页面提示“当前表没有可用于 Flow Board 的维度”,或后端返回维度不可用,通常是当前表没有匹配的字段,或匹配字段不可用于 flow:

- 字段类型不是要求的 enum / multi-enum
- 字段已隐藏
- 字段是 system 字段
- 字段已 deprecated
- 字段对当前用户不可见或被脱敏
- `retro=true` 时左右时间点解析出的同一业务维度字段类型不兼容

### 图为空

图为空不一定代表接口失败,可能是:

- 当前 `search` 范围没有实体
- 两个时间点之间没有可展示流向
- 当前维度没有可聚合字段

可以尝试清空搜索、扩大日期范围或切换维度。

## P1 限制

当前 Flow Board 是 P1 MVP:

- 只比较两个时间点,不做全历史连续流动矩阵
- 不提供导出
- 不提供异步任务、缓存快照或取消任务
- labels 只代表字段级 multi-enum 标签,不代表物理标签生命周期
- Sankey 与 Heat Rail 用于在线核对,不是长期留档报表

后续如遇到大表性能、长区间分析或审计留档需求,应进入 P1+ 讨论异步 stats job、结果缓存、导出和审计记录。
