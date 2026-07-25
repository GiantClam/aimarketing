export type MiniMaxVideoFeatureId = "text-to-video" | "image-to-video"

export type MiniMaxVideoModelOption = {
  value: string
  label: string
  supportedFeatures: MiniMaxVideoFeatureId[]
  resolutionMode: "hailuo" | "legacy"
}

export const DEFAULT_MINIMAX_VIDEO_MODEL = "MiniMax-Hailuo-2.3"

export const MINIMAX_VIDEO_MODEL_OPTIONS: MiniMaxVideoModelOption[] = [
  {
    value: "MiniMax-Hailuo-2.3",
    label: "MiniMax Hailuo 2.3",
    supportedFeatures: ["text-to-video", "image-to-video"],
    resolutionMode: "hailuo",
  },
  {
    value: "MiniMax-Hailuo-2.3-Fast",
    label: "MiniMax Hailuo 2.3 Fast",
    supportedFeatures: ["image-to-video"],
    resolutionMode: "hailuo",
  },
]

export function getMiniMaxVideoModelOptions(featureId: MiniMaxVideoFeatureId) {
  return MINIMAX_VIDEO_MODEL_OPTIONS.filter((option) => option.supportedFeatures.includes(featureId))
}

export function resolveMiniMaxVideoModelOption(featureId: MiniMaxVideoFeatureId, value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return (
    getMiniMaxVideoModelOptions(featureId).find((option) => option.value === normalized) ||
    getMiniMaxVideoModelOptions(featureId).find((option) => option.value === DEFAULT_MINIMAX_VIDEO_MODEL) ||
    getMiniMaxVideoModelOptions(featureId)[0] ||
    MINIMAX_VIDEO_MODEL_OPTIONS[0]
  )
}
