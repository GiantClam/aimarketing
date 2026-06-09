import type { AppLocale } from "@/lib/i18n/config"

export type WorkspaceEnterpriseSettingSlug = "seats" | "usage" | "compute" | "sso"

export type LocalizedWorkspaceEnterpriseSettingEntry = {
  slug: WorkspaceEnterpriseSettingSlug
  title: string
  summary: string
  description: string
  bullets: string[]
  href: string
  relatedLinks: Array<{
    label: string
    href: string
  }>
}

const zhEntries: LocalizedWorkspaceEnterpriseSettingEntry[] = [
  {
    slug: "seats",
    title: "席位管理",
    summary: "统一梳理企业成员席位、活跃成员和角色编排入口。",
    description:
      "当前版本先补齐信息架构入口，让管理员在同一治理层理解席位、成员活跃度和团队分配，不展开新的权限底层。",
    bullets: ["查看活跃成员与席位上限", "回流计费与订阅视图", "保留后续组织与角色扩展位"],
    href: "/dashboard/platform-settings/seats",
    relatedLinks: [
      { label: "平台设置总览", href: "/dashboard/platform-settings" },
      { label: "计费", href: "/dashboard/billing" },
      { label: "原始设置", href: "/dashboard/settings" },
    ],
  },
  {
    slug: "usage",
    title: "用量监控",
    summary: "统一解释 credits、任务使用量和团队消耗观察入口。",
    description:
      "该入口先承担可视化信息架构职责，帮助企业理解目前的 credits、任务量和治理视角，不新增真实报表后端。",
    bullets: ["查看 credits 与预留额度", "解释任务与能力侧消耗", "预留后续团队报表扩展位"],
    href: "/dashboard/platform-settings/usage",
    relatedLinks: [
      { label: "平台设置总览", href: "/dashboard/platform-settings" },
      { label: "计费", href: "/dashboard/billing" },
      { label: "能力中心", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "compute",
    title: "算力编排",
    summary: "把模型路由、provider 和长任务运行时放回统一算力视角。",
    description:
      "当前先提供信息架构入口，解释文本、图片、视频和工作流所依赖的 provider 组合，不改底层 provider routing。",
    bullets: ["说明主文本路由与备用链路", "说明图片/视频长任务抽象", "回流能力中心与运行时治理"],
    href: "/dashboard/platform-settings/compute",
    relatedLinks: [
      { label: "平台设置总览", href: "/dashboard/platform-settings" },
      { label: "能力中心", href: "/dashboard/capabilities" },
      { label: "工作流", href: "/dashboard/workflows" },
    ],
  },
  {
    slug: "sso",
    title: "SSO 与登录治理",
    summary: "补齐企业单点登录与身份治理的信息架构入口。",
    description:
      "本阶段不改登录底层和权限底层，只补齐企业管理员的理解入口，说明后续单点登录、域名绑定与身份策略承接位置。",
    bullets: ["单点登录与域名绑定占位", "身份策略与成员接入说明", "保留后续企业登录扩展位"],
    href: "/dashboard/platform-settings/sso",
    relatedLinks: [
      { label: "平台设置总览", href: "/dashboard/platform-settings" },
      { label: "原始设置", href: "/dashboard/settings" },
      { label: "席位管理", href: "/dashboard/platform-settings/seats" },
    ],
  },
]

const enEntries: LocalizedWorkspaceEnterpriseSettingEntry[] = [
  {
    slug: "seats",
    title: "Seat management",
    summary: "Keep workspace seats, active members, and role allocation in one enterprise view.",
    description:
      "This phase adds the information architecture entry point so admins can reason about seats, active members, and team allocation without changing the permission core.",
    bullets: ["Review active members and seat ceilings", "Roll back into billing and subscription views", "Reserve room for future org and role expansion"],
    href: "/dashboard/platform-settings/seats",
    relatedLinks: [
      { label: "Platform settings", href: "/dashboard/platform-settings" },
      { label: "Billing", href: "/dashboard/billing" },
      { label: "Legacy settings", href: "/dashboard/settings" },
    ],
  },
  {
    slug: "usage",
    title: "Usage monitoring",
    summary: "Explain credits, task usage, and team consumption in one governance lane.",
    description:
      "This entry is intentionally an information architecture layer first, helping enterprise teams interpret credits, task volume, and governance posture without adding a new reporting backend.",
    bullets: ["Review credits and reserved balance", "Explain task and capability-side consumption", "Reserve room for future team reporting"],
    href: "/dashboard/platform-settings/usage",
    relatedLinks: [
      { label: "Platform settings", href: "/dashboard/platform-settings" },
      { label: "Billing", href: "/dashboard/billing" },
      { label: "Capabilities", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "compute",
    title: "Compute orchestration",
    summary: "Reframe model routing, providers, and long-running media tasks as one compute surface.",
    description:
      "This phase adds the information architecture entry point that explains the text, image, video, and workflow provider mix without rewriting the existing provider routing layer.",
    bullets: ["Describe primary and fallback text routes", "Describe image and video task abstractions", "Link back to capabilities and runtime governance"],
    href: "/dashboard/platform-settings/compute",
    relatedLinks: [
      { label: "Platform settings", href: "/dashboard/platform-settings" },
      { label: "Capabilities", href: "/dashboard/capabilities" },
      { label: "Workflows", href: "/dashboard/workflows" },
    ],
  },
  {
    slug: "sso",
    title: "SSO and identity governance",
    summary: "Add the enterprise front door for single sign-on and identity policy.",
    description:
      "This phase does not change the auth or permission core. It adds the governance entry point that explains where single sign-on, domain binding, and identity policy will land next.",
    bullets: ["SSO and domain-binding placeholder", "Identity policy and member-access notes", "Reserve room for future enterprise auth expansion"],
    href: "/dashboard/platform-settings/sso",
    relatedLinks: [
      { label: "Platform settings", href: "/dashboard/platform-settings" },
      { label: "Legacy settings", href: "/dashboard/settings" },
      { label: "Seat management", href: "/dashboard/platform-settings/seats" },
    ],
  },
]

export function getLocalizedWorkspaceEnterpriseSettingEntries(locale: AppLocale | "zh" | "en") {
  return (locale === "zh" ? zhEntries : enEntries).map((entry) => ({
    ...entry,
    bullets: [...entry.bullets],
    relatedLinks: entry.relatedLinks.map((link) => ({ ...link })),
  }))
}

export function getLocalizedWorkspaceEnterpriseSettingEntryBySlug(
  locale: AppLocale | "zh" | "en",
  slug: WorkspaceEnterpriseSettingSlug,
) {
  return getLocalizedWorkspaceEnterpriseSettingEntries(locale).find((entry) => entry.slug === slug) ?? null
}
