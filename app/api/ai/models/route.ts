import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  getAiEntryModelCatalog,
  type AiEntryModelCatalog,
  type AiEntryModelGroup,
  type AiEntryModelOption,
} from "@/lib/ai-entry/model-catalog"
import {
  getConfiguredAiEntryProviders,
  type AiEntryProviderId,
} from "@/lib/ai-entry/provider-routing"
import { areEquivalentModelIds } from "@/lib/ai-entry/model-id-registry"

function parseProviderId(value: string | null): AiEntryProviderId | null {
  const normalized = (value || "").trim().toLowerCase()
  if (normalized === "crazyrouter") return "crazyroute"
  if (
    normalized === "pptoken" ||
    normalized === "openrouter" ||
    normalized === "aiberm" ||
    normalized === "crazyroute"
  ) {
    return normalized
  }
  return null
}

function dedupeModels(models: AiEntryModelOption[]) {
  const output: AiEntryModelOption[] = []
  for (const model of models) {
    if (output.some((item) => areEquivalentModelIds(item.id, model.id))) continue
    output.push(model)
  }
  return output
}

function mergeCatalogs(catalogs: AiEntryModelCatalog[]) {
  const groupBucket = new Map<string, { label: string; models: AiEntryModelOption[] }>()

  for (const catalog of catalogs) {
    for (const group of catalog.modelGroups) {
      const current = groupBucket.get(group.family)
      if (!current) {
        groupBucket.set(group.family, {
          label: group.label,
          models: [...group.models],
        })
        continue
      }
      current.models.push(...group.models)
    }
  }

  const mergedGroups: AiEntryModelGroup[] = [...groupBucket.entries()].map(([family, group]) => ({
    family,
    label: group.label,
    models: dedupeModels(group.models),
  }))

  const mergedModels = dedupeModels(mergedGroups.flatMap((group) => group.models))
  const primaryCatalog = catalogs[0] || null

  return {
    providerId: primaryCatalog?.providerId || null,
    providerBaseUrl: primaryCatalog?.providerBaseUrl || null,
    selectedProviderId: primaryCatalog?.selectedProviderId || primaryCatalog?.providerId || null,
    selectedModelId: primaryCatalog?.selectedModelId || mergedModels[0]?.id || null,
    models: mergedModels,
    modelGroups: mergedGroups,
    cached: catalogs.every((catalog) => catalog.cached),
    fetchedAt: Date.now(),
    recentDays: primaryCatalog?.recentDays || null,
    recentStrict: primaryCatalog?.recentStrict || false,
  } satisfies AiEntryModelCatalog
}

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  try {
    const providerId = parseProviderId(request.nextUrl.searchParams.get("providerId"))
    const providers = getConfiguredAiEntryProviders().map((provider) => ({
      id: provider.id,
      label:
        provider.id === "pptoken"
          ? "PPTOKEN"
          : provider.id === "openrouter"
          ? "OpenRouter"
          : provider.id === "aiberm"
          ? "Aiberm"
          : "CrazyRouter",
    }))
    const catalog = providerId
      ? await getAiEntryModelCatalog({ providerId })
      : mergeCatalogs(
          await Promise.all(
            getConfiguredAiEntryProviders().map((provider) =>
              getAiEntryModelCatalog({ providerId: provider.id }),
            ),
          ),
        )
    return NextResponse.json({
      ...catalog,
      providers,
    }, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_models_list_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
