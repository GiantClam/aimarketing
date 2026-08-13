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

/**
 * A state read can race the write that carried the terminal event. Prefer the
 * explicit terminal status from that event so the platform task cannot stay
 * queued/running after the runtime has already completed.
 */
export function resolveRailwayRuntimeStatus(explicit: RailwayRuntimeStatus | undefined, current: RailwayRuntimeStatus | null | undefined) {
  if (explicit && isRailwayRuntimeTerminal(explicit)) return explicit
  return current || explicit || "running"
}
