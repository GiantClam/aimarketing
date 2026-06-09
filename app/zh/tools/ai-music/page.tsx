import type { Metadata } from "next"

import { getAiMusicPageMetadata, renderAiMusicPage } from "@/app/tools/ai-music/page"

export const metadata: Metadata = getAiMusicPageMetadata("zh")

export default function ZhAiMusicPage() {
  return renderAiMusicPage("zh")
}
