export type EnterpriseWorkflowPreset = {
  id: string
  name: string
  industry: string
  audience: string
  brandVoice: string
  channelTargets: string[]
  reviewRules: string[]
  bannedTerms: string[]
  allowedKnowledgeDatasetIds: number[]
  notes: string
  isDefault: boolean
}

const DEFAULT_PRESET_ID_PREFIX = "preset"

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => normalizeText(item)).filter(Boolean))]
}

function normalizeNumberList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is number => Number.isInteger(item) && item > 0))]
}

function normalizePresetId(value: unknown, index: number) {
  const normalized = normalizeText(value)
  return normalized || `${DEFAULT_PRESET_ID_PREFIX}-${index + 1}`
}

function buildPresetName(index: number, locale: "zh" | "en") {
  return locale === "zh" ? `企业预设 ${index + 1}` : `Enterprise preset ${index + 1}`
}

function normalizePreset(
  value: unknown,
  index: number,
  locale: "zh" | "en",
): EnterpriseWorkflowPreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  return {
    id: normalizePresetId(record.id, index),
    name: normalizeText(record.name) || buildPresetName(index, locale),
    industry: normalizeText(record.industry),
    audience: normalizeText(record.audience),
    brandVoice: normalizeText(record.brandVoice),
    channelTargets: normalizeStringList(record.channelTargets),
    reviewRules: normalizeStringList(record.reviewRules),
    bannedTerms: normalizeStringList(record.bannedTerms),
    allowedKnowledgeDatasetIds: normalizeNumberList(record.allowedKnowledgeDatasetIds),
    notes: normalizeText(record.notes),
    isDefault: Boolean(record.isDefault),
  }
}

export function listEnterpriseWorkflowPresets(
  metadata: Record<string, unknown> | null | undefined,
  locale: "zh" | "en" = "en",
) {
  const raw = metadata && typeof metadata === "object" ? (metadata.enterprisePresets as unknown) : null
  const presets = Array.isArray(raw)
    ? raw
        .map((item, index) => normalizePreset(item, index, locale))
        .filter((item): item is EnterpriseWorkflowPreset => Boolean(item))
    : []

  if (presets.length === 0) return []

  const defaultIndex = presets.findIndex((preset) => preset.isDefault)
  return presets.map((preset, index) => ({
    ...preset,
    isDefault: defaultIndex >= 0 ? index === defaultIndex : index === 0,
  }))
}

export function getDefaultEnterpriseWorkflowPreset(
  metadata: Record<string, unknown> | null | undefined,
  locale: "zh" | "en" = "en",
) {
  return listEnterpriseWorkflowPresets(metadata, locale).find((preset) => preset.isDefault) ?? null
}

export function upsertEnterpriseWorkflowPresetsMetadata(
  metadata: Record<string, unknown> | null | undefined,
  presets: EnterpriseWorkflowPreset[],
) {
  const normalizedPresets = presets.map((preset, index) => ({
    ...preset,
    id: normalizePresetId(preset.id, index),
    name: normalizeText(preset.name) || buildPresetName(index, "en"),
    industry: normalizeText(preset.industry),
    audience: normalizeText(preset.audience),
    brandVoice: normalizeText(preset.brandVoice),
    channelTargets: normalizeStringList(preset.channelTargets),
    reviewRules: normalizeStringList(preset.reviewRules),
    bannedTerms: normalizeStringList(preset.bannedTerms),
    allowedKnowledgeDatasetIds: normalizeNumberList(preset.allowedKnowledgeDatasetIds),
    notes: normalizeText(preset.notes),
    isDefault: Boolean(preset.isDefault),
  }))

  const defaultIndex = normalizedPresets.findIndex((preset) => preset.isDefault)
  const nextPresets = normalizedPresets.map((preset, index) => ({
    ...preset,
    isDefault: defaultIndex >= 0 ? index === defaultIndex : index === 0,
  }))

  return {
    ...(metadata && typeof metadata === "object" ? metadata : {}),
    enterprisePresets: nextPresets,
    defaultPresetId: nextPresets.find((preset) => preset.isDefault)?.id ?? null,
  } satisfies Record<string, unknown>
}

export function createEmptyEnterpriseWorkflowPreset(locale: "zh" | "en", index: number): EnterpriseWorkflowPreset {
  return {
    id: `${DEFAULT_PRESET_ID_PREFIX}-${Date.now()}-${index + 1}`,
    name: buildPresetName(index, locale),
    industry: "",
    audience: "",
    brandVoice: "",
    channelTargets: [],
    reviewRules: [],
    bannedTerms: [],
    allowedKnowledgeDatasetIds: [],
    notes: "",
    isDefault: index === 0,
  }
}

export function buildEnterpriseWorkflowPresetPrompt(
  preset: EnterpriseWorkflowPreset | null | undefined,
  locale: "zh" | "en",
) {
  if (!preset) return ""

  const sections = locale === "zh"
    ? [
        "Enterprise preset",
        preset.industry ? `- 行业: ${preset.industry}` : "",
        preset.audience ? `- 目标受众: ${preset.audience}` : "",
        preset.brandVoice ? `- 品牌语气: ${preset.brandVoice}` : "",
        preset.channelTargets.length > 0 ? `- 默认渠道: ${preset.channelTargets.join("、")}` : "",
        preset.reviewRules.length > 0 ? `- 审查规则: ${preset.reviewRules.join("；")}` : "",
        preset.bannedTerms.length > 0 ? `- 禁用词: ${preset.bannedTerms.join("、")}` : "",
        preset.notes ? `- 备注: ${preset.notes}` : "",
      ]
    : [
        "Enterprise preset",
        preset.industry ? `- Industry: ${preset.industry}` : "",
        preset.audience ? `- Audience: ${preset.audience}` : "",
        preset.brandVoice ? `- Brand voice: ${preset.brandVoice}` : "",
        preset.channelTargets.length > 0 ? `- Default channels: ${preset.channelTargets.join(", ")}` : "",
        preset.reviewRules.length > 0 ? `- Review rules: ${preset.reviewRules.join("; ")}` : "",
        preset.bannedTerms.length > 0 ? `- Banned terms: ${preset.bannedTerms.join(", ")}` : "",
        preset.notes ? `- Notes: ${preset.notes}` : "",
      ]

  return sections.filter(Boolean).join("\n").trim()
}
