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
          eyebrow: "Execution Detail",
          title: "任务执行详情",
          back: "返回任务视图",
          workflowRun: "查看工作流结果页",
          summary: "执行摘要",
          executionNote: "此页面展示的是单次执行记录，不是聚合后的任务本身。",
          latestRun: "最新执行 ID",
          taskKey: "任务标识",
          events: "执行事件",
          artifacts: "输出与素材",
          works: "作品提升记录",
        }
      : {
          eyebrow: "Execution Detail",
          title: "Task execution detail",
          back: "Back to task overview",
          workflowRun: "View workflow results",
          summary: "Execution summary",
          executionNote: "This page shows one execution record, not the grouped task itself.",
          latestRun: "Latest run ID",
          taskKey: "Task key",
          events: "Execution events",
          artifacts: "Outputs and artifacts",
          works: "Promoted works",
        }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg workspace-page-shell mx-auto max-w-7xl">
        <div className="workspace-stack">
          <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl">
                <h1 className="font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
                  {copy.title}
                </h1>
                <p className="mt-4 text-sm leading-7 text-muted-foreground lg:text-base">
                  {run.itemSlug} · {run.status} · #{run.id}
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                  {copy.executionNote}
                </p>
              </div>
              <Link
                href="/dashboard/tasks"
                className="dashboard-chip rounded-[4px] px-4 py-2 text-sm text-foreground transition hover:bg-primary hover:text-primary-foreground"
              >
                {copy.back}
              </Link>
              {run.kind === "workflow" && run.itemType === "workflow" ? (
                <Link
                  href={`/dashboard/workflows/runs/${run.id}`}
                  className="dashboard-chip rounded-[4px] px-4 py-2 text-sm text-foreground transition hover:bg-primary hover:text-primary-foreground"
                >
                  {copy.workflowRun}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.summary}</div>
              <div className="mt-4 text-sm text-foreground/85">
                {run.kind} · {run.itemType}
              </div>
            </article>
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.latestRun}</div>
              <div className="mt-4 font-mono text-sm text-foreground/85">
                {run.externalRunId || `RUN-${String(run.id).padStart(5, "0")}`}
              </div>
            </article>
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.taskKey}</div>
              <div className="mt-4 text-sm text-foreground/85">
                {run.kind}:{run.itemType}:{run.itemSlug}
              </div>
            </article>
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
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.events}</div>
              <div className="mt-4 space-y-3">
                {run.events.map((event) => (
                  <div key={event.id} className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                    {event.level.toUpperCase()} · {event.message}
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
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

          <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
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
