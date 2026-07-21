import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccess } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import { getImageAssistantAvailability, type ImageAssistantRuntimeProviderConfig } from "@/lib/image-assistant/aiberm"
import { resolveGovernedImageAssistantSelectionForUser } from "@/lib/platform/model-governance"

function toRuntimeProviderConfig(selection: Awaited<ReturnType<typeof resolveGovernedImageAssistantSelectionForUser>>): ImageAssistantRuntimeProviderConfig | null {
  const runtime = selection.enterpriseRuntime
  if (!runtime) return null

  if (runtime.kind === "google") {
    return {
      kind: "google",
      config: {
        apiKey: runtime.apiKey,
        model: runtime.model,
      },
      model: runtime.model,
    }
  }

  if (runtime.kind === "runninghub") {
    return {
      kind: "runninghub",
      config: runtime.config,
      model: runtime.model,
    }
  }

  if (runtime.kind === "bailian") {
    return {
      kind: "bailian",
      config: runtime.config,
      model: runtime.model,
    }
  }

  return {
    kind: "openai-compatible",
    provider: "pptoken",
    config: runtime.config,
    model: runtime.model,
  }
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getSessionUser(req)
    if (!currentUser) {
      return NextResponse.json({
        data: {
          enabled: false,
          provider: "unavailable",
          reason: "unauthenticated",
        },
      })
    }

    const hasAccess = hasFeatureAccess(currentUser, "image_design_generation")
    const resolvedSelection = hasAccess
      ? await resolveGovernedImageAssistantSelectionForUser({ user: currentUser }).catch(() => null)
      : null
    const availability = getImageAssistantAvailability({
      runtimeProviderConfig: resolvedSelection ? toRuntimeProviderConfig(resolvedSelection) : null,
    })
    const accessibleProviders = resolvedSelection?.providerOptions || []
    const accessibleModels = resolvedSelection?.modelOptions || []

    return NextResponse.json({
      data: {
        enabled: hasAccess && availability.enabled && accessibleModels.length > 0,
        provider: resolvedSelection?.providerId || availability.provider,
        reason:
          !hasAccess
            ? "feature_access_denied"
            : accessibleModels.length === 0
              ? "image_assistant_model_unavailable_for_user"
              : availability.reason,
        models: resolvedSelection
          ? {
              highQuality: resolvedSelection.model,
              lowCost: resolvedSelection.model,
            }
          : availability.models,
        selectedModelOptionId: resolvedSelection?.modelOptionId || null,
        accessibleModels,
        accessibleProviders,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
