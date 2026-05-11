"use client"

import { useTransition } from "react"
import { Globe } from "lucide-react"
import { useRouter } from "next/navigation"

import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type LocaleSwitcherProps = {
  compact?: boolean
  className?: string
}

export function LocaleSwitcher({
  compact = false,
  className,
}: LocaleSwitcherProps) {
  const router = useRouter()
  const { locale, setLocale } = useI18n()
  const [isPending, startTransition] = useTransition()

  const handleLocaleChange = (nextLocale: "zh" | "en") => {
    if (nextLocale === locale) return
    setLocale(nextLocale)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-card p-1",
        className,
      )}
    >
      {!compact ? (
        <span className="px-2 text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
        </span>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant={locale === "zh" ? "default" : "ghost"}
        className={cn(
          "h-7 rounded-full px-2.5 text-[11px]",
          compact && "min-w-[34px] px-2",
        )}
        onClick={() => handleLocaleChange("zh")}
        disabled={isPending}
        aria-pressed={locale === "zh"}
        title="切换到中文"
      >
        {compact ? "中" : "中文"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={locale === "en" ? "default" : "ghost"}
        className={cn(
          "h-7 rounded-full px-2.5 text-[11px]",
          compact && "min-w-[34px] px-2",
        )}
        onClick={() => handleLocaleChange("en")}
        disabled={isPending}
        aria-pressed={locale === "en"}
        title="Switch to English"
      >
        EN
      </Button>
    </div>
  )
}
