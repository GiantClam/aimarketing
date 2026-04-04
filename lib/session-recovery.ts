"use client"

export type SessionRecoveryPlan = {
  hasCache: boolean
  hasVisibleContent: boolean
  showLoadingState: boolean
  reconcileInBackground: boolean
  keepCurrentOnError: boolean
  forceRefresh: boolean
}

export function buildSessionRecoveryPlan(params: {
  hasCache: boolean
  hasVisibleContent: boolean
  forceRefresh?: boolean
}): SessionRecoveryPlan {
  const hasCache = Boolean(params.hasCache)
  const hasVisibleContent = Boolean(params.hasVisibleContent)

  return {
    hasCache,
    hasVisibleContent,
    showLoadingState: !hasCache || !hasVisibleContent,
    reconcileInBackground: hasCache,
    keepCurrentOnError: hasCache,
    forceRefresh: hasCache || Boolean(params.forceRefresh),
  }
}

