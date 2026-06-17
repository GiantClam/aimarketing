import { redirect } from "next/navigation"

import { KnowledgeWorkspace } from "@/components/knowledge/knowledge-workspace"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getKnowledgeSource, getKnowledgeWorkspaceSnapshot, toKnowledgeSourceClientState } from "@/lib/knowledge/service"
import type { KnowledgeOverview, KnowledgeRecentActivity, KnowledgeDocument, KnowledgeSourceClientState } from "@/lib/knowledge/types"
import { getRequestLocale } from "@/lib/i18n/request-locale"

function buildFallbackSnapshot(): {
  overview: KnowledgeOverview
  documents: KnowledgeDocument[]
  recentActivity: KnowledgeRecentActivity[]
  source: KnowledgeSourceClientState | null
} {
  return {
    overview: {
      source: {
        provider: "ragflow",
        status: "unavailable",
        label: "RAGFlow 未连接",
        lastCheckedAt: null,
        name: null,
      },
      stats: {
        documentCount: 0,
        processingCount: 0,
        chunkCount: 0,
        lastUpdatedAt: null,
      },
      datasets: {
        total: 0,
        enabled: 0,
      },
    },
    documents: [],
    recentActivity: [],
    source: null,
  }
}

export default async function KnowledgeBasePage() {
  const [locale, currentUser] = await Promise.all([getRequestLocale(), getServerSessionUser()])
  if (!currentUser) {
    redirect("/login?next=%2Fdashboard%2Fknowledge-base")
  }

  const snapshot =
    currentUser.enterpriseId
      ? await Promise.all([
          getKnowledgeWorkspaceSnapshot(currentUser.enterpriseId).catch(() => buildFallbackSnapshot()),
          getKnowledgeSource(currentUser.enterpriseId).catch(() => null),
        ]).then(([data, source]) => ({ ...data, source: toKnowledgeSourceClientState(source) }))
      : buildFallbackSnapshot()

  return (
    <KnowledgeWorkspace
      locale={locale}
      initialOverview={snapshot.overview}
      initialDocuments={snapshot.documents}
      initialRecentActivity={snapshot.recentActivity}
      initialSource={snapshot.source}
      canManage={currentUser.enterpriseRole === "admin"}
    />
  )
}
