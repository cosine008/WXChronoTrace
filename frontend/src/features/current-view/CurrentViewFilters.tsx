import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Filter, Plus, X } from "lucide-react";

import type {
  CurrentViewFilter,
  CurrentViewFilterOperator,
  FieldConfig,
  FieldType,
  SchemaRole,
} from "@/api/schemas";
import { cn } from "@/lib/utils";

interface Props {
  fields: FieldConfig[];
  filters: CurrentViewFilter[];
  schemaRole: SchemaRole | null;
  onFiltersChange: (filters: CurrentViewFilter[]) => void;
}

const EMPTY_OPERATORS = new Set<CurrentViewFilterOperator>(["is_empty", "is_not_empty"]);
const LIST_OPERATORS = new Set<CurrentViewFilterOperator>(["in", "not_in"]);
const BETWEEN_OPERATOR: CurrentViewFilterOperator = "between";

const OPERATOR_LABELS: Record<CurrentViewFilterOperator, string> = {
  equals: "等于",
  not_equals: "不等于",
  contains: "包含",
  starts_with: "开头为",
  is_empty: "为空",
  is_not_empty: "非空",
  greater_than: "大于",
  greater_than_or_equal: "大于等于",
  less_than: "小于",
  less_than_or_equal: "小于等于",
  between: "介于",
  in: "属于",
  not_in: "不属于",
};

export function CurrentViewFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const filterableFields = useMemo(
    () => props.fields.filter((field) => fieldIsFilterable(field, props.schemaRole)),
    [props.fields, props.schemaRole]
  );
  const [fieldKey, setFieldKey] = useState(filterableFields[0]?.key ?? "");
  const selectedField =
    filterableFields.find((field) => field.key === fieldKey) ?? filterableFields[0];
  const activeFieldKey = selectedField?.key ?? "";
  const operatorOptions = operatorOptionsForField(selectedField);
  const [operator, setOperator] = useState<CurrentViewFilterOperator>(
    operatorOptions[0] ?? "equals"
  );
  const activeOperator = operatorOptions.includes(operator)
    ? operator
    : operatorOptions[0] ?? "equals";
  const [value, setValue] = useState("");
  const [valueEnd, setValueEnd] = useState("");

  useEffect(() => {
    if (!open) return;

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && detailsRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [open]);

  const canAdd =
    Boolean(selectedField) && filterValueReady(selectedField, activeOperator, value, valueEnd);
  const addFilter = () => {
    if (!selectedField || !canAdd) return;
    props.onFiltersChange([
      ...props.filters,
      buildFilter(selectedField, activeOperator, value, valueEnd),
    ]);
    setValue("");
    setValueEnd("");
  };

  return (
    <details
      ref={detailsRef}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="relative min-w-0"
    >
      <summary
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-2 border px-3 text-sm",
          props.filters.length > 0
            ? "border-foreground bg-muted text-foreground"
            : "border-border text-muted-foreground hover:text-foreground"
        )}
      >
        <Filter className="size-4" aria-hidden />
        字段筛选
        {props.filters.length > 0 && (
          <span className="font-mono text-xs">{props.filters.length}</span>
        )}
      </summary>

      <div className="absolute left-0 z-20 mt-2 grid w-[min(42rem,calc(100vw-2rem))] gap-3 border border-border bg-background p-3 shadow-xl">
        {filterableFields.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            当前没有可筛选字段
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-[minmax(10rem,1fr)_10rem_minmax(12rem,1.6fr)] md:items-center">
            <select
              value={activeFieldKey}
              onChange={(event) => {
                const nextField = filterableFields.find(
                  (field) => field.key === event.target.value
                );
                setFieldKey(nextField?.key ?? "");
                setOperator(operatorOptionsForField(nextField)[0] ?? "equals");
                setValue("");
                setValueEnd("");
              }}
              className="h-9 min-w-0 border border-border bg-background px-2 text-sm"
            >
              {filterableFields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
            <select
              value={activeOperator}
              onChange={(event) => {
                setOperator(event.target.value as CurrentViewFilterOperator);
                setValue("");
                setValueEnd("");
              }}
              className="h-9 min-w-0 border border-border bg-background px-2 text-sm"
            >
              {operatorOptions.map((item) => (
                <option key={item} value={item}>
                  {OPERATOR_LABELS[item]}
                </option>
              ))}
            </select>
            <FilterValueInput
              field={selectedField}
              operator={activeOperator}
              value={value}
              valueEnd={valueEnd}
              onValueChange={setValue}
              onValueEndChange={setValueEnd}
              onSubmit={addFilter}
            />
          </div>
        )}

        <div className="grid gap-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={!canAdd}
              onClick={addFilter}
              title={canAdd ? "添加条件并立即生效" : "请先填入筛选值"}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 border border-foreground bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-muted-foreground"
            >
              <Plus className="size-3.5" aria-hidden />
              添加条件
            </button>
            <span>多个条件按 AND 生效，或在值框内按 Enter 快速添加</span>
            {props.filters.length > 0 && (
              <button
                type="button"
                onClick={() => props.onFiltersChange([])}
                className="ml-auto shrink-0 text-foreground hover:underline"
              >
                清空筛选
              </button>
            )}
          </div>
          {props.filters.length === 0 ? (
            <div className="border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              尚未添加结构化筛选
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {props.filters.map((filter, index) => (
                <button
                  key={`${filter.field}-${filter.operator}-${index}`}
                  type="button"
                  onClick={() =>
                    props.onFiltersChange(props.filters.filter((_, itemIndex) => itemIndex !== index))
                  }
                  className="inline-flex max-w-full items-center gap-2 border border-border px-2 py-1 text-left text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
                  title="移除此筛选"
                >
                  <span className="truncate">{filterLabel(filter, props.fields)}</span>
                  <X className="size-3.5 shrink-0" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function FilterValueInput(props: {
  field: FieldConfig | undefined;
  operator: CurrentViewFilterOperator;
  value: string;
  valueEnd: string;
  onValueChange: (value: string) => void;
  onValueEndChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  const handleKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      props.onSubmit?.();
    }
  };

  if (EMPTY_OPERATORS.has(props.operator)) {
    return (
      <div className="flex h-9 items-center border border-border px-3 text-sm text-muted-foreground">
        无需输入值
      </div>
    );
  }
  if (props.field?.type === "boolean") {
    return (
      <select
        value={props.value || "true"}
        onChange={(event) => props.onValueChange(event.target.value)}
        className="h-9 min-w-0 border border-border bg-background px-2 text-sm"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (props.operator === BETWEEN_OPERATOR) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <input
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          onKeyDown={handleKey}
          type={inputTypeForField(props.field?.type)}
          placeholder="开始"
          className="h-9 min-w-0 border border-border bg-background px-2 text-sm outline-none"
        />
        <input
          value={props.valueEnd}
          onChange={(event) => props.onValueEndChange(event.target.value)}
          onKeyDown={handleKey}
          type={inputTypeForField(props.field?.type)}
          placeholder="结束"
          className="h-9 min-w-0 border border-border bg-background px-2 text-sm outline-none"
        />
      </div>
    );
  }
  return (
    <input
      value={props.value}
      onChange={(event) => props.onValueChange(event.target.value)}
      onKeyDown={handleKey}
      type={inputTypeForField(props.field?.type)}
      placeholder={LIST_OPERATORS.has(props.operator) ? "多个值用逗号分隔" : "筛选值"}
      className="h-9 min-w-0 border border-border bg-background px-2 text-sm outline-none"
    />
  );
}

function operatorOptionsForField(field: FieldConfig | undefined): CurrentViewFilterOperator[] {
  if (!field) return ["equals"];
  if (field.type === "number" || field.type === "date" || field.type === "datetime") {
    return [
      "equals",
      "not_equals",
      "greater_than",
      "greater_than_or_equal",
      "less_than",
      "less_than_or_equal",
      "between",
      "is_empty",
      "is_not_empty",
    ];
  }
  if (field.type === "boolean") {
    return ["equals", "not_equals", "is_empty", "is_not_empty"];
  }
  if (field.type === "enum") {
    return ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"];
  }
  if (field.type === "multi-enum") {
    return ["in", "not_in", "equals", "not_equals", "is_empty", "is_not_empty"];
  }
  return ["contains", "equals", "not_equals", "starts_with", "is_empty", "is_not_empty"];
}

function filterValueReady(
  field: FieldConfig | undefined,
  operator: CurrentViewFilterOperator,
  value: string,
  valueEnd: string
) {
  if (EMPTY_OPERATORS.has(operator)) return true;
  if (field?.type === "boolean") return true;
  if (operator === BETWEEN_OPERATOR) return Boolean(value.trim() && valueEnd.trim());
  if (LIST_OPERATORS.has(operator)) return splitListValue(value).length > 0;
  return Boolean(value.trim());
}

function buildFilter(
  field: FieldConfig,
  operator: CurrentViewFilterOperator,
  value: string,
  valueEnd: string
): CurrentViewFilter {
  if (EMPTY_OPERATORS.has(operator)) return { field: field.key, operator };
  if (operator === BETWEEN_OPERATOR) {
    return { field: field.key, operator, value: [value.trim(), valueEnd.trim()] };
  }
  if (LIST_OPERATORS.has(operator)) {
    return { field: field.key, operator, value: splitListValue(value) };
  }
  if (field.type === "boolean") {
    return { field: field.key, operator, value: (value || "true") === "true" };
  }
  return { field: field.key, operator, value: value.trim() };
}

function splitListValue(value: string) {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inputTypeForField(type: FieldType | undefined) {
  if (type === "number") return "number";
  if (type === "date") return "date";
  if (type === "datetime") return "datetime-local";
  return "text";
}

function filterLabel(filter: CurrentViewFilter, fields: FieldConfig[]) {
  const field = fields.find((item) => item.key === filter.field);
  const value = filter.value === undefined ? "" : ` ${formatFilterValue(filter.value)}`;
  return `${field?.label ?? filter.field} ${OPERATOR_LABELS[filter.operator]}${value}`;
}

function formatFilterValue(value: unknown) {
  if (Array.isArray(value)) return value.join(" - ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function fieldIsFilterable(field: FieldConfig, role: SchemaRole | null) {
  if (field.deprecated || field.hidden || field.system) return false;
  if (field.type === "attachment" || field.type === "image") return false;
  return canViewFieldValue(field, role);
}

function canViewFieldValue(field: FieldConfig, role: SchemaRole | null) {
  if (!field.sensitive) return true;
  const visibleRoles =
    field.masking?.visible_roles && field.masking.visible_roles.length > 0
      ? field.masking.visible_roles
      : ["admin", "owner"];
  return role !== null && visibleRoles.includes(role);
}
