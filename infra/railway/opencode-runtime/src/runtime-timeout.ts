export const DEFAULT_OPENCODE_RUN_TIMEOUT_MS = 3_600_000

/**
 * Native PPT generation can spend several minutes in the skill's render and
 * quality-check loop. Keep a deployment typo or stale 5-minute env override
 * from aborting a valid run before the background deadline.
 */
export function resolveOpenCodeRunTimeoutMs(value: string | undefined) {
  const configured = Number.parseInt(value || "", 10)
  return Number.isFinite(configured) && configured > 0
    ? Math.max(configured, DEFAULT_OPENCODE_RUN_TIMEOUT_MS)
    : DEFAULT_OPENCODE_RUN_TIMEOUT_MS
}
