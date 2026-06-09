import type { AppLocale } from "@/lib/i18n/config"
import type { PlatformDirectoryAvailability } from "@/lib/platform/directory-config"

export function isDeferredAvailability(
  availability?: PlatformDirectoryAvailability | null,
) {
  return (
    availability === "coming_soon" ||
    availability === "waitlist" ||
    availability === "enterprise_only"
  )
}

export function getDeferredAvailabilityLabel(
  locale: AppLocale | "zh" | "en",
  availability?: PlatformDirectoryAvailability | null,
) {
  if (availability === "waitlist") {
    return locale === "zh" ? "等待名单" : "Waitlist"
  }

  if (availability === "enterprise_only") {
    return locale === "zh" ? "企业专享" : "Enterprise only"
  }

  return locale === "zh" ? "即将开放" : "Coming soon"
}

export function getDeferredEntryCopy(
  locale: AppLocale | "zh" | "en",
  availability?: PlatformDirectoryAvailability | null,
) {
  if (locale === "zh") {
    if (availability === "waitlist") {
      return {
        badgeLabel: "等待名单",
        title: "当前仅接受预约与需求收集",
        body: "该入口当前只用于说明场景、收集预约和保留平台位置，不接真实 runtime、假生成或假数据链路。",
        primaryActionLabel: "查看预约说明",
        secondaryActionLabel: "查看企业准入路径",
        inlineLabel: "等待名单 · 暂未开放真实能力",
      }
    }

    if (availability === "enterprise_only") {
      return {
        badgeLabel: "企业专享",
        title: "当前仅面向企业场景保留入口",
        body: "该入口当前只提供企业信息架构说明和后续准入路径，不对普通用户开放，也不接真实 runtime、假生成或假数据链路。",
        primaryActionLabel: "查看企业准入说明",
        secondaryActionLabel: "查看平台说明",
        inlineLabel: "企业专享 · 当前不可直接执行",
      }
    }

    return {
      badgeLabel: "即将开放",
      title: "当前暂未开放",
      body: "该入口当前只保留平台说明、业务位置和后续承接路径，不接真实 runtime、假生成或假数据链路。",
      primaryActionLabel: "查看开放说明",
      secondaryActionLabel: "查看企业承接路径",
      inlineLabel: "即将开放 · 当前不可用",
    }
  }

  if (availability === "waitlist") {
    return {
      badgeLabel: "Waitlist",
      title: "This entry is accepting waitlist interest only",
      body: "This entry currently exists for positioning, demand collection, and platform continuity only. No live runtime, fake generation, or fake data pipeline is connected.",
      primaryActionLabel: "Review waitlist notes",
      secondaryActionLabel: "View enterprise access path",
      inlineLabel: "Waitlist · no live capability yet",
    }
  }

  if (availability === "enterprise_only") {
    return {
      badgeLabel: "Enterprise only",
      title: "This entry is reserved for enterprise access only",
      body: "This entry currently exists as an enterprise information-architecture placeholder and future access path. It does not expose a live runtime, fake generation, or fake data pipeline.",
      primaryActionLabel: "Review enterprise access",
      secondaryActionLabel: "View platform context",
      inlineLabel: "Enterprise only · not directly executable",
    }
  }

  return {
    badgeLabel: "Coming soon",
    title: "This entry is not open yet",
    body: "This entry currently preserves product positioning, the platform slot, and future access paths only. No live runtime, fake generation, or fake data pipeline is connected.",
    primaryActionLabel: "Review launch notes",
    secondaryActionLabel: "View enterprise path",
    inlineLabel: "Coming soon · unavailable today",
  }
}
