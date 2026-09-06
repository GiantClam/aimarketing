import Link from "next/link"
import { AiEntryWorkspace } from "@/components/ai-entry/ai-entry-workspace"
import type { AppLocale } from "@/lib/i18n/config"
import type { PlatformRegistryControlEntry } from "@/lib/platform/control-plane"
import type { PlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"
import { WORKBENCH_HOME_COPY, WORKBENCH_HOME_GROUPS, WorkbenchRouteIcon } from "@coworkany/workbench-ui"

type HomeEntry = {
  label: string
  description: string
  href: string
  iconKey: string
  tone: "gold" | "ink" | "soft"
}

type HomeGroup = {
  label: string
  entries: HomeEntry[]
}

const capabilityFallbacks = {
  "ai-chat": { zh: "普通多模型 AI 对话", en: "General multi-model AI chat" },
  "ai-ppt": { zh: "生成可编辑的演示文稿", en: "Create editable presentations" },
  "ai-image": { zh: "图片生成与设计助手", en: "Image generation and design" },
  "ai-video": { zh: "视频脚本与生成工作台", en: "Video scripts and generation" },
} as const

function localized(locale: AppLocale, value: { zh: string; en: string }) {
  return locale === "zh" ? value.zh : value.en
}

function sharedHomeCopy(path: string, locale: AppLocale) {
  for (const group of WORKBENCH_HOME_GROUPS) {
    const entry = group.entries.find((candidate) => candidate.path === path)
    if (entry) return { label: localized(locale, entry.label), description: localized(locale, entry.description) }
  }
  return null
}

function EntryCard({ entry }: { entry: HomeEntry }) {
  return (
    <Link href={entry.href} className="home-entry-card">
      <span className={`home-entry-icon home-entry-icon--${entry.tone}`} aria-hidden="true">
        <WorkbenchRouteIcon name={entry.iconKey} size={19} />
      </span>
      <span className="home-entry-copy">
        <span className="home-entry-label">{entry.label}</span>
        <span className="home-entry-description">{entry.description}</span>
      </span>
      <WorkbenchRouteIcon name="arrowUpRight" size={15} className="home-entry-arrow" />
    </Link>
  )
}

function HomeChatComposer() {
  return (
    <div className="home-chat-workspace">
      <AiEntryWorkspace initialConversationId={null} embedded compactEmbedded />
    </div>
  )
}

export function WorkspacePlatformHome({
  locale,
  capabilities,
  workflowTemplates,
  userName,
}: {
  locale: AppLocale
  capabilities: PlatformRegistryControlEntry[]
  workflowTemplates: PlatformRegistryEntryExecutionState[]
  userName?: string | null
}) {
  const isZh = locale === "zh"
  const displayName = (userName || (isZh ? "伙伴" : "there")).trim()
  const homeCopy = WORKBENCH_HOME_COPY[isZh ? "zh" : "en"]
  const capabilityMap = new Map(capabilities.map((item) => [item.slug, item]))
  const capabilityDescription = (slug: keyof typeof capabilityFallbacks) =>
    capabilityMap.get(slug)?.summary || localized(locale, capabilityFallbacks[slug])
  const sharedCopy = (path: string, fallback: { label: string; description: string }) => sharedHomeCopy(path, locale) || fallback

  const groups: HomeGroup[] = [
    {
      label: isZh ? "AI TEAM" : "AI TEAM",
      entries: [
        {
          ...sharedCopy("/dashboard/ai", { label: isZh ? "AI 对话" : "AI Chat", description: capabilityDescription("ai-chat") }),
          href: "/dashboard/ai",
          iconKey: "chat",
          tone: "gold",
        },
        {
          ...sharedCopy("/dashboard/ai?entry=consulting-advisor", { label: isZh ? "咨询专家" : "Consulting Advisor", description: isZh ? "围绕品牌、增长和经营问题获得结构化建议" : "Structured advice for brand, growth, and operating questions" }),
          href: "/dashboard/ai?entry=consulting-advisor",
          iconKey: "advisor",
          tone: "ink",
        },
      ],
    },
    {
      label: isZh ? "OFFICE TOOLS" : "OFFICE TOOLS",
      entries: [
        {
          ...sharedCopy("/dashboard/ai?agent=executive-ppt", { label: "PPT Assistant", description: capabilityDescription("ai-ppt") }),
          href: "/dashboard/ai?agent=executive-ppt",
          iconKey: "ppt",
          tone: "gold",
        },
        {
          ...sharedCopy("/dashboard/writer", { label: isZh ? "Writer 写作" : "Writer", description: isZh ? "长文、SEO、社媒与内容生产工作台" : "Long-form, SEO, social, and content production" }),
          href: "/dashboard/writer",
          iconKey: "writer",
          tone: "soft",
        },
        {
          label: isZh ? "AI 文档" : "AI Docs",
          description: isZh ? "用对话整理方案、文档和可交付结果" : "Turn conversations into structured, usable documents",
          href: "/dashboard/ai",
          iconKey: "docs",
          tone: "ink",
        },
      ],
    },
    {
      label: isZh ? "WORKFLOWS" : "WORKFLOWS",
      entries: [
        {
          ...sharedCopy("/dashboard/workflows", { label: isZh ? "工作流" : "Workflows", description: isZh ? "启动可复用的营销任务流程" : "Launch reusable marketing task flows" }),
          href: "/dashboard/workflows",
          iconKey: "workflow",
          tone: "gold",
        },
        {
          ...sharedCopy("/dashboard/tasks", { label: isZh ? "任务中心" : "Task Center", description: isZh ? "查看运行中和已完成的后台任务" : "Track running and completed background tasks" }),
          href: "/dashboard/tasks",
          iconKey: "task",
          tone: "ink",
        },
        {
          ...sharedCopy("/dashboard/knowledge-base", { label: isZh ? "知识库" : "Knowledge Base", description: isZh ? "管理团队知识和 AI 可复用资料" : "Manage reusable team knowledge for AI" }),
          href: "/dashboard/knowledge-base",
          iconKey: "knowledge",
          tone: "soft",
        },
      ],
    },
    {
      label: isZh ? "CONTENT CREATION" : "CONTENT CREATION",
      entries: [
        {
          ...sharedCopy("/dashboard/image-assistant", { label: isZh ? "AI 图片" : "AI Image", description: capabilityDescription("ai-image") }),
          href: "/dashboard/image-assistant",
          iconKey: "image",
          tone: "gold",
        },
        {
          ...sharedCopy("/dashboard/video", { label: isZh ? "AI 视频" : "AI Video", description: capabilityDescription("ai-video") }),
          href: "/dashboard/video",
          iconKey: "video",
          tone: "ink",
        },
        {
          ...sharedCopy("/dashboard/assets", { label: isZh ? "素材库" : "Asset Library", description: isZh ? "集中查看和复用生成的素材" : "Browse and reuse generated assets" }),
          href: "/dashboard/assets",
          iconKey: "asset",
          tone: "soft",
        },
      ],
    },
    {
      label: isZh ? "MORE" : "MORE",
      entries: [
        {
          label: isZh ? "作品库" : "Work Library",
          description: isZh ? "回看已经产出的内容和交付物" : "Review produced content and deliverables",
          href: "/dashboard/works",
          iconKey: "asset",
          tone: "ink",
        },
      ],
    },
  ]

  return (
    <div className="home-shell h-full overflow-y-auto">
      <div className="home-page-shell">
        <header className="home-topbar">
          <div className="home-topbar-status">
            <span className="public-signal" aria-hidden="true" />
            <span>{homeCopy.workspaceReady}</span>
            {workflowTemplates.length > 0 ? <span className="home-topbar-count">{workflowTemplates.length} {isZh ? "个流程可用" : "flows ready"}</span> : null}
          </div>
          <Link href="/dashboard/tasks" className="home-credits-link">
            <span className="home-credits-icon"><WorkbenchRouteIcon name="sparkles" size={14} /></span>
            <span>{homeCopy.viewUsage}</span>
            <WorkbenchRouteIcon name="arrowUpRight" size={15} />
          </Link>
        </header>

        <main className="home-main">
          <section className="home-welcome">
            <div className="home-welcome-kicker">COWORKANY WORKSPACE</div>
            <h1>
              {homeCopy.welcomePrefix}{displayName || homeCopy.welcomeDefaultName}
              <span className="home-welcome-mark" aria-hidden="true">✦</span>
            </h1>
            <p>{homeCopy.welcomeSubtitle}</p>
          </section>

          <HomeChatComposer />

          <section className="home-entry-groups" aria-label={isZh ? "功能入口" : "Workspace entries"}>
            {groups.map((group) => (
              <div key={group.label} className="home-entry-group">
                <div className="home-entry-group-label">{group.label}</div>
                <div className="home-entry-group-list">
                  {group.entries.map((entry) => <EntryCard key={entry.href + entry.label} entry={entry} />)}
                </div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  )
}
