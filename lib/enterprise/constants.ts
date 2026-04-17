export const FEATURE_KEYS = [
  "expert_advisor",
  "customer_profile_entry",
  "website_generation",
  "video_generation",
  "copywriting_generation",
  "image_design_generation",
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  expert_advisor: "专家顾问",
  customer_profile_entry: "客户画像入口",
  website_generation: "网站生成",
  video_generation: "视频生成",
  copywriting_generation: "文案生成",
  image_design_generation: "图片设计",
}

export type PermissionMap = Record<FeatureKey, boolean>

export function buildPermissionMap(initial = false): PermissionMap {
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = initial
    return acc
  }, {} as PermissionMap)
}
