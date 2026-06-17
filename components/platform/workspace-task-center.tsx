import Link from "next/link"

type WorkspaceTaskCenterItem = {
  id: number
  kind: string
  itemSlug: string
  status: string
  externalSystem: string | null
  createdAt: string | null
  updatedAt: string | null
}

function formatTaskTimestamp(value: string | null, locale: "zh" | "en") {
  if (!value) return locale === "zh" ? "未记录" : "Not recorded"
  try {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")
  } catch {
    return value
  }
}

export function WorkspaceTaskCenter({
  locale,
  runs,
}: {
  locale: "zh" | "en"
  runs: WorkspaceTaskCenterItem[]
}) {
  const copy =
    locale === "zh"
      ? {
          eyebrow: "Task Center",
          title: "任务中心",
          description: "统一查看 workflow、media、tool、agent 的本地运行记录，后续再接更深的状态同步。",
          empty: "当前企业还没有共享任务记录。",
          open: "查看详情",
        }
      : {
          eyebrow: "Task Center",
          title: "Task center",
          description: "Review local workflow, media, tool, and agent runs in one place before deeper status syncing lands.",
          empty: "No shared task runs exist for this enterprise yet.",
          open: "View details",
        }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg workspace-page-shell mx-auto max-w-7xl">
        <div className="workspace-stack">
          <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
          </div>

          <div className="space-y-4">
            {runs.length === 0 ? (
              <div className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 text-sm text-muted-foreground">
                {copy.empty}
              </div>
            ) : null}

            {runs.map((run) => (
              <article key={run.id} className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="dashboard-kicker text-muted-foreground">
                      {run.kind.toUpperCase()} · {run.status}
                    </div>
                    <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                      {run.itemSlug}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {run.externalSystem || (locale === "zh" ? "本地平台运行记录" : "Local platform run")}
                    </p>
                  </div>

                  <Link
                    href={`/dashboard/tasks/${run.id}`}
                    className="dashboard-chip rounded-[4px] px-4 py-2 text-sm text-foreground transition hover:bg-primary hover:text-primary-foreground"
                  >
                    {copy.open}
                  </Link>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    ID: {run.id}
                  </div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    {locale === "zh" ? "创建时间" : "Created"}: {formatTaskTimestamp(run.createdAt, locale)}
                  </div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                    {locale === "zh" ? "最近更新时间" : "Updated"}: {formatTaskTimestamp(run.updatedAt, locale)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
