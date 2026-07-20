export type RailwayRuntimeStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled" | "timed_out"
export type PlatformTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export function platformTaskStatusFromRailway(status: RailwayRuntimeStatus): PlatformTaskStatus {
  if (status === "succeeded") return "succeeded"
  if (status === "failed" || status === "timed_out") return "failed"
  if (status === "cancelled") return "cancelled"
  return status === "queued" ? "queued" : "running"
}

export function isRailwayRuntimeTerminal(status: RailwayRuntimeStatus) {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "timed_out"
}
