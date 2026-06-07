import {
  LABEL_TEMPLATE_CODES,
  normalizeLabelPrintConfig,
  type LabelPrintConfig,
} from "@/api/schemas";

export function firstEnabledTemplate(templates: LabelPrintConfig["templates"]) {
  return LABEL_TEMPLATE_CODES.find((code) => templates[code]?.enabled);
}

export function ensureDefaultTemplateEnabled(config: LabelPrintConfig): LabelPrintConfig {
  const defaultTemplate = config.templates[config.default_template_code];
  if (defaultTemplate?.enabled) return config;
  const fallback = firstEnabledTemplate(config.templates) ?? "asset_standard";
  return {
    ...config,
    default_template_code: fallback,
    templates: {
      ...config.templates,
      [fallback]: {
        ...(config.templates[fallback] ?? normalizeLabelPrintConfig(null).templates[fallback]!),
        enabled: true,
      },
    },
  };
}
