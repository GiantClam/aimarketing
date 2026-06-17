import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { KnowledgeDocumentDetailPanel } from "@/components/knowledge/knowledge-document-detail-panel"
import { Button } from "@/components/ui/button"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getKnowledgeDocumentSnapshot } from "@/lib/knowledge/service"

export default async function KnowledgeDocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>
}) {
  const [locale, currentUser, resolvedParams] = await Promise.all([
    getRequestLocale(),
    getServerSessionUser(),
    params,
  ])

  if (!currentUser) {
    redirect(`/login?next=%2Fdashboard%2Fknowledge-base%2Fdocuments%2F${resolvedParams.documentId}`)
  }
  if (!currentUser.enterpriseId) {
    notFound()
  }

  const detail = await getKnowledgeDocumentSnapshot(
    Number.parseInt(resolvedParams.documentId, 10),
    currentUser.enterpriseId,
  ).catch(() => null)

  if (!detail) {
    notFound()
  }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg workspace-page-shell-tight mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "知识库文档" : "Knowledge document"}</div>
            <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground">
              {detail.document.name}
            </h1>
          </div>
          <Button className="public-button-secondary h-10 px-4" asChild>
            <Link href="/dashboard/knowledge-base">{locale === "zh" ? "返回知识库" : "Back to knowledge base"}</Link>
          </Button>
        </div>
        <KnowledgeDocumentDetailPanel
          locale={locale}
          initialDetail={detail}
          canManage={currentUser.enterpriseRole === "admin"}
        />
      </section>
    </div>
  )
}
