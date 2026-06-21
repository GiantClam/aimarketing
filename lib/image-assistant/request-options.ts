import {
  normalizeIncomingResolution,
  normalizeIncomingSizePreset,
} from "@/lib/image-assistant/model-options"
import type { ImageAssistantResolution, ImageAssistantSizePreset } from "@/lib/image-assistant/types"

const SIZE_PRESETS = new Set<ImageAssistantSizePreset>(["1:1", "4:5", "3:4", "4:3", "16:9", "9:16"])

export function inferImageAssistantRequestOptionsFromPrompt(prompt: string) {
  const normalizedPrompt = prompt.normalize("NFKC")
  const ratioMatch = normalizedPrompt.match(/(?:^|[^\d])(\d{1,2})\s*[:xX]\s*(\d{1,2})(?!\d)/)
  const ratio = ratioMatch ? `${ratioMatch[1]}:${ratioMatch[2]}` : ""
  const sizePreset = SIZE_PRESETS.has(ratio as ImageAssistantSizePreset) ? (ratio as ImageAssistantSizePreset) : null

  let resolution: ImageAssistantResolution | null = null
  const kMatch = normalizedPrompt.match(/(?:^|[^\w])([124])\s*k\b/i)
  if (kMatch) {
    resolution = `${kMatch[1]}K` as ImageAssistantResolution
  } else if (/(?:^|[^\d])512\s*(?:px|p)?(?!\d)/i.test(normalizedPrompt)) {
    resolution = "512"
  }

  return { sizePreset, resolution }
}

export function resolveImageAssistantRequestOptions(input: {
  prompt: string
  sizePreset: unknown
  resolution: unknown
}) {
  const inferred = inferImageAssistantRequestOptionsFromPrompt(input.prompt)
  return {
    sizePreset: inferred.sizePreset || normalizeIncomingSizePreset(input.sizePreset),
    resolution: inferred.resolution || normalizeIncomingResolution(input.resolution),
  }
}
