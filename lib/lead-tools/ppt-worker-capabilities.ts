import fs from "node:fs"
import path from "node:path"

import { PPT_MASTER_TEMPLATE_MANIFEST } from "@/lib/lead-tools/ppt-master-template-manifest"

type PptMasterLayoutsIndex = {
  categories?: Record<string, { label?: string; layouts?: string[] }>
  quickLookup?: Record<string, string[]>
  layouts?: Record<
    string,
    {
      label?: string
      summary?: string
      tone?: string
      themeMode?: string
      keywords?: string[]
    }
  >
}

type PptMasterFlatTemplateIndex = Record<
  string,
  {
    summary?: string
    primary_color?: string
    canvas_format?: string
    page_count?: number
  }
>

export type PptMasterTemplateMetadata = {
  id: string
  label: string
  summary: string
  tone: string
  themeMode: string
  keywords: string[]
  categories: string[]
  quickLookup: string[]
}

type PptMasterExamplesIndex = {
  projects?: Array<{
    id?: string
    title?: string
    description?: string
    desc?: string
    style?: string
    styleName?: string
    tags?: string[]
  }>
}

const PPT_MASTER_LAYOUTS_INDEX_RELATIVE_PATH = path.join(
  "skills",
  "ppt-master",
  "templates",
  "layouts",
  "layouts_index.json",
)
const PPT_MASTER_DECKS_INDEX_RELATIVE_PATH = path.join(
  "skills",
  "ppt-master",
  "templates",
  "decks",
  "decks_index.json",
)
const PPT_MASTER_BRANDS_INDEX_RELATIVE_PATH = path.join(
  "skills",
  "ppt-master",
  "templates",
  "brands",
  "brands_index.json",
)
const PPT_MASTER_EXAMPLES_INDEX_RELATIVE_PATH = path.join("examples", "examples.json")

let cachedPptMasterLayoutsIndex: PptMasterLayoutsIndex | null = null
let cachedPptMasterDecksIndex: PptMasterFlatTemplateIndex | null = null
let cachedPptMasterBrandsIndex: PptMasterFlatTemplateIndex | null = null
let cachedPptMasterExamplesIndex: PptMasterExamplesIndex | null = null

function getPptMasterRepoCandidates() {
  const projectCacheCandidate = path.resolve(process.cwd(), ".cache", "ppt-master-upstream")

  return [process.env.PPT_MASTER_REPO_DIR, projectCacheCandidate].filter(
    (value): value is string => Boolean(value?.trim()),
  )
}

function normalizePptMasterLayoutsIndex(parsed: Record<string, unknown>): PptMasterLayoutsIndex {
  return parsed.layouts && typeof parsed.layouts === "object"
    ? (parsed as PptMasterLayoutsIndex)
    : {
        categories: {},
        quickLookup: {},
        layouts: parsed as NonNullable<PptMasterLayoutsIndex["layouts"]>,
      }
}

function readPptMasterIndexFile(relativePath: string) {
  for (const candidate of getPptMasterRepoCandidates()) {
    const indexPath = path.join(candidate, relativePath)
    try {
      return JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, unknown>
    } catch {
      continue
    }
  }

  return null
}

function loadPptMasterLayoutsIndex() {
  if (cachedPptMasterLayoutsIndex) {
    return cachedPptMasterLayoutsIndex
  }

  const parsed = readPptMasterIndexFile(PPT_MASTER_LAYOUTS_INDEX_RELATIVE_PATH)
  cachedPptMasterLayoutsIndex = parsed ? normalizePptMasterLayoutsIndex(parsed) : { categories: {}, quickLookup: {}, layouts: {} }
  return cachedPptMasterLayoutsIndex
}

function normalizePptMasterFlatTemplateIndex(parsed: Record<string, unknown> | null) {
  if (!parsed) {
    return {}
  }

  return parsed as PptMasterFlatTemplateIndex
}

function loadPptMasterDecksIndex() {
  if (cachedPptMasterDecksIndex) {
    return cachedPptMasterDecksIndex
  }

  cachedPptMasterDecksIndex = normalizePptMasterFlatTemplateIndex(readPptMasterIndexFile(PPT_MASTER_DECKS_INDEX_RELATIVE_PATH))
  return cachedPptMasterDecksIndex
}

function loadPptMasterBrandsIndex() {
  if (cachedPptMasterBrandsIndex) {
    return cachedPptMasterBrandsIndex
  }

  cachedPptMasterBrandsIndex = normalizePptMasterFlatTemplateIndex(readPptMasterIndexFile(PPT_MASTER_BRANDS_INDEX_RELATIVE_PATH))
  return cachedPptMasterBrandsIndex
}

function loadPptMasterExamplesIndex() {
  if (cachedPptMasterExamplesIndex) {
    return cachedPptMasterExamplesIndex
  }

  cachedPptMasterExamplesIndex =
    (readPptMasterIndexFile(PPT_MASTER_EXAMPLES_INDEX_RELATIVE_PATH) as PptMasterExamplesIndex | null) ?? {}
  return cachedPptMasterExamplesIndex
}

const officialPptMasterTemplateHints: Record<
  string,
  {
    categories?: string[]
    quickLookup?: string[]
    keywords?: string[]
  }
> = {
  academic_defense: {
    categories: ["scenario"],
    quickLookup: ["academic"],
    keywords: ["academic", "defense", "research", "thesis"],
  },
  ai_ops: {
    categories: ["brand"],
    quickLookup: ["technology", "general_business", "government"],
    keywords: ["telecom", "ai operations", "digital intelligence", "architecture", "platform"],
  },
  government_blue: {
    categories: ["brand"],
    quickLookup: ["government"],
    keywords: ["government", "policy", "digitalization", "smart city"],
  },
  government_red: {
    categories: ["brand"],
    quickLookup: ["government"],
    keywords: ["government", "policy", "party building", "authoritative"],
  },
  medical_university: {
    categories: ["scenario"],
    quickLookup: ["medical", "academic"],
    keywords: ["medical", "hospital", "clinical", "research"],
  },
  pixel_retro: {
    categories: ["special"],
    quickLookup: ["creative"],
    keywords: ["pixel", "retro", "gaming", "cyberpunk"],
  },
  psychology_attachment: {
    categories: ["scenario"],
    quickLookup: ["psychology"],
    keywords: ["psychology", "healing", "counseling", "therapy"],
  },
  anthropic: {
    categories: ["brand"],
    quickLookup: ["technology"],
    keywords: ["anthropic", "claude", "llm", "developer"],
  },
  google: {
    categories: ["brand"],
    quickLookup: ["technology", "general_business"],
    keywords: ["google", "workspace", "developer", "product launch"],
  },
  中国电建: {
    categories: ["brand"],
    quickLookup: ["energy", "general_business"],
    keywords: ["powerchina", "engineering", "energy", "infrastructure"],
  },
  中汽研: {
    categories: ["brand"],
    quickLookup: ["certification", "general_business"],
    keywords: ["catarc", "certification", "testing", "automotive"],
  },
  中国电信: {
    categories: ["brand"],
    quickLookup: ["technology", "general_business"],
    keywords: ["telecom", "network", "operator", "digitalization"],
  },
  招商银行: {
    categories: ["brand"],
    quickLookup: ["finance", "board"],
    keywords: ["bank", "finance", "budget", "risk"],
  },
  重庆大学: {
    categories: ["scenario"],
    quickLookup: ["academic"],
    keywords: ["university", "academic", "defense", "research"],
  },
  ppt169_attention_is_all_you_need: {
    categories: ["scenario"],
    quickLookup: ["academic"],
    keywords: ["attention", "transformer", "paper reading", "research"],
  },
  ppt169_building_effective_agents: {
    categories: ["brand"],
    quickLookup: ["technology"],
    keywords: ["agents", "orchestration", "workflow", "platform"],
  },
  ppt169_cangzhuo: {
    categories: ["brand"],
    quickLookup: ["board", "strategy"],
    keywords: ["executive memo", "review", "agenda", "management"],
  },
  ppt169_general_dark_tech_claude_code_auto_mode: {
    categories: ["general"],
    quickLookup: ["technology", "general_business"],
    keywords: ["dark tech", "developer product", "system", "platform"],
  },
  ppt169_glassmorphism_demo: {
    categories: ["general"],
    quickLookup: ["technology", "general_business"],
    keywords: ["glassmorphism", "saas", "dashboard", "product launch"],
  },
  ppt169_global_ai_capital_2026: {
    categories: ["brand"],
    quickLookup: ["finance", "board", "strategy"],
    keywords: ["capital", "finance", "market", "investment"],
  },
  ppt169_pritzker_2026: {
    categories: ["special"],
    quickLookup: ["creative"],
    keywords: ["architecture", "editorial", "long read"],
  },
  ppt169_sugar_rush_memphis: {
    categories: ["special"],
    quickLookup: ["creative"],
    keywords: ["memphis", "pop", "festival", "creative"],
  },
  ppt169_swiss_grid_systems: {
    categories: ["general"],
    quickLookup: ["general_business"],
    keywords: ["swiss", "grid", "typography", "design systems"],
  },
}

function mergeUniqueStrings(...parts: Array<readonly string[] | undefined>) {
  return Array.from(new Set(parts.flatMap((part) => part ?? []).map((item) => item.trim()).filter(Boolean)))
}

function buildPptMasterTemplateMetadataList() {
  const index = loadPptMasterLayoutsIndex()
  const layouts = index.layouts ?? {}
  const categoryMap = new Map<string, string[]>()
  const quickLookupMap = new Map<string, string[]>()
  const metadataById = new Map<string, PptMasterTemplateMetadata>()

  for (const [categoryId, category] of Object.entries(index.categories ?? {})) {
    for (const templateId of category.layouts ?? []) {
      categoryMap.set(templateId, [...(categoryMap.get(templateId) ?? []), categoryId])
    }
  }

  for (const [bucketId, templateIds] of Object.entries(index.quickLookup ?? {})) {
    for (const templateId of templateIds ?? []) {
      quickLookupMap.set(templateId, [...(quickLookupMap.get(templateId) ?? []), bucketId])
    }
  }

  const upsertTemplate = (
    id: string,
    input: {
      label?: string
      summary?: string
      tone?: string
      themeMode?: string
      keywords?: readonly string[]
      categories?: readonly string[]
      quickLookup?: readonly string[]
    },
  ) => {
    const existing = metadataById.get(id)
    const hints = officialPptMasterTemplateHints[id]
    const next: PptMasterTemplateMetadata = {
      id,
      label: input.label?.trim() || existing?.label || id,
      summary: input.summary?.trim() || existing?.summary || "",
      tone: input.tone?.trim() || existing?.tone || "",
      themeMode: input.themeMode?.trim() || existing?.themeMode || "",
      keywords: mergeUniqueStrings(existing?.keywords, input.keywords, hints?.keywords),
      categories: mergeUniqueStrings(existing?.categories, input.categories, hints?.categories),
      quickLookup: mergeUniqueStrings(existing?.quickLookup, input.quickLookup, hints?.quickLookup),
    }
    metadataById.set(id, next)
  }

  for (const template of PPT_MASTER_TEMPLATE_MANIFEST) {
    upsertTemplate(template.id, template)
  }

  for (const [id, layout] of Object.entries(layouts)) {
    upsertTemplate(id, {
      label: layout.label,
      summary: layout.summary,
      tone: layout.tone,
      themeMode: layout.themeMode,
      keywords: Array.isArray(layout.keywords) ? layout.keywords : [],
      categories: categoryMap.get(id) ?? [],
      quickLookup: quickLookupMap.get(id) ?? [],
    })
  }

  for (const [id, deck] of Object.entries(loadPptMasterDecksIndex())) {
    upsertTemplate(id, {
      summary: deck.summary,
      categories: ["brand"],
    })
  }

  for (const [id, brand] of Object.entries(loadPptMasterBrandsIndex())) {
    upsertTemplate(id, {
      summary: brand.summary,
      categories: ["brand"],
    })
  }

  for (const project of loadPptMasterExamplesIndex().projects ?? []) {
    if (!project.id?.trim()) continue
    upsertTemplate(project.id.trim(), {
      label: project.title,
      summary: project.desc || project.description,
      tone: [project.styleName, project.style].filter(Boolean).join(" / "),
      keywords: mergeUniqueStrings(project.tags, project.style ? [project.style] : [], project.styleName ? [project.styleName] : []),
    })
  }

  return [...metadataById.values()]
}

export function getPptMasterTemplateCatalog() {
  return buildPptMasterTemplateMetadataList().map((template) => ({
    id: template.id,
    label: template.label,
    summary: template.summary,
    tone: template.tone,
    themeMode: template.themeMode,
    categories: [...template.categories],
  }))
}

export function getPptWorkerSupportedTemplateIds() {
  return getPptMasterLibraryTemplateIds()
}

export function isPptWorkerTemplateSupported(templateId: unknown) {
  return typeof templateId === "string" && getPptWorkerSupportedTemplateIds().includes(templateId.trim())
}

export function getPptMasterLibraryTemplateIds() {
  return buildPptMasterTemplateMetadataList().map((item) => item.id)
}

export function isPptMasterLibraryTemplateSupported(templateId: unknown) {
  return typeof templateId === "string" && getPptMasterLibraryTemplateIds().includes(templateId.trim())
}

export function resetPptWorkerCapabilitiesCachesForTests() {
  cachedPptMasterLayoutsIndex = null
  cachedPptMasterDecksIndex = null
  cachedPptMasterBrandsIndex = null
  cachedPptMasterExamplesIndex = null
}
