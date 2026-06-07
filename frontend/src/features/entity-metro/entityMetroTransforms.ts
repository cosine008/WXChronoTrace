import type { EntityTimelineResponse, FieldConfig, TimelineRecord } from "../../api/schemas.ts";
import type {
  EntityMetroContext,
  EntityMetroFieldChange,
  EntityMetroFieldChangeKind,
  EntityMetroModel,
  EntityMetroStation,
  EntityMetroStationReasonCode,
} from "./entityMetroTypes.ts";
import { areValuesEqual, hasIntersection, uniqueKeys } from "./entityMetroValueUtils.ts";

const STATUS_FIELD_PATTERN = /(status|state)/i;
const DEPARTMENT_FIELD_PATTERN = /(department|dept|team|org)/i;

export function buildEntityMetroModel(
  timeline: EntityTimelineResponse,
  context: EntityMetroContext = { source: "current-view" }
): EntityMetroModel {
  const records = timeline.records ?? [];
  if (records.length === 0) {
    return {
      keyStations: [],
      minorStations: [],
      highlightedStationId: null,
    };
  }

  const fieldOrder = timeline.schema.fields_config.map((field) => field.key);
  const fieldLabels = buildFieldLabelMap(timeline.schema.fields_config);
  const statusFieldKeys = new Set(resolveStatusFieldKeys(timeline, context));
  const departmentFieldKeys = new Set(resolveDepartmentFieldKeys(timeline, context));
  const keyFieldKeys = new Set(resolveKeyFieldKeys(timeline, context));
  const highlightedFieldKeys = new Set(uniqueKeys(context.highlightedFieldKeys));

  const stations = records.map((record, index) => {
    const previousRecord = index > 0 ? records[index - 1] : null;
    const changedFields = getChangedFields(previousRecord, record, fieldOrder);
    const reasonCodes = collectReasonCodes(
      changedFields,
      statusFieldKeys,
      departmentFieldKeys,
      keyFieldKeys,
      index === 0,
      index === records.length - 1 && record.valid_to !== null
    );
    const fieldChanges = buildFieldChanges(
      changedFields,
      previousRecord,
      record,
      fieldLabels,
      statusFieldKeys,
      departmentFieldKeys,
      keyFieldKeys,
      highlightedFieldKeys
    );
    const highlighted = matchesHighlightContext(
      record,
      changedFields,
      highlightedFieldKeys,
      context
    );

    return {
      id: `record-${record.record_id}`,
      level: reasonCodes.length > 0 ? "key" : "minor",
      title: buildStationTitle(reasonCodes),
      summary: buildStationSummary(record, reasonCodes, fieldChanges),
      timelineIndex: index,
      schemaVersion: record.schema_version,
      reasonCodes,
      changedFields,
      fieldChanges,
      highlighted,
      record,
    } satisfies EntityMetroStation;
  });

  return {
    keyStations: stations.filter((station) => station.level === "key"),
    minorStations: stations.filter((station) => station.level === "minor"),
    highlightedStationId: stations.find((station) => station.highlighted)?.id ?? null,
  };
}

function buildFieldLabelMap(fields: FieldConfig[]) {
  return new Map(fields.map((field) => [field.key, field.label || field.key]));
}

function resolveStatusFieldKeys(timeline: EntityTimelineResponse, context: EntityMetroContext) {
  if (context.statusFieldKeys?.length) {
    return uniqueKeys(context.statusFieldKeys);
  }
  return timeline.schema.fields_config
    .filter((field) => STATUS_FIELD_PATTERN.test(field.key) || /状态/i.test(field.label))
    .map((field) => field.key);
}

function resolveDepartmentFieldKeys(timeline: EntityTimelineResponse, context: EntityMetroContext) {
  if (context.departmentFieldKeys?.length) {
    return uniqueKeys(context.departmentFieldKeys);
  }
  return timeline.schema.fields_config
    .filter(
      (field) => DEPARTMENT_FIELD_PATTERN.test(field.key) || /(部门|组织|团队|科室)/i.test(field.label)
    )
    .map((field) => field.key);
}

function resolveKeyFieldKeys(timeline: EntityTimelineResponse, context: EntityMetroContext) {
  if (context.keyFieldKeys?.length) {
    return uniqueKeys(context.keyFieldKeys);
  }
  return uniqueKeys([
    timeline.schema.identity_field_key,
    ...timeline.schema.identity_field_keys,
  ]);
}

function getChangedFields(
  previousRecord: TimelineRecord | null,
  record: TimelineRecord,
  fieldOrder: string[]
) {
  const previousPayload = previousRecord?.data_payload ?? {};
  const currentPayload = record.data_payload ?? {};

  if (previousRecord === null) {
    return orderFieldKeys(Object.keys(currentPayload), fieldOrder);
  }

  const allKeys = new Set([
    ...Object.keys(previousPayload),
    ...Object.keys(currentPayload),
  ]);
  return orderFieldKeys(
    [...allKeys].filter((key) => !areValuesEqual(previousPayload[key], currentPayload[key])),
    fieldOrder
  );
}

function orderFieldKeys(keys: string[], fieldOrder: string[]) {
  const orderMap = new Map(fieldOrder.map((key, index) => [key, index]));
  return [...keys].sort((left, right) => {
    const leftOrder = orderMap.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderMap.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.localeCompare(right);
  });
}

function collectReasonCodes(
  changedFields: string[],
  statusFieldKeys: Set<string>,
  departmentFieldKeys: Set<string>,
  keyFieldKeys: Set<string>,
  isCreate: boolean,
  isTerminate: boolean
) {
  const reasonCodes: EntityMetroStationReasonCode[] = [];
  if (isCreate) {
    reasonCodes.push("create");
  }
  if (isTerminate) {
    reasonCodes.push("terminate");
  }
  if (isCreate) {
    return reasonCodes;
  }
  if (hasIntersection(changedFields, statusFieldKeys)) {
    reasonCodes.push("status-change");
  }
  if (hasIntersection(changedFields, departmentFieldKeys)) {
    reasonCodes.push("department-change");
  }
  if (hasIntersection(changedFields, keyFieldKeys)) {
    reasonCodes.push("key-field-change");
  }
  return reasonCodes;
}

function buildFieldChanges(
  changedFields: string[],
  previousRecord: TimelineRecord | null,
  record: TimelineRecord,
  fieldLabels: Map<string, string>,
  statusFieldKeys: Set<string>,
  departmentFieldKeys: Set<string>,
  keyFieldKeys: Set<string>,
  highlightedFieldKeys: Set<string>
) {
  return changedFields.map((fieldKey) => ({
    key: fieldKey,
    label: fieldLabels.get(fieldKey) ?? fieldKey,
    before: valueForField(previousRecord?.data_payload, fieldKey),
    after: valueForField(record.data_payload, fieldKey),
    kind: resolveFieldChangeKind(fieldKey, statusFieldKeys, departmentFieldKeys, keyFieldKeys),
    highlighted: highlightedFieldKeys.has(fieldKey),
  })) satisfies EntityMetroFieldChange[];
}

function valueForField(payload: Record<string, unknown> | undefined, fieldKey: string) {
  if (!payload || !(fieldKey in payload)) {
    return undefined;
  }
  return payload[fieldKey];
}

function resolveFieldChangeKind(
  fieldKey: string,
  statusFieldKeys: Set<string>,
  departmentFieldKeys: Set<string>,
  keyFieldKeys: Set<string>
): EntityMetroFieldChangeKind {
  if (statusFieldKeys.has(fieldKey)) {
    return "status";
  }
  if (departmentFieldKeys.has(fieldKey)) {
    return "department";
  }
  if (keyFieldKeys.has(fieldKey)) {
    return "key";
  }
  return "other";
}

function matchesHighlightContext(
  record: TimelineRecord,
  changedFields: string[],
  highlightedFieldKeys: Set<string>,
  context: EntityMetroContext
) {
  const hasHighlightedFields = highlightedFieldKeys.size > 0;
  const recordIds = highlightedRecordIds(context);
  const hasHighlightedRecord = recordIds.size > 0;
  const hasHighlightedRange = hasVersionRange(context);
  const fieldMatch = hasIntersection(changedFields, highlightedFieldKeys);
  const recordMatch = recordIds.has(String(record.record_id));
  const rangeMatch = matchesSchemaVersionRange(record.schema_version, context);

  if (hasHighlightedFields && hasHighlightedRecord) {
    return fieldMatch && recordMatch;
  }
  if (hasHighlightedFields) {
    return fieldMatch;
  }
  if (hasHighlightedRecord) {
    return recordMatch;
  }
  if (hasHighlightedRange) {
    return rangeMatch;
  }
  return false;
}

function highlightedRecordIds(context: EntityMetroContext) {
  return new Set(
    [
      ...(context.highlightedRecordIds ?? []),
      ...(context.highlightedRecordId !== null && context.highlightedRecordId !== undefined
        ? [context.highlightedRecordId]
        : []),
    ].map(String)
  );
}

function hasVersionRange(context: EntityMetroContext) {
  const range = context.highlightedVersionRange;
  return range !== null && range !== undefined && (
    typeof range.startSchemaVersion === "number" || typeof range.endSchemaVersion === "number"
  );
}

function matchesSchemaVersionRange(schemaVersion: number, context: EntityMetroContext) {
  const range = context.highlightedVersionRange;
  if (!range) {
    return false;
  }
  const start = typeof range.startSchemaVersion === "number" ? range.startSchemaVersion : Number.NEGATIVE_INFINITY;
  const end = typeof range.endSchemaVersion === "number" ? range.endSchemaVersion : Number.POSITIVE_INFINITY;
  return schemaVersion >= start && schemaVersion <= end;
}

function buildStationTitle(reasonCodes: EntityMetroStationReasonCode[]) {
  if (reasonCodes.includes("create")) {
    return "创建站";
  }
  if (reasonCodes.includes("terminate")) {
    return "终止站";
  }
  if (reasonCodes.includes("status-change")) {
    return "状态变更";
  }
  if (reasonCodes.includes("department-change")) {
    return "部门变更";
  }
  if (reasonCodes.includes("key-field-change")) {
    return "关键字段变更";
  }
  return "版本快照";
}

function buildStationSummary(
  record: TimelineRecord,
  reasonCodes: EntityMetroStationReasonCode[],
  fieldChanges: EntityMetroFieldChange[]
) {
  const summary = record.change_summary?.trim();
  if (summary) {
    return summary;
  }
  if (reasonCodes.includes("create")) {
    return "实体首次进入时间轴。";
  }
  if (reasonCodes.includes("terminate")) {
    return "实体在该版本结束有效期。";
  }
  if (fieldChanges.length > 0) {
    return `共 ${fieldChanges.length} 个字段变化。`;
  }
  return "该版本未命中关键字段变化。";
}
