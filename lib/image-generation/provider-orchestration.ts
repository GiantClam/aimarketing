export type ImageGenerationProvider = "aiberm" | "gemini" | "openrouter" | "fixture"

type ExecuteImageProviderPlanParams<T> = {
  providerPlan: ImageGenerationProvider[]
  signal?: AbortSignal
  handlers: Partial<Record<ImageGenerationProvider, () => Promise<T>>>
  onProviderFailure?: (input: {
    provider: ImageGenerationProvider
    nextProvider: ImageGenerationProvider | null
    error: unknown
  }) => void
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message === "request_aborted")
}

function dedupeProviderPlan(providerPlan: ImageGenerationProvider[]) {
  const seen = new Set<ImageGenerationProvider>()
  const next: ImageGenerationProvider[] = []

  for (const provider of providerPlan) {
    if (seen.has(provider)) continue
    seen.add(provider)
    next.push(provider)
  }

  return next
}

export async function executeImageProviderPlan<T>(params: ExecuteImageProviderPlanParams<T>) {
  const providerPlan = dedupeProviderPlan(params.providerPlan)
  let lastError: unknown = null

  for (let index = 0; index < providerPlan.length; index += 1) {
    const provider = providerPlan[index]
    const handler = params.handlers[provider]
    if (!handler) continue

    try {
      return {
        provider,
        result: await handler(),
      }
    } catch (error) {
      if (params.signal?.aborted || isAbortLikeError(error)) {
        throw error
      }

      lastError = error
      params.onProviderFailure?.({
        provider,
        nextProvider: providerPlan[index + 1] || null,
        error,
      })
    }
  }

  throw lastError instanceof Error ? lastError : new Error("image_generation_provider_missing")
}
