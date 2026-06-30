import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { detectLocaleFromAcceptLanguage, normalizeLocale, type AppLocale } from "@/lib/i18n/config"
import { getPlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"
import { buildWorkflowFromTemplate, resolveWorkflowTemplateDefinitionKey } from "@/lib/workflows/template-definitions"
import { createWorkflowDefinition } from "@/lib/workflows/store"

export const runtime = "nodejs"

function resolveRequestLocale(request: NextRequest) {
  const url = new URL(request.url)
  return (
    normalizeLocale(url.searchParams.get("locale")) ||
    detectLocaleFromAcceptLanguage(request.headers.get("accept-language"))
  ) satisfies AppLocale
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { slug } = await params
    const normalizedSlug = typeof slug === "string" ? slug.trim() : ""
    if (!normalizedSlug) {
      return NextResponse.json({ error: "invalid_template_slug" }, { status: 400 })
    }

    const locale = resolveRequestLocale(request)
    const template = await getPlatformRegistryEntryExecutionState({
      locale,
      itemType: "workflow",
      slug: normalizedSlug,
      surface: "workspace",
      enterpriseId: currentUser.enterpriseId,
      currentUser,
    })
    if (!template) {
      return NextResponse.json({ error: "workflow_template_not_found" }, { status: 404 })
    }

    const templateKey = resolveWorkflowTemplateDefinitionKey({
      slug: template.slug,
      bindingTarget: template.bindingTarget,
    })
    if (!templateKey) {
      return NextResponse.json({ error: "workflow_template_definition_not_found" }, { status: 404 })
    }

    const blueprint = buildWorkflowFromTemplate({
      key: templateKey,
      locale,
      titleOverride: template.title,
      descriptionOverride: template.summary,
    })
    const data = await createWorkflowDefinition({
      enterpriseId: currentUser.enterpriseId,
      ownerUserId: currentUser.id,
      title: blueprint.title,
      description: blueprint.description,
      metadata: {
        ...(blueprint.metadata ?? {}),
        sourceTemplateSlug: template.slug,
        sourceBindingTarget: template.bindingTarget,
      },
      nodes: blueprint.nodes,
      edges: blueprint.edges,
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "workflow_template_instantiate_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
