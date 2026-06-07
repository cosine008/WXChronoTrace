export function uniqueKeys(keys: string[] | undefined) {
  return [...new Set((keys ?? []).filter(Boolean))];
}

export function hasIntersection(values: string[], targetSet: Set<string>) {
  return values.some((value) => targetSet.has(value));
}

export function areValuesEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (["number", "boolean", "bigint"].includes(typeof value)) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
