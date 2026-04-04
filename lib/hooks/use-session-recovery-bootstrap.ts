"use client"

import { useCallback, useRef } from "react"

import { buildSessionRecoveryPlan, type SessionRecoveryPlan } from "@/lib/session-recovery"

type SessionRecoveryReconcileInput = {
  background: boolean
  forceRefresh: boolean
  keepCurrentOnError: boolean
}

type SessionRecoveryRetryOptions = {
  enabled?: boolean
  maxAttempts?: number
  fastDelayMs?: number
  slowDelayMs?: number
  fastAttempts?: number
}

type SessionRecoveryBootstrapOptions<TCache> = {
  entityId: string
  cacheSnapshot: TCache | null | undefined
  hasVisibleContent: boolean
  forceRefresh?: boolean
  restoreCache?: (cache: TCache, plan: SessionRecoveryPlan) => void
  onMissingCache?: (plan: SessionRecoveryPlan) => void
  reconcile: (input: SessionRecoveryReconcileInput, plan: SessionRecoveryPlan) => Promise<void>
  shouldRetryReconcile?: () => boolean
  retry?: SessionRecoveryRetryOptions
  onReconcileError?: (error: unknown, phase: "initial" | "retry") => void
}

const DEFAULT_RETRY_MAX_ATTEMPTS = 24
const DEFAULT_RETRY_FAST_DELAY_MS = 2_500
const DEFAULT_RETRY_SLOW_DELAY_MS = 5_000
const DEFAULT_RETRY_FAST_ATTEMPTS = 8

export function useSessionRecoveryBootstrap() {
  const taskIdRef = useRef(0)

  return useCallback(<TCache>(options: SessionRecoveryBootstrapOptions<TCache>) => {
    const taskId = ++taskIdRef.current
    let cancelled = false

    const isCancelled = () => cancelled || taskIdRef.current !== taskId
    const wait = (delayMs: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs)
      })

    const hasCache = Boolean(options.cacheSnapshot)
    const plan = buildSessionRecoveryPlan({
      hasCache,
      hasVisibleContent: options.hasVisibleContent,
      forceRefresh: options.forceRefresh,
    })

    if (hasCache && options.cacheSnapshot) {
      options.restoreCache?.(options.cacheSnapshot, plan)
    } else {
      options.onMissingCache?.(plan)
    }

    void (async () => {
      try {
        await options.reconcile(
          {
            background: plan.reconcileInBackground,
            forceRefresh: plan.forceRefresh,
            keepCurrentOnError: plan.keepCurrentOnError,
          },
          plan,
        )
      } catch (error) {
        if (!isCancelled()) {
          options.onReconcileError?.(error, "initial")
        }
      }

      if (isCancelled() || !options.shouldRetryReconcile) {
        return
      }

      const retryEnabled = options.retry?.enabled ?? true
      if (!retryEnabled) {
        return
      }

      const maxAttempts = options.retry?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS
      const fastDelayMs = options.retry?.fastDelayMs ?? DEFAULT_RETRY_FAST_DELAY_MS
      const slowDelayMs = options.retry?.slowDelayMs ?? DEFAULT_RETRY_SLOW_DELAY_MS
      const fastAttempts = options.retry?.fastAttempts ?? DEFAULT_RETRY_FAST_ATTEMPTS

      for (let attempt = 0; attempt < maxAttempts && !isCancelled(); attempt += 1) {
        if (!options.shouldRetryReconcile()) {
          return
        }

        const delayMs = attempt < fastAttempts ? fastDelayMs : slowDelayMs
        await wait(delayMs)
        if (isCancelled()) {
          return
        }
        if (!options.shouldRetryReconcile()) {
          return
        }

        try {
          await options.reconcile(
            {
              background: true,
              forceRefresh: true,
              keepCurrentOnError: true,
            },
            plan,
          )
        } catch (error) {
          if (!isCancelled()) {
            options.onReconcileError?.(error, "retry")
          }
        }
      }
    })()

    return () => {
      cancelled = true
      if (taskIdRef.current === taskId) {
        taskIdRef.current += 1
      }
    }
  }, [])
}
