import {
  materializeLeadToolPptDeckWithPptMasterRuntime,
} from "@/lib/lead-tools/generation-ppt-fixed"
import type { LeadToolPptPreviewRuntime } from "@/lib/lead-tools/ppt-engines/preview-runtime-types"

export const pptMasterPreviewRuntime: LeadToolPptPreviewRuntime = {
  id: "ppt-master-agent",
  renderKind: "svg",
  materializeStoryDeck(deck) {
    return materializeLeadToolPptDeckWithPptMasterRuntime(deck)
  },
}
