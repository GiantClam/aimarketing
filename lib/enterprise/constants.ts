export const FEATURE_KEYS = [
  "expert_advisor",
  "website_generation",
  "video_generation",
  "copywriting_generation",
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  expert_advisor: "专家顾问",
  website_generation: "网站生成",
  video_generation: "视频生成",
  copywriting_generation: "文案生成",
}

export type PermissionMap = Record<FeatureKey, boolean>

export function buildPermissionMap(initial = false): PermissionMap {
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = initial
    return acc
  }, {} as PermissionMap)
}
