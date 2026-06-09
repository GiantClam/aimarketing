import type { PlatformRegistryControlEntry } from "@/lib/platform/control-plane"

export type GovernanceRegistryEntryCounts = {
  total: number
  enabled: number
  publicVisible: number
  workspaceVisible: number
  deferred: number
}

export function summarizeRegistryCounts(entries: PlatformRegistryControlEntry[]): GovernanceRegistryEntryCounts {
  return entries.reduce<GovernanceRegistryEntryCounts>(
    (summary, entry) => {
      summary.total += 1
      if (entry.config.enabled) summary.enabled += 1
      if (entry.config.publicVisible) summary.publicVisible += 1
      if (entry.config.workspaceVisible) summary.workspaceVisible += 1
      if (entry.config.bindingMode === "deferred") summary.deferred += 1
      return summary
    },
    {
      total: 0,
      enabled: 0,
      publicVisible: 0,
      workspaceVisible: 0,
      deferred: 0,
    },
  )
}
