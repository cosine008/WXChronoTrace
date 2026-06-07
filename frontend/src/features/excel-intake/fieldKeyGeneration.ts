import type { FieldDraft, SchemaDraft } from "@/api/excelIntake";
import {
  GENERATED_ENTITY_CODE_FIELD_KEY,
  IDENTITY_CODE_FIELD_KEY,
  PERSON_CODE_FIELD_KEY,
} from "@/lib/schemaFields";
import {
  PINYIN_BOUNDARIES,
  PINYIN_INITIAL_OVERRIDES,
  SMART_TRANSLATIONS,
} from "./fieldKeyDictionary";

export type FieldKeyGenerationMode = "smart-english" | "pinyin-initials" | "auto-number";

export const DEFAULT_FIELD_KEY_GENERATION_MODE: FieldKeyGenerationMode = "smart-english";

export const FIELD_KEY_GENERATION_OPTIONS: Array<{
  value: FieldKeyGenerationMode;
  label: string;
}> = [
  { value: "smart-english", label: "智能英文编码" },
  { value: "pinyin-initials", label: "拼音首字母" },
  { value: "auto-number", label: "自动编号" },
];

const FIELD_KEY_RE = /^[a-z][a-z0-9_]*$/;
const FIELD_KEY_MAX_LENGTH = 64;
const SYSTEM_FIELD_KEYS = new Set([
  IDENTITY_CODE_FIELD_KEY,
  GENERATED_ENTITY_CODE_FIELD_KEY,
  PERSON_CODE_FIELD_KEY,
  "system_code",
  "valid_from",
]);

const SMART_TRANSLATION_KEYS = Array.from(SMART_TRANSLATIONS.keys()).sort((left, right) => right.length - left.length);

const pinyinCollator = new Intl.Collator("zh-CN-u-co-pinyin");

export function regenerateFieldKeys(args: {
  schema: SchemaDraft;
  fields: FieldDraft[];
  mode?: FieldKeyGenerationMode;
  preservedSourceIndexes?: ReadonlySet<number>;
}) {
  const mode = args.mode ?? DEFAULT_FIELD_KEY_GENERATION_MODE;
  const preservedSourceIndexes = args.preservedSourceIndexes ?? new Set<number>();
  const usedKeys = new Set<string>();
  const keyMap = new Map<string, string>();
  const fields = args.fields.map((field, index) => {
    if (preservedSourceIndexes.has(field.source_index)) {
      usedKeys.add(field.key);
      keyMap.set(field.key, field.key);
      return field;
    }
    const base = generatedKeyForField(field, mode, index + 1);
    const key = uniqueFieldKey(base, usedKeys, field.source_index || index + 1);
    usedKeys.add(key);
    keyMap.set(field.key, key);
    return { ...field, key };
  });
  return {
    schema: remapSchemaIdentityKeys(args.schema, fields, keyMap),
    fields,
  };
}

export function generatedKeyForField(field: FieldDraft, mode: FieldKeyGenerationMode, fallbackIndex = 1) {
  if (mode === "auto-number") return `field_${field.source_index || fallbackIndex}`;
  const source = field.source_column || field.label || field.key;
  if (mode === "pinyin-initials") return keyFromPinyinInitials(source, fallbackIndex);
  return keyFromSmartEnglish(source, fallbackIndex);
}

function remapSchemaIdentityKeys(schema: SchemaDraft, fields: FieldDraft[], keyMap: Map<string, string>): SchemaDraft {
  const identityFieldKey = keyMap.get(schema.identity_field_key) ?? schema.identity_field_key;
  const identityFieldKeys = schema.identity_field_keys.map((key) => keyMap.get(key) ?? key);
  return {
    ...schema,
    identity_field_key: identityFieldKey,
    identity_field_keys: identityFieldKeys,
    fields_config: fields,
  };
}

function keyFromSmartEnglish(value: string, fallbackIndex: number) {
  const parts: string[] = [];
  for (let index = 0; index < value.length; ) {
    const ascii = asciiRunAt(value, index);
    if (ascii) {
      parts.push(...asciiKeyParts(ascii.text));
      index = ascii.nextIndex;
      continue;
    }
    const match = smartTranslationAt(value, index);
    if (match) {
      parts.push(...match.parts);
      index = match.nextIndex;
      continue;
    }
    index += 1;
  }
  const key = normalizeKeyParts(parts);
  return key || keyFromPinyinInitials(value, fallbackIndex);
}

function keyFromPinyinInitials(value: string, fallbackIndex: number) {
  const parts: string[] = [];
  let initials = "";
  for (let index = 0; index < value.length; ) {
    const ascii = asciiRunAt(value, index);
    if (ascii) {
      if (initials) {
        parts.push(initials);
        initials = "";
      }
      parts.push(...asciiKeyParts(ascii.text));
      index = ascii.nextIndex;
      continue;
    }
    const char = value[index];
    const initial = pinyinInitial(char);
    if (initial) initials += initial;
    else if (initials) {
      parts.push(initials);
      initials = "";
    }
    index += 1;
  }
  if (initials) parts.push(initials);
  return normalizeKeyParts(parts) || `field_${fallbackIndex}`;
}

function smartTranslationAt(value: string, index: number) {
  const source = value.slice(index);
  const key = SMART_TRANSLATION_KEYS.find((item) => source.startsWith(item));
  if (!key) return null;
  return {
    parts: SMART_TRANSLATIONS.get(key) ?? [],
    nextIndex: index + key.length,
  };
}

function asciiRunAt(value: string, index: number) {
  const source = value.slice(index);
  const match = /^[A-Za-z0-9]+/.exec(source);
  if (!match?.[0]) return null;
  return {
    text: match[0],
    nextIndex: index + match[0].length,
  };
}

function asciiKeyParts(value: string) {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .split(/_+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  return normalized;
}

function normalizeKeyParts(parts: string[]) {
  const key = parts
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/g, "");
  return limitFieldKey(key);
}

function uniqueFieldKey(base: string, usedKeys: Set<string>, fallbackIndex: number) {
  let key = normalizeGeneratedKey(base) || `field_${fallbackIndex}`;
  if (SYSTEM_FIELD_KEYS.has(key)) key = `${key}_field`;
  let candidate = limitFieldKey(key);
  let suffix = 2;
  while (usedKeys.has(candidate) || SYSTEM_FIELD_KEYS.has(candidate)) {
    const suffixText = `_${suffix}`;
    candidate = `${limitFieldKey(key, FIELD_KEY_MAX_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeGeneratedKey(value: string) {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+/g, "_")
    .replace(/_+$/g, "");
  return FIELD_KEY_RE.test(key) ? limitFieldKey(key) : "";
}

function limitFieldKey(value: string, maxLength = FIELD_KEY_MAX_LENGTH) {
  return value.length <= maxLength ? value : value.slice(0, maxLength).replace(/_+$/g, "");
}

function pinyinInitial(char: string) {
  const override = PINYIN_INITIAL_OVERRIDES.get(char);
  if (override) return override;
  if (!isCjk(char)) return "";
  for (let index = PINYIN_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    const [initial, boundary] = PINYIN_BOUNDARIES[index];
    if (pinyinCollator.compare(char, boundary) >= 0) return initial;
  }
  return "";
}

function isCjk(char: string) {
  return /[\u3400-\u9fff]/.test(char);
}
