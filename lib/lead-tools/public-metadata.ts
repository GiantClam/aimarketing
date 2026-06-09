import type { Metadata } from "next"

import type { AppLocale } from "@/lib/i18n/config"
import { buildLocalizedPublicUrl, getLocalizedPublicAlternates } from "@/lib/i18n/routing"
import { getLocalizedLeadToolBySlug } from "@/lib/lead-tools/catalog"
import { getLeadToolExample } from "@/lib/lead-tools/examples"

function metadataForLeadToolPage(
  locale: AppLocale,
  path: string,
  title: string,
  description: string,
): Metadata {
  const canonical = buildLocalizedPublicUrl(path, locale)

  return {
    title: { absolute: `${title} | AI Marketing` },
    description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates(path),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "AI Marketing",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export function getToolsHubMetadata(locale: AppLocale): Metadata {
  const copy =
    locale === "zh"
      ? {
          title: "AI 工具目录",
          description:
            "集中浏览 AI 对话、AI PPT、AI 绘图、AI 视频与 SEO 工具入口，并继续进入平台能力中心、智能体、插件、MCP 服务与工作流目录。",
        }
      : {
          title: "AI Tool Directory",
          description:
            "Browse AI chat, AI PPT, AI image, AI video, and SEO tool entry points, then continue into capabilities, agents, plugins, MCP services, and workflow directories.",
        }

  return metadataForLeadToolPage(locale, "/tools", copy.title, copy.description)
}

export function getLeadToolMetadata(locale: AppLocale, slug: string): Metadata {
  const tool = getLocalizedLeadToolBySlug(slug, locale)

  if (!tool) {
    return metadataForLeadToolPage(
      locale,
      "/tools",
      locale === "zh" ? "工具未找到" : "Tool not found",
      locale === "zh" ? "这个工具当前还未上线。" : "This tool is not live yet.",
    )
  }

  return metadataForLeadToolPage(locale, tool.href, tool.name, tool.description)
}

export function getLeadToolExampleMetadata(locale: AppLocale, slug: string, exampleSlug: string): Metadata {
  const tool = getLocalizedLeadToolBySlug(slug, locale)
  const example = getLeadToolExample(slug, exampleSlug)

  if (!tool || !example) {
    return metadataForLeadToolPage(
      locale,
      "/tools",
      locale === "zh" ? "示例未找到" : "Example not found",
      locale === "zh" ? "这个示例页当前不可用。" : "This example page is not available.",
    )
  }

  return metadataForLeadToolPage(
    locale,
    `/tools/${slug}/examples/${exampleSlug}`,
    `${example.title} | ${tool.name}`,
    example.summary,
  )
}
