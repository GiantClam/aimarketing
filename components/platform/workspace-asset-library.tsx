type WorkspaceAssetLibraryItem = {
  id: number
  title: string
  kind: string
  mimeType: string | null
  runId: number
  createdAt: string | null
  previewKind: "image" | "video" | "audio" | "file"
  sourceUrl: string | null
  previewUrl: string
  downloadUrl: string
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
          download: "下载素材",
          open: "打开来源",
          artifactId: "素材 ID",
          runId: "任务 ID",
          created: "创建时间",
          sourceMissing: "该素材暂时没有可访问的源文件地址。",
        }
      : {
          eyebrow: "Asset Library",
          title: "Asset library",
          description: "This reads directly from the shared artifact store instead of pretending there is a separate asset backend.",
          empty: "No shared artifacts exist for this enterprise yet.",
          download: "Download",
          open: "Open source",
          artifactId: "Artifact ID",
          runId: "Run ID",
          created: "Created",
          sourceMissing: "This artifact does not currently expose a source file URL.",
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

          <div className="grid gap-4 xl:grid-cols-2">
            {artifacts.length === 0 ? (
              <div className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 text-sm text-muted-foreground">
                {copy.empty}
              </div>
            ) : null}

            {artifacts.map((artifact) => (
              <article key={artifact.id} className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="space-y-2">
                  <div className="dashboard-kicker text-muted-foreground">
                    {artifact.kind.toUpperCase()} · {artifact.mimeType || "application/json"}
                  </div>
                  <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {artifact.title}
                  </h2>
                </div>
                <div className="mt-4 rounded-[10px] border border-border/70 bg-background/70 p-3">
                  {artifact.sourceUrl && artifact.previewKind === "image" ? (
                    <img src={artifact.previewUrl} alt={artifact.title} className="max-h-72 w-full rounded-[8px] object-contain" />
                  ) : null}
                  {artifact.sourceUrl && artifact.previewKind === "video" ? (
                    <video src={artifact.previewUrl} controls className="aspect-video w-full rounded-[8px] bg-black/85" />
                  ) : null}
                  {artifact.sourceUrl && artifact.previewKind === "audio" ? (
                    <audio src={artifact.previewUrl} controls className="w-full" />
                  ) : null}
                  {!artifact.sourceUrl || artifact.previewKind === "file" ? (
                    <div className="text-sm text-muted-foreground">{artifact.sourceUrl ? artifact.title : copy.sourceMissing}</div>
                  ) : null}
                </div>
                <div className="mt-4 space-y-2 text-sm text-foreground/85">
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">{copy.artifactId}: {artifact.id}</div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">{copy.runId}: {artifact.runId}</div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2">
                    {copy.created}: {formatAssetTimestamp(artifact.createdAt, locale)}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href={artifact.downloadUrl}
                    className="inline-flex items-center rounded-[8px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    {copy.download}
                  </a>
                  {artifact.sourceUrl ? (
                    <a
                      href={artifact.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-[8px] border border-border bg-background px-4 py-2 text-sm font-medium text-foreground"
                    >
                      {copy.open}
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
