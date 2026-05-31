import type { SeoComparisonRow } from "@/lib/seo/pages"

export function SeoComparisonTable({
  firstLabel,
  secondLabel,
  rows,
}: {
  firstLabel: string
  secondLabel: string
  rows: SeoComparisonRow[]
}) {
  return (
    <div className="public-panel overflow-hidden rounded-[12px]">
      <div className="grid grid-cols-1 border-b border-border bg-muted text-sm sm:grid-cols-[0.75fr_1fr_1fr]">
        <div className="public-kicker px-4 py-3 text-muted-foreground">Dimension</div>
        <div className="public-kicker px-4 py-3 text-muted-foreground">{firstLabel}</div>
        <div className="public-kicker px-4 py-3 text-muted-foreground">{secondLabel}</div>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row, index) => (
          <div key={row.dimension} className="grid grid-cols-1 sm:grid-cols-[0.75fr_1fr_1fr]">
            <div className="bg-muted/45 px-4 py-4">
              <div className="font-display text-xs font-bold uppercase tracking-[0.08em] text-foreground/48">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">{row.dimension}</div>
            </div>
            <div className="px-4 py-4 text-sm leading-6 text-muted-foreground">{row.first}</div>
            <div className="px-4 py-4 text-sm leading-6 text-muted-foreground">{row.second}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
