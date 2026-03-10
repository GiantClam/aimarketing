import type { FeatureKey } from "@/lib/enterprise/constants"

function isEnabled(value: string | undefined, fallback: boolean) {
  if (typeof value === "string") {
    return value === "true"
  }

  return fallback
}

export function isWebsiteGenerationEnabled() {
  return isEnabled(process.env.NEXT_PUBLIC_ENABLE_WEBSITE_GENERATION, false)
}

export function isVideoGenerationEnabled() {
  return isEnabled(process.env.NEXT_PUBLIC_ENABLE_VIDEO_GENERATION, false)
}

export function isFeatureRuntimeEnabled(feature: FeatureKey) {
  if (feature === "website_generation") {
    return isWebsiteGenerationEnabled()
  }

  if (feature === "video_generation") {
    return isVideoGenerationEnabled()
  }

  return true
}
