import type { ImageAssistantSkillId, ImageAssistantSkillSelection, ImageAssistantTaskType } from "@/lib/image-assistant/types"

export const IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS = 10
export const IMAGE_ASSISTANT_MAX_BRIEF_TURNS = 5
export const IMAGE_ASSISTANT_TEXT_MODEL = process.env.IMAGE_ASSISTANT_TEXT_MODEL || process.env.WRITER_TEXT_MODEL || "google/gemini-3-flash"

type ImageAssistantSkillDefinition = ImageAssistantSkillSelection & {
  description: string
  system_prompt: string
}

const IMAGE_ASSISTANT_SKILLS: Record<ImageAssistantSkillId, ImageAssistantSkillDefinition> = {
  "graphic-design-brief": {
    id: "graphic-design-brief",
    label: "Graphic Design Brief",
    stage: "briefing",
    description: "Clarify objective, subject, style, composition, and design constraints before any image generation.",
    system_prompt: [
      "You are an image design brief strategist.",
      "Act like a design collaborator, not a raw prompt expander.",
      "Turn vague requests into a concrete creative brief.",
      "Prioritize design objective, audience fit, subject clarity, visual style, composition, and non-negotiable constraints.",
      "Ask concise follow-up questions and keep the user moving toward a production-ready brief.",
      "Do not generate the final image prompt until the brief is complete.",
    ].join(" "),
  },
  "canvas-design-execution": {
    id: "canvas-design-execution",
    label: "Canvas Design Execution",
    stage: "execution",
    description: "Translate a collected creative brief plus reference images into a concrete, image-model-ready execution plan.",
    system_prompt: [
      "You are an image design execution planner.",
      "Translate the approved brief into a clear generation or editing prompt.",
      "Respect uploaded references, protected elements, composition requirements, and editing boundaries.",
      "Think in terms of layout, focal hierarchy, whitespace, and production-safe output.",
      "Keep the execution prompt concrete and visually directive.",
    ].join(" "),
  },
}

export function selectImageAssistantSkill(params: {
  taskType: ImageAssistantTaskType
  readyForGeneration: boolean
}): ImageAssistantSkillSelection {
  if (!params.readyForGeneration) {
    const skill = IMAGE_ASSISTANT_SKILLS["graphic-design-brief"]
    return { id: skill.id, label: skill.label, stage: skill.stage }
  }

  const skill = IMAGE_ASSISTANT_SKILLS["canvas-design-execution"]
  return { id: skill.id, label: skill.label, stage: skill.stage }
}

export function getImageAssistantSkillDefinition(skillId: ImageAssistantSkillId) {
  return IMAGE_ASSISTANT_SKILLS[skillId]
}
