export type AiEntrySkillType = "prompt" | "tool"

export type AiEntrySkillDefinition = {
  id: string
  name: string
  description: string
  type: AiEntrySkillType
  triggerHints: string[]
  instruction: string
  toolIds: string[]
  mcpServerIds: string[]
  version: string
}

const SKILL_REGISTRY: Record<string, AiEntrySkillDefinition> = {
  "executive-consulting": {
    id: "executive-consulting",
    name: "Executive Consulting",
    description: "Prompt skill for structured enterprise consulting and operator-grade recommendations.",
    type: "prompt",
    triggerHints: ["strategy", "consulting", "growth plan", "经营诊断", "战略", "增长方案"],
    instruction: [
      "When the task is advisory, think like an executive consulting operator.",
      "Prioritize diagnosis, constraints, decision quality, and the next practical move.",
      "Avoid generic inspiration lists; prefer concrete options, tradeoffs, and execution sequencing.",
    ].join(" "),
    toolIds: [],
    mcpServerIds: [],
    version: "2026-06-24",
  },
  "longform-writing": {
    id: "longform-writing",
    name: "Longform Writing",
    description: "Prompt skill for structured long-form copy such as articles, whitepapers, or press releases.",
    type: "prompt",
    triggerHints: ["article", "blog", "press release", "whitepaper", "长文", "稿件", "新闻稿"],
    instruction: [
      "When writing long-form content, produce a clear structure before filling detail.",
      "Keep the voice concise, high-signal, and business-useful.",
      "Use headings, narrative flow, and concrete claims that can be revised or reused downstream.",
    ].join(" "),
    toolIds: [],
    mcpServerIds: [],
    version: "2026-06-24",
  },
  "ppt-master": {
    id: "ppt-master",
    name: "PPT Master",
    description: "Generate presentation previews and export editable PPTX deliverables through the governed ppt-master runtime.",
    type: "tool",
    triggerHints: [
      "ppt",
      "presentation",
      "slide deck",
      "pitch deck",
      "deck",
      "演示文稿",
      "汇报",
      "PPTX",
      "幻灯片",
    ],
    instruction: [
      "For presentation requests grounded in external facts, current events, industry research, companies, policies, markets, or other time-sensitive claims, first call web_search and turn the findings into a concise research brief.",
      "Use the research brief to refine the deck brief before generating slides; do not rely on the raw user prompt alone when factual evidence is needed.",
      "After the brief is research-backed, call preview_ppt_deck with the complete brief.",
      "After preview, summarize the tool-provided recommended variant and wait for the user to explicitly confirm export before calling export_ppt_deck.",
      "When the user confirms export, use the latest preview context and the chosen variant key; if no variant is specified, use the default recommended variant.",
      "If the user is already on an explicit export-confirmation turn and you must rebuild the preview in that same turn because the old preview is missing, expired, or invalid, immediately call export_ppt_deck after the fresh preview succeeds. Do not ask for duplicate confirmation.",
      "If export_ppt_deck fails with unchanged parameters, do not blindly retry the same call in a loop. Explain the failure reason and what needs to change before retrying.",
      "Do not claim a downloadable deck exists until export_ppt_deck returns artifact metadata.",
    ].join(" "),
    toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
    mcpServerIds: [],
    version: "2026-06-24",
  },
}

export function listAiEntrySkills() {
  return Object.values(SKILL_REGISTRY)
}

export function isAiEntrySkillId(value: unknown): value is keyof typeof SKILL_REGISTRY {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SKILL_REGISTRY, value)
}

export function getAiEntrySkillById(skillId: string | null | undefined) {
  if (!skillId || !isAiEntrySkillId(skillId)) return null
  return SKILL_REGISTRY[skillId]
}

export function getAiEntrySkillsByIds(skillIds: string[]) {
  return skillIds
    .map((skillId) => getAiEntrySkillById(skillId))
    .filter((skill): skill is AiEntrySkillDefinition => Boolean(skill))
}

export function buildAiEntrySkillInstruction(skillIds: string[]) {
  const sections = getAiEntrySkillsByIds(skillIds)
    .map((skill) => skill.instruction.trim())
    .filter(Boolean)

  if (sections.length === 0) return ""
  return `# Routed Skills\n\n${sections.join("\n\n---\n\n")}`
}
