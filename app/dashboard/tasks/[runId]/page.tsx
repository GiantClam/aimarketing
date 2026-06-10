import Link from "next/link"
import { notFound } from "next/navigation"

import { WorkspaceOutputActions } from "@/components/workspace/workspace-output-actions"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { resolvePlatformArtifactSourceUrl } from "@/lib/platform/artifact-actions"
import { getPlatformTaskRun } from "@/lib/platform/task-run-store"

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const { runId } = await params
  const numericRunId = Number(runId)

  if (!currentUser?.enterpriseId || !Number.isInteger(numericRunId) || numericRunId <= 0) {
    notFound()
  }

  const run = await getPlatformTaskRun(numericRunId)
  if (!run || run.enterpriseId !== currentUser.enterpriseId) {
    notFound()
  }

  const firstArtifact = run.artifacts[0] ?? null
  const firstArtifactSourceUrl = firstArtifact ? resolvePlatformArtifactSourceUrl(firstArtifact) : null
  const copy =
    displayLocale === "zh"
      ? {
          eyebrow: "Task Detail",
          title: "任务详情",
          back: "返回任务中心",
          events: "事件时间线",
          artifacts: "输出与素材",
          works: "作品提升记录",
        }
      : {
          eyebrow: "Task Detail",
          title: "Task detail",
          back: "Back to task center",
          events: "Event timeline",
          artifacts: "Outputs and artifacts",
          works: "Promoted works",
        }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-8">
          <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl">
                <h1 className="font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
                  {copy.title}
                </h1>
                <p className="mt-4 text-sm leading-7 text-muted-foreground lg:text-base">
                  {run.itemSlug} · {run.status} · #{run.id}
                </p>
              </div>
              <Link
                href="/dashboard/tasks"
                className="dashboard-chip rounded-[4px] px-4 py-2 text-sm text-foreground transition hover:bg-primary hover:text-primary-foreground"
              >
                {copy.back}
              </Link>
            </div>
          </div>

          {firstArtifact ? (
            <WorkspaceOutputActions
              locale={displayLocale}
              artifactLabel={firstArtifact.title}
              artifactId={firstArtifact.id}
              shareUrl={`/dashboard/tasks/${run.id}`}
              downloadFilename={firstArtifact.title}
              downloadMimeType={firstArtifact.mimeType || "application/octet-stream"}
              downloadUrl={firstArtifactSourceUrl || `/api/platform/artifacts/${firstArtifact.id}/download?download=1`}
            />
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
              <div className="dashboard-kicker text-muted-foreground">{copy.events}</div>
              <div className="mt-4 space-y-3">
                {run.events.map((event) => (
                  <div key={event.id} className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                    {event.level.toUpperCase()} · {event.message}
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
              <div className="dashboard-kicker text-muted-foreground">{copy.artifacts}</div>
              <div className="mt-4 space-y-3">
                {run.artifacts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No artifacts</div>
                ) : null}
                {run.artifacts.map((artifact) => (
                  <div key={artifact.id} className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                    #{artifact.id} · {artifact.title} · {artifact.mimeType || "application/json"}
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
            <div className="dashboard-kicker text-muted-foreground">{copy.works}</div>
            <div className="mt-4 space-y-3">
              {run.workItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">No promoted work items yet.</div>
              ) : null}
              {run.workItems.map((work) => (
                <div key={work.id} className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                  #{work.id} · {work.type} · {work.title}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
