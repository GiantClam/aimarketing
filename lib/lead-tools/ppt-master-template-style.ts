import { PPT_MASTER_TEMPLATE_MANIFEST } from "@/lib/lead-tools/ppt-master-template-manifest"

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

/**
 * Keep vendor template ids mapped to the style vocabulary used by the
 * content planner without importing the server-only capability index.
 */
export function resolvePptMasterTemplateStyleKey(templateId: string, quickLookup: readonly string[] = []) {
  const normalizedId = normalizeText(templateId)
  if (!normalizedId) return null

  if (normalizedId.startsWith("ppt169_")) return templateId.trim()
  if (["anthropic", "google", "中国电信", "ai_ops", "presentation_core"].includes(templateId.trim())) {
    return "ppt169_building_effective_agents"
  }
  if (templateId === "academic_defense" || templateId === "重庆大学") return "ppt169_attention_is_all_you_need"
  if (templateId === "medical_university") return "ppt169_swiss_grid_systems"
  if (templateId === "psychology_attachment" || templateId === "pixel_retro") {
    return "ppt169_sugar_rush_memphis"
  }
  if (templateId === "government_red") return "ppt169_pritzker_2026"
  if (templateId === "government_blue") return "ppt169_brutalist_ai_newspaper_2026"
  if (templateId === "招商银行") return "ppt169_global_ai_capital_2026"

  const lookup = quickLookup.length
    ? quickLookup
    : PPT_MASTER_TEMPLATE_MANIFEST.find((item) => item.id === templateId)?.quickLookup ?? []
  const normalizedLookup = lookup.map(normalizeText)
  if (normalizedLookup.includes("academic")) return "ppt169_attention_is_all_you_need"
  if (normalizedLookup.includes("technology")) return "ppt169_building_effective_agents"
  if (normalizedLookup.includes("board") || normalizedLookup.includes("finance")) {
    return "ppt169_global_ai_capital_2026"
  }
  if (normalizedLookup.includes("creative") || normalizedLookup.includes("psychology")) {
    return "ppt169_sugar_rush_memphis"
  }

  return PPT_MASTER_TEMPLATE_MANIFEST.some((item) => item.id === templateId)
    ? "ppt169_swiss_grid_systems"
    : null
}
