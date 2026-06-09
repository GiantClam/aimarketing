import type { Metadata } from "next"

import { getAiMusicPageMetadata, renderAiMusicPage } from "@/app/tools/ai-music/page"

export const metadata: Metadata = getAiMusicPageMetadata("en")

export default function EnAiMusicPage() {
  return renderAiMusicPage("en")
}
