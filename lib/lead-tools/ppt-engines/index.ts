import type { LeadToolPptEngines } from "@/lib/lead-tools/ppt-engines/types"
import { getPptMasterEngines } from "@/lib/lead-tools/ppt-engines/ppt-master-engine"

export { materializeRemotePptWorkerPreview } from "@/lib/lead-tools/ppt-engines/ppt-master-engine"

let cachedEngines: LeadToolPptEngines | null = null

export function getLeadToolPptEngines(): LeadToolPptEngines {
  if (!cachedEngines) {
    cachedEngines = getPptMasterEngines()
  }

  return cachedEngines
}
