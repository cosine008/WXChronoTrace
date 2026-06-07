import type {
  EntityMetroFieldChangeKind,
  EntityMetroStationReasonCode,
} from "./entityMetroTypes.ts";

export const ENTITY_METRO_REASON_LABELS: Record<EntityMetroStationReasonCode, string> = {
  create: "创建实体",
  terminate: "结束有效期",
  "status-change": "状态变更",
  "department-change": "部门流转",
  "key-field-change": "关键字段变更",
};

export const ENTITY_METRO_FIELD_KIND_LABELS: Record<EntityMetroFieldChangeKind, string> = {
  status: "状态字段",
  department: "部门字段",
  key: "实体标识",
  other: "普通字段",
};

export function entityMetroReasonLabel(reasonCode: EntityMetroStationReasonCode) {
  return ENTITY_METRO_REASON_LABELS[reasonCode];
}

export function entityMetroFieldKindLabel(kind: EntityMetroFieldChangeKind) {
  return ENTITY_METRO_FIELD_KIND_LABELS[kind];
}
