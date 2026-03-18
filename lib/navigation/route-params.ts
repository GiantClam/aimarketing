export function normalizeRouteEntityId(
  routeEntityId: string | null | undefined,
  options?: { invalidIds?: string[] },
) {
  const normalized = routeEntityId?.trim()
  if (!normalized) {
    return null
  }

  const invalidIds = options?.invalidIds ?? ["new"]
  return invalidIds.includes(normalized) ? null : normalized
}
