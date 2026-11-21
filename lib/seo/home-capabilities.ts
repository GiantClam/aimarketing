import type { AppLocale } from "@/lib/i18n/config"
import { getLocalizedPlatformCapabilities, type PlatformCapabilityKind } from "@/lib/platform/catalog"

export type PublicHomeCapability = {
  slug: string
  title: string
  summary: string
  capabilityKind: PlatformCapabilityKind
  publicHref?: string
}

const summaries: Record<string, Record<AppLocale, string>> = {
  "ai-chat": {
    en: "Research ideas, refine your brief, and draft marketing copy with multiple models in one workspace.",
    zh: "在同一个工作台使用多个模型调研想法、完善 brief，并起草营销文案。",
  },
  "ai-ppt": {
    en: "Turn a topic into a presentation, review the preview, and sign in to continue or export.",
    zh: "把主题变成演示文稿，先检查预览，再登录继续编辑或导出。",
  },
  "ai-image": {
    en: "Create campaign visuals and work with reference images in the image and design workspace.",
    zh: "在图片与设计工作台中，结合参考图片创作营销活动视觉素材。",
  },
  "ai-video": {
    en: "Explore the available video creation flows and prepare your campaign video brief in one place.",
    zh: "在同一入口查看当前可用的视频创作流程，并准备营销视频 brief。",
  },
}

export function getPublicHomeCapabilities(locale: AppLocale): PublicHomeCapability[] {
  return getLocalizedPlatformCapabilities(locale, "public")
    .filter((item) => Object.hasOwn(summaries, item.slug))
    .map((item) => ({
      slug: item.slug,
      title: item.title,
      summary: summaries[item.slug][locale],
      capabilityKind: item.kind,
      publicHref: item.publicHref,
    }))
}
