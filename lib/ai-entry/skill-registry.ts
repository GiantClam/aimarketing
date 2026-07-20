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
      "When the user changes an existing PPT brief, compare the latest request with the current structured brief and call update_ppt_brief with the complete merged brief. Do not use string-pattern guesses, do not treat a field-only edit as a new topic, and do not call preview_ppt_deck on an edit-only turn.",
      "At the start of a new editable PPT request, use update_ppt_brief to interpret the user's request and establish the complete structured brief; do not infer brief fields in code.",
      "After the brief is complete and the user confirms it, use recommend_ppt_templates to select exactly one exact id from the full ppt-master catalog. The recommendation must be based on the complete brief and conversation context; do not return alternatives.",
      "Only call preview_ppt_deck after the user has selected that one template, passing its exact templateId with templateMode=single-template. The editable assistant renders exactly one template and one variant per conversation turn; never use auto-4 or generate alternative directions.",
      "After preview, summarize the tool-provided recommended variant and wait for the user to explicitly confirm export before calling export_ppt_deck.",
      "When the user confirms export, use the latest preview context and the chosen variant key; if no variant is specified, use the default recommended variant.",
      "If the user is already on an explicit export-confirmation turn and you must rebuild the preview in that same turn because the old preview is missing, expired, or invalid, immediately call export_ppt_deck after the fresh preview succeeds. Do not ask for duplicate confirmation.",
      "If export_ppt_deck fails with unchanged parameters, do not blindly retry the same call in a loop. Explain the failure reason and what needs to change before retrying.",
      "Do not claim a downloadable deck exists until export_ppt_deck returns artifact metadata.",
    ].join(" "),
    toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck", "update_ppt_brief", "recommend_ppt_templates"],
    mcpServerIds: [],
    version: "2026-06-24",
  },
  "dashiai-ppt": {
    id: "dashiai-ppt",
    name: "Dashi AI PPT",
    description: "OpenCode-native conversational presentation production with the Dashi AI PPT skill.",
    type: "prompt",
    triggerHints: ["演讲型PPT", "演讲型 PPT", "presentation assistant", "speaker deck", "汇报演讲"],
    instruction: [
      "You are the primary conversational presentation agent for the speaker-style PPT assistant.",
      "Read and follow the native Dashi AI PPT skill at /opt/dashiai-ppt/SKILL.md; do not recreate its workflow with platform tools or a fixed brief form.",
      "Use the current conversation as the source of truth, ask focused follow-up questions when audience, objective, evidence, visual direction, or delivery constraints are genuinely missing, and continue across turns without restarting the project.",
      "Use Dashi's own layout, props, render, visual QA, and export flow. Do not call preview_ppt_deck, export_ppt_deck, update_ppt_brief, or recommend_ppt_templates.",
      "When the user asks for research or the deck needs current evidence, use OpenCode's network tools from inside the sandbox and cite or summarize the sources in the deck and final response.",
      "Write every deliverable under the current turn's artifacts directory and create artifact-manifest.json; do not claim a download until the native Dashi export has succeeded.",
    ].join(" "),
    toolIds: [],
    mcpServerIds: [],
    version: "2026-07-14",
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
