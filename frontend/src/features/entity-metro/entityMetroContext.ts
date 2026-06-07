import type { EntityTimelineResponse } from "@/api/schemas";

import type { EntityMetroContext, EntityMetroSource } from "./entityMetroTypes";
import { uniqueKeys } from "./entityMetroValueUtils";

const STATUS_FIELD_PATTERN = /(status|state)/i;
const STATUS_LABEL_PATTERN = /状态/i;
const DEPARTMENT_FIELD_PATTERN = /(department|dept|team|org)/i;
const DEPARTMENT_LABEL_PATTERN = /(部门|组织|团队|科室)/i;

export function buildDefaultEntityMetroContext(
  timeline: EntityTimelineResponse,
  source: EntityMetroSource
): EntityMetroContext {
  const statusFieldKeys = timeline.schema.fields_config
    .filter((field) => STATUS_FIELD_PATTERN.test(field.key) || STATUS_LABEL_PATTERN.test(field.label))
    .map((field) => field.key);
  const departmentFieldKeys = timeline.schema.fields_config
    .filter(
      (field) =>
        DEPARTMENT_FIELD_PATTERN.test(field.key) || DEPARTMENT_LABEL_PATTERN.test(field.label)
    )
    .map((field) => field.key);
  const keyFieldKeys = uniqueKeys([
    timeline.schema.identity_field_key,
    ...timeline.schema.identity_field_keys,
  ]);

  return {
    source,
    ...(statusFieldKeys.length > 0 ? { statusFieldKeys } : {}),
    ...(departmentFieldKeys.length > 0 ? { departmentFieldKeys } : {}),
    ...(keyFieldKeys.length > 0 ? { keyFieldKeys } : {}),
  };
}
