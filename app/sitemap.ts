import type { MetadataRoute } from "next"

import { getAppBaseUrl } from "@/lib/app-url"
import { getLeadToolPaths } from "@/lib/lead-tools/catalog"
import { getLeadToolExamplePaths } from "@/lib/lead-tools/examples"
import { isLocalizedPublicPath, localizePublicPath } from "@/lib/i18n/routing"
import { getPublicPlatformPaths } from "@/lib/platform/catalog"
import { getPublicSeoPaths } from "@/lib/seo/pages"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppBaseUrl()
  const now = new Date()
  const staticPaths = ["/", "/pricing", "/resources", "/tools", "/resources/ai-subscription-cost-calculator"]
  const paths = [
    ...staticPaths,
    ...getPublicSeoPaths(),
    ...getLeadToolPaths(),
    ...getLeadToolExamplePaths(),
    ...getPublicPlatformPaths(),
  ]
  const localizedPaths = [...new Set(paths.flatMap((path) => (
    isLocalizedPublicPath(path)
      ? [localizePublicPath(path, "en"), localizePublicPath(path, "zh")]
      : [path]
  )))]

  return localizedPaths.map((path) => ({
    url: new URL(path, baseUrl).toString(),
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path.includes("alternatives") || path.includes("resources") ? 0.8 : 0.7,
  }))
}
