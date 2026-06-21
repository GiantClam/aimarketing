"use client"

import { useState } from "react"
import {
  Bot,
  FileText,
  ImageIcon,
  Mail,
  Megaphone,
  PlayCircle,
  Search,
  Sparkles,
  Users2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { CompactBusinessCard } from "@/components/workspace/compact-business-card"
import type {
  PlatformDirectoryAvailability,
  PublicToolsCenterEntry,
} from "@/lib/platform/directory-registry"
import {
  buildCompactCardSummary,
  pickPrimaryStatusBadge,
} from "@/lib/workspace/compact-business-card"
import { cn } from "@/lib/utils"

const iconMap = {
  presentation: Sparkles,
  seo: Search,
  ads: Megaphone,
  email: Mail,
  chat: Bot,
  image: ImageIcon,
  video: PlayCircle,
  agent: Users2,
} as const

type FilterValue = "all" | PublicToolsCenterEntry["media"]

type SceneFilterValue =
  | "all"
  | PublicToolsCenterEntry["scenes"][number]

type ToolCardGridProps = {
  entries: PublicToolsCenterEntry[]
  className?: string
  title?: string
  description?: string
  locale: "zh" | "en"
  availableLabel?: string
  comingSoonLabel?: string
  waitlistLabel?: string
  enterpriseOnlyLabel?: string
  openToolLabel?: string
  previewToolLabel?: string
}

function getAvailabilityLabel(
  availability: PlatformDirectoryAvailability,
  labels: {
    availableLabel: string
    comingSoonLabel: string
    waitlistLabel: string
    enterpriseOnlyLabel: string
  },
) {
  if (availability === "available") return labels.availableLabel
  if (availability === "waitlist") return labels.waitlistLabel
  if (availability === "enterprise_only") return labels.enterpriseOnlyLabel
  return labels.comingSoonLabel
}

function getMediaLabel(value: FilterValue, locale: "zh" | "en") {
  const labels =
    locale === "zh"
      ? {
          all: "全部媒介",
          chat: "AI 对话",
          presentation: "AI PPT",
          seo: "SEO",
          image: "图片",
          video: "视频",
          agent: "Agent",
          ads: "广告",
          email: "邮件",
        }
      : {
          all: "All media",
          chat: "AI chat",
          presentation: "AI PPT",
          seo: "SEO",
          image: "Image",
          video: "Video",
          agent: "Agent",
          ads: "Ads",
          email: "Email",
        }

  return labels[value]
}

function getSceneLabel(value: SceneFilterValue, locale: "zh" | "en") {
  const labels =
    locale === "zh"
      ? {
          all: "全部场景",
          content_creation: "内容生成",
          seo_growth: "SEO 增长",
          design_creative: "设计创意",
          video_growth: "视频运营",
          research_analysis: "调研分析",
          agent_collaboration: "智能体协作",
          brand_strategy: "品牌策略",
          reputation_response: "舆情响应",
          lead_generation: "获客转化",
          campaign_launch: "营销活动",
        }
      : {
          all: "All scenarios",
          content_creation: "Content creation",
          seo_growth: "SEO growth",
          design_creative: "Design and creative",
          video_growth: "Video operations",
          research_analysis: "Research and analysis",
          agent_collaboration: "Agent collaboration",
          brand_strategy: "Brand strategy",
          reputation_response: "Reputation response",
          lead_generation: "Lead generation",
          campaign_launch: "Campaign launch",
        }

  return labels[value]
}

function getEntryKindLabel(entry: PublicToolsCenterEntry, locale: "zh" | "en") {
  if (entry.kind === "directory") {
    return locale === "zh" ? "平台入口" : "Platform entry"
  }

  return locale === "zh" ? "工具入口" : "Tool entry"
}

function getAvailabilityTone(availability: PlatformDirectoryAvailability) {
  if (availability === "available") return "success" as const
  if (availability === "enterprise_only") return "warning" as const
  if (availability === "waitlist") return "neutral" as const
  return "neutral" as const
}

export function ToolCardGrid({
  entries,
  className,
  title,
  description,
  locale,
  availableLabel = "已开放",
  comingSoonLabel = "即将上线",
  waitlistLabel = "等待名单",
  enterpriseOnlyLabel = "企业专享",
  openToolLabel = "进入工具",
  previewToolLabel = "查看入口",
}: ToolCardGridProps) {
  const [mediaFilter, setMediaFilter] = useState<FilterValue>("all")
  const [sceneFilter, setSceneFilter] = useState<SceneFilterValue>("all")

  const mediaOptions: FilterValue[] = [
    "all",
    ...Array.from(new Set(entries.map((entry) => entry.media))),
  ]

  const sceneOptions: SceneFilterValue[] = [
    "all",
    ...Array.from(new Set(entries.flatMap((entry) => entry.scenes))),
  ]

  const filteredEntries = entries.filter((entry) => {
    const matchesMedia = mediaFilter === "all" || entry.media === mediaFilter
    const matchesScene = sceneFilter === "all" || entry.scenes.includes(sceneFilter)
    return matchesMedia && matchesScene
  })

  const resultCopy =
    locale === "zh"
      ? {
          filterTitle: "按媒介与场景筛选",
          mediaLabel: "媒介",
          sceneLabel: "场景",
          resultLabel: `${filteredEntries.length} 个入口`,
          emptyTitle: "当前筛选下还没有入口",
          emptyBody: "可以切换媒介或场景，查看其他已开放工具和后续等待名单入口。",
          resetLabel: "重置筛选",
        }
      : {
          filterTitle: "Filter by media and scenario",
          mediaLabel: "Media",
          sceneLabel: "Scenario",
          resultLabel: `${filteredEntries.length} entries`,
          emptyTitle: "No entries match this filter yet",
          emptyBody: "Switch media or scenarios to explore the live tools and deferred waitlist entries.",
          resetLabel: "Reset filters",
        }

  return (
    <section className={cn("space-y-6", className)}>
      {(title || description) && (
        <div className="max-w-3xl space-y-3">
          {title ? <h2 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">{title}</h2> : null}
          {description ? <p className="text-base leading-7 text-muted-foreground">{description}</p> : null}
        </div>
      )}

      <div className="public-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="public-kicker text-muted-foreground">{resultCopy.filterTitle}</div>
            <div className="text-sm leading-6 text-muted-foreground">{resultCopy.resultLabel}</div>
          </div>
          {(mediaFilter !== "all" || sceneFilter !== "all") && (
            <Button
              type="button"
              variant="ghost"
              className="public-system-chip rounded-[4px] px-3 py-2 font-display text-xs font-bold uppercase tracking-[0.08em]"
              onClick={() => {
                setMediaFilter("all")
                setSceneFilter("all")
              }}
            >
              {resultCopy.resetLabel}
            </Button>
          )}
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <div className="public-kicker text-muted-foreground">{resultCopy.mediaLabel}</div>
            <div className="flex flex-wrap gap-2">
              {mediaOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMediaFilter(option)}
                  className={cn(
                    "public-system-chip rounded-[4px] px-3 py-2 text-xs font-medium transition",
                    mediaFilter === option
                      ? "border border-primary/40 bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {getMediaLabel(option, locale)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="public-kicker text-muted-foreground">{resultCopy.sceneLabel}</div>
            <div className="flex flex-wrap gap-2">
              {sceneOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSceneFilter(option)}
                  className={cn(
                    "public-system-chip rounded-[4px] px-3 py-2 text-xs font-medium transition",
                    sceneFilter === option
                      ? "border border-primary/40 bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {getSceneLabel(option, locale)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="public-panel rounded-[12px] border border-border bg-card/85 p-8 text-center">
          <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
            {resultCopy.emptyTitle}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{resultCopy.emptyBody}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEntries.map((entry) => {
            const Icon = iconMap[entry.icon] ?? FileText
            const summary = buildCompactCardSummary([entry.tagline, entry.description], entry.slug) || entry.title
            const status = pickPrimaryStatusBadge([
              {
                label: getAvailabilityLabel(entry.availability, {
                  availableLabel,
                  comingSoonLabel,
                  waitlistLabel,
                  enterpriseOnlyLabel,
                }),
                tone: getAvailabilityTone(entry.availability),
              },
            ])

            return (
              <CompactBusinessCard
                key={`${entry.kind}:${entry.slug}`}
                title={entry.title}
                summary={summary}
                status={status}
                actionLabel={entry.availability === "available" ? openToolLabel : previewToolLabel}
                href={entry.href}
                className="border-border/70 shadow-[0_18px_60px_-36px_rgba(0,0,0,0.65)] transition-transform duration-200 hover:-translate-y-1"
                media={
                  <div className="flex h-20 items-end rounded-[12px] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-background/80 text-primary shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="ml-3 line-clamp-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {getEntryKindLabel(entry, locale)} · {getMediaLabel(entry.media, locale)}
                    </div>
                  </div>
                }
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
