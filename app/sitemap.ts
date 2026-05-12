import type { MetadataRoute } from "next"

import { getAppBaseUrl } from "@/lib/app-url"
import { getPublicSeoPaths } from "@/lib/seo/pages"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppBaseUrl()
  const now = new Date()
  const staticPaths = ["/", "/pricing", "/resources/ai-subscription-cost-calculator"]
  const paths = [...staticPaths, ...getPublicSeoPaths()]

  return paths.map((path) => ({
    url: new URL(path, baseUrl).toString(),
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path.includes("alternatives") || path.includes("resources") ? 0.8 : 0.7,
  }))
}
