import type { PptPreviewVariant } from "@/lib/lead-tools/ppt-preview-data-fixed"
import { resolvePptPreviewStyleArchetype } from "@/lib/lead-tools/ppt-preview-data-fixed"

export type FrontendSlidesTheme = {
  deckClass: string
  fontHref: string
  titleFont: string
  bodyFont: string
  monoFont: string
  background: string
  foreground: string
  accent: string
  panel: string
  border: string
  secondary: string
  glow: string
}

export function getFrontendSlidesTheme(
  variant: Pick<PptPreviewVariant, "styleKey" | "palette">,
): FrontendSlidesTheme {
  const archetype = resolvePptPreviewStyleArchetype(variant.styleKey)

  switch (archetype) {
    case "ppt169_brutalist_ai_newspaper_2026":
      return {
        deckClass: "long-table",
        fontHref:
          "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Fraunces:opsz,ital,wght@9..144,1,400;9..144,1,500;9..144,1,600&family=IBM+Plex+Mono:wght@500;700&display=swap",
        titleFont: "'Bricolage Grotesque', sans-serif",
        bodyFont: "'Fraunces', serif",
        monoFont: "'IBM Plex Mono', monospace",
        background: variant.palette.background,
        foreground: variant.palette.foreground,
        accent: variant.palette.accent,
        panel: variant.palette.panel,
        border: variant.palette.border,
        secondary: variant.palette.border,
        glow: "rgba(181,61,42,0.12)",
      }
    case "ppt169_sugar_rush_memphis":
      return {
        deckClass: "playful",
        fontHref:
          "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@500;700&display=swap",
        titleFont: "'Syne', sans-serif",
        bodyFont: "'Space Grotesk', sans-serif",
        monoFont: "'IBM Plex Mono', monospace",
        background: variant.palette.background,
        foreground: variant.palette.foreground,
        accent: variant.palette.accent,
        panel: variant.palette.panel,
        border: variant.palette.border,
        secondary: variant.palette.border,
        glow: "rgba(26,26,26,0.08)",
      }
    case "ppt169_pritzker_2026":
      return {
        deckClass: "broadside",
        fontHref:
          "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;700;800;900&family=IBM+Plex+Mono:wght@500;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap",
        titleFont: "'Barlow', 'Noto Sans SC', sans-serif",
        bodyFont: "'Barlow', 'Noto Sans SC', sans-serif",
        monoFont: "'IBM Plex Mono', monospace",
        background: variant.palette.background,
        foreground: variant.palette.foreground,
        accent: variant.palette.accent,
        panel: variant.palette.panel,
        border: variant.palette.border,
        secondary: variant.palette.border,
        glow: "rgba(232,93,38,0.14)",
      }
    case "ppt169_building_effective_agents":
      return {
        deckClass: "agents",
        fontHref: "",
        titleFont: '"Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
        bodyFont: '"Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
        monoFont: '"IBM Plex Mono", Consolas, monospace',
        background: variant.palette.background,
        foreground: variant.palette.foreground,
        accent: variant.palette.accent,
        panel: variant.palette.panel,
        border: variant.palette.border,
        secondary: "#9CA3AF",
        glow: "rgba(212,132,90,0.12)",
      }
    case "ppt169_swiss_grid_systems":
      return {
        deckClass: "neo-grid-bold",
        fontHref:
          "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap",
        titleFont: "'Space Grotesk', sans-serif",
        bodyFont: "'Space Grotesk', sans-serif",
        monoFont: "'JetBrains Mono', monospace",
        background: variant.palette.background,
        foreground: variant.palette.foreground,
        accent: variant.palette.accent,
        panel: variant.palette.panel,
        border: variant.palette.border,
        secondary: variant.palette.border,
        glow: "rgba(230,255,61,0.14)",
      }
  }
}
