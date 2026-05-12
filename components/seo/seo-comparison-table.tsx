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
    <div className="overflow-hidden rounded-[24px] border-2 border-border bg-card">
      <div className="grid grid-cols-1 border-b-2 border-border bg-muted text-sm font-semibold sm:grid-cols-[0.75fr_1fr_1fr]">
        <div className="px-4 py-3">Dimension</div>
        <div className="px-4 py-3">{firstLabel}</div>
        <div className="px-4 py-3">{secondLabel}</div>
      </div>
      <div className="divide-y-2 divide-border">
        {rows.map((row) => (
          <div key={row.dimension} className="grid grid-cols-1 sm:grid-cols-[0.75fr_1fr_1fr]">
            <div className="bg-muted/50 px-4 py-4 text-sm font-semibold text-foreground">{row.dimension}</div>
            <div className="px-4 py-4 text-sm leading-6 text-muted-foreground">{row.first}</div>
            <div className="px-4 py-4 text-sm leading-6 text-muted-foreground">{row.second}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
