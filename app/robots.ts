import type { MetadataRoute } from "next"

import { getAppBaseUrl } from "@/lib/app-url"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl()

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
  }
}
