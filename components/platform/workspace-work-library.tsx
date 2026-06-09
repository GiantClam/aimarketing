type WorkspaceWorkLibraryItem = {
  id: number
  title: string
  type: string
  sourceArtifactId: number
  createdAt: string | null
}

function formatWorkTimestamp(value: string | null, locale: "zh" | "en") {
  if (!value) return locale === "zh" ? "未记录" : "Not recorded"
  try {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")
  } catch {
    return value
  }
}

export function WorkspaceWorkLibrary({
  locale,
  works,
}: {
  locale: "zh" | "en"
  works: WorkspaceWorkLibraryItem[]
}) {
  const copy =
    locale === "zh"
      ? {
          eyebrow: "Work Library",
          title: "作品库",
          description: "这里展示从 artifact lineage 提升出来的作品条目，而不是独立的第二套作品后端。",
          empty: "当前企业还没有共享作品记录。",
        }
      : {
          eyebrow: "Work Library",
          title: "Work library",
          description: "This shows work items promoted from artifact lineage instead of a second standalone backend.",
          empty: "No shared work items exist for this enterprise yet.",
        }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-8">
          <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {works.length === 0 ? (
              <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5 text-sm text-muted-foreground">
                {copy.empty}
              </div>
            ) : null}

            {works.map((work) => (
              <article key={work.id} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="space-y-2">
                  <div className="dashboard-kicker text-muted-foreground">{work.type.toUpperCase()}</div>
                  <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {work.title}
                  </h2>
                </div>
                <div className="mt-4 space-y-2 text-sm text-foreground/85">
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">Work ID: {work.id}</div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">Artifact ID: {work.sourceArtifactId}</div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">
                    {locale === "zh" ? "创建时间" : "Created"}: {formatWorkTimestamp(work.createdAt, locale)}
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
