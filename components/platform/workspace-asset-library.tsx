type WorkspaceAssetLibraryItem = {
  id: number
  title: string
  kind: string
  mimeType: string | null
  runId: number
  createdAt: string | null
}

function formatAssetTimestamp(value: string | null, locale: "zh" | "en") {
  if (!value) return locale === "zh" ? "未记录" : "Not recorded"
  try {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")
  } catch {
    return value
  }
}

export function WorkspaceAssetLibrary({
  locale,
  artifacts,
}: {
  locale: "zh" | "en"
  artifacts: WorkspaceAssetLibraryItem[]
}) {
  const copy =
    locale === "zh"
      ? {
          eyebrow: "Asset Library",
          title: "素材库",
          description: "这里直接读取共享 artifact store，不再用前端占位假装有素材系统。",
          empty: "当前企业还没有共享素材记录。",
        }
      : {
          eyebrow: "Asset Library",
          title: "Asset library",
          description: "This reads directly from the shared artifact store instead of pretending there is a separate asset backend.",
          empty: "No shared artifacts exist for this enterprise yet.",
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
            {artifacts.length === 0 ? (
              <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5 text-sm text-muted-foreground">
                {copy.empty}
              </div>
            ) : null}

            {artifacts.map((artifact) => (
              <article key={artifact.id} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="space-y-2">
                  <div className="dashboard-kicker text-muted-foreground">
                    {artifact.kind.toUpperCase()} · {artifact.mimeType || "application/json"}
                  </div>
                  <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {artifact.title}
                  </h2>
                </div>
                <div className="mt-4 space-y-2 text-sm text-foreground/85">
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">Artifact ID: {artifact.id}</div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">Run ID: {artifact.runId}</div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">
                    {locale === "zh" ? "创建时间" : "Created"}: {formatAssetTimestamp(artifact.createdAt, locale)}
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
