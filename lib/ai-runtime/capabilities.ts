export const MODEL_CAPABILITIES = [
  "text.generate",
  "image.text_to_image",
  "image.image_to_image",
  "video.text_to_video",
  "video.image_to_video",
  "video.digital_human",
  "audio.generate",
  "audio.voice_clone",
  "audio.voice_synthesis",
] as const

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number]

export function isModelCapability(value: unknown): value is ModelCapability {
  return typeof value === "string" && MODEL_CAPABILITIES.includes(value as ModelCapability)
}
