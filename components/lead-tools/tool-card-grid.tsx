import Link from "next/link"
import { ArrowUpRight, FileText, Mail, Megaphone, Search, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { LeadToolDefinition } from "@/lib/lead-tools/catalog"

const iconMap = {
  presentation: Sparkles,
  seo: Search,
  ads: Megaphone,
  email: Mail,
} as const

type ToolCardGridProps = {
  tools: LeadToolDefinition[]
  className?: string
  title?: string
  description?: string
}

export function ToolCardGrid({ tools, className, title, description }: ToolCardGridProps) {
  return (
    <section className={cn("space-y-6", className)}>
      {(title || description) && (
        <div className="max-w-2xl space-y-3">
          {title ? <h2 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h2> : null}
          {description ? <p className="text-base leading-7 text-muted-foreground">{description}</p> : null}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tools.map((tool) => {
          const Icon = iconMap[tool.icon] ?? FileText

          return (
            <Card
              key={tool.slug}
              className="border-border/70 bg-card/90 shadow-[0_18px_60px_-36px_rgba(0,0,0,0.65)] transition-transform duration-200 hover:-translate-y-1"
            >
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge variant={tool.status === "live" ? "default" : "outline"}>
                    {tool.status === "live" ? "已上线" : "即将上线"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-xl">{tool.name}</CardTitle>
                  <CardDescription className="leading-6">{tool.tagline}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {tool.proofPoints.map((point) => (
                    <Badge key={point} variant="outline" className="border-primary/20 bg-primary/5 text-muted-foreground">
                      {point}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{tool.description}</p>
              </CardContent>
              <CardFooter>
                {tool.status === "live" ? (
                  <Button asChild className="w-full">
                    <Link href={tool.href}>
                      进入工具
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    即将上线
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
