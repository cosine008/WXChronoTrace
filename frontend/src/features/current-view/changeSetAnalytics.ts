import type { ChangeAction, ChangeSetDetail, ChangeSetEntry } from "@/api/schemas";
import { IDENTITY_CODE_FIELD_KEY } from "@/lib/schemaFields";

import { changeActionLabel } from "./changeStreamLabels";

const ACTIONS: ChangeAction[] = ["create", "update", "terminate"];

export interface FieldAggregate {
  key: string;
  label: string;
  changeCount: number;
  entityCount: number;
  actionCounts: Record<ChangeAction, number>;
}

export interface ActionComparison {
  action: ChangeAction;
  label: string;
  left: number;
  right: number;
  delta: number;
}

export interface FieldComparison {
  key: string;
  label: string;
  leftChanges: number;
  rightChanges: number;
  leftEntities: number;
  rightEntities: number;
  delta: number;
}

export interface ChangeSetComparison {
  actionRows: ActionComparison[];
  fieldRows: FieldComparison[];
  leftEntityCount: number;
  rightEntityCount: number;
  sharedEntityCount: number;
  leftOnlyEntityCount: number;
  rightOnlyEntityCount: number;
}

export function buildFieldAggregates(
  entries: ChangeSetEntry[],
  fieldLabels: Record<string, string>
): FieldAggregate[] {
  const aggregateMap = new Map<
    string,
    { actionCounts: Record<ChangeAction, number>; entities: Set<number>; changeCount: number }
  >();

  entries.forEach((entry) => {
    entry.changed_fields.forEach((fieldKey) => {
      if (fieldKey === IDENTITY_CODE_FIELD_KEY) return;
      const item = aggregateMap.get(fieldKey) ?? {
        actionCounts: { create: 0, update: 0, terminate: 0 },
        entities: new Set<number>(),
        changeCount: 0,
      };
      item.changeCount += 1;
      item.entities.add(entry.entity_id);
      item.actionCounts[entry.action] += 1;
      aggregateMap.set(fieldKey, item);
    });
  });

  return [...aggregateMap.entries()]
    .map(([key, item]) => ({
      key,
      label: fieldLabels[key] ?? key,
      changeCount: item.changeCount,
      entityCount: item.entities.size,
      actionCounts: item.actionCounts,
    }))
    .sort(
      (left, right) =>
        right.changeCount - left.changeCount ||
        right.entityCount - left.entityCount ||
        left.label.localeCompare(right.label)
    );
}

export function buildChangeSetComparison(
  left: ChangeSetDetail,
  right: ChangeSetDetail,
  fieldLabels: Record<string, string>
): ChangeSetComparison {
  const leftEntities = entitySet(left.entries);
  const rightEntities = entitySet(right.entries);
  const sharedEntityCount = [...leftEntities].filter((id) => rightEntities.has(id)).length;
  const leftFields = fieldAggregateByKey(buildFieldAggregates(left.entries, fieldLabels));
  const rightFields = fieldAggregateByKey(buildFieldAggregates(right.entries, fieldLabels));
  const fieldKeys = [...new Set([...leftFields.keys(), ...rightFields.keys()])];

  return {
    actionRows: ACTIONS.map((action) => ({
      action,
      label: changeActionLabel(action),
      left: left.action_counts[action],
      right: right.action_counts[action],
      delta: right.action_counts[action] - left.action_counts[action],
    })),
    fieldRows: fieldKeys
      .map((key) => {
        const leftField = leftFields.get(key);
        const rightField = rightFields.get(key);
        return {
          key,
          label: leftField?.label ?? rightField?.label ?? key,
          leftChanges: leftField?.changeCount ?? 0,
          rightChanges: rightField?.changeCount ?? 0,
          leftEntities: leftField?.entityCount ?? 0,
          rightEntities: rightField?.entityCount ?? 0,
          delta: (rightField?.changeCount ?? 0) - (leftField?.changeCount ?? 0),
        };
      })
      .sort(
        (leftField, rightField) =>
          Math.abs(rightField.delta) - Math.abs(leftField.delta) ||
          rightField.rightChanges - leftField.rightChanges ||
          leftField.label.localeCompare(rightField.label)
      ),
    leftEntityCount: leftEntities.size,
    rightEntityCount: rightEntities.size,
    sharedEntityCount,
    leftOnlyEntityCount: leftEntities.size - sharedEntityCount,
    rightOnlyEntityCount: rightEntities.size - sharedEntityCount,
  };
}

function entitySet(entries: ChangeSetEntry[]) {
  return new Set(entries.map((entry) => entry.entity_id));
}

function fieldAggregateByKey(items: FieldAggregate[]) {
  return new Map(items.map((item) => [item.key, item]));
}
