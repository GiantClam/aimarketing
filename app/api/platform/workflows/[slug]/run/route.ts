import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { normalizeLocale } from "@/lib/i18n/config"
import {
  buildPlatformWorkflowRunDetailPath,
  buildPlatformWorkflowRunInputPayload,
  createPlatformWorkflowRun,
  recordPlatformWorkflowProxyFailure,
  recordPlatformWorkflowProxyResult,
  serializePlatformWorkflowRun,
  updatePlatformWorkflowRun,
} from "@/lib/platform/workflow-runner"
import {
  evaluatePlatformExecutionGate,
  proxyPlatformExecutionRequest,
  resolvePlatformBindingExecutionProxyTarget,
} from "@/lib/platform/execute"
import { getPlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const currentUser = await getSessionUser(request).catch(() => null)

  if (!currentUser) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 })
  }

  if (!currentUser.enterpriseId) {
    return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
  }

  const searchParams = new URL(request.url).searchParams
  const locale = normalizeLocale(searchParams.get("locale")) || "en"
  const surface = searchParams.get("surface") === "public" ? "public" : "workspace"
  const action = searchParams.get("action")
  const execution = await getPlatformRegistryEntryExecutionState({
    locale,
    itemType: "workflow",
    slug,
    surface,
    enterpriseId: currentUser.enterpriseId,
    currentUser,
  })

  if (!execution) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const target = resolvePlatformBindingExecutionProxyTarget(execution.bindingTarget, action)
  if (!target) {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
  }

  const gate = evaluatePlatformExecutionGate({
    currentUser,
    requiresLogin: target.requiresLogin,
    runtimeStatus: execution.runtimeStatus,
    accessState: execution.accessState,
    usesSharedCredits: execution.usesSharedCredits,
    billingCanSpendCredits: execution.billing?.canSpendCredits ?? null,
  })
  if (!gate.ok) {
    return gate.response
  }

  const rawBody = await request.text()
  const inputPayload = buildPlatformWorkflowRunInputPayload(rawBody, request.headers.get("content-type"))
  const run = await createPlatformWorkflowRun({
    currentUser,
    slug,
    action,
    bindingTarget: execution.bindingTarget,
    inputPayload,
  })

  await updatePlatformWorkflowRun({
    runId: run.id,
    patch: {
      status: "running",
      startedAt: new Date(),
    },
  })

  try {
    const downstreamResponse = await proxyPlatformExecutionRequest(request, target, rawBody, {
      "x-platform-registry-item-type": "workflow",
      "x-platform-registry-slug": slug,
      "x-platform-binding-target": execution.bindingTarget,
      "x-platform-binding-action": target.action,
      "x-platform-local-run-id": String(run.id),
    })

    const detail = await recordPlatformWorkflowProxyResult({
      runId: run.id,
      response: downstreamResponse,
      target,
      bindingTarget: execution.bindingTarget,
    })

    return NextResponse.json(
      {
        data: {
          run: serializePlatformWorkflowRun(detail),
          detailPath: buildPlatformWorkflowRunDetailPath(run.id),
        },
      },
      { status: detail.status === "running" ? 202 : downstreamResponse.status },
    )
  } catch (error) {
    const detail = await recordPlatformWorkflowProxyFailure({
      runId: run.id,
      error,
      target,
      bindingTarget: execution.bindingTarget,
    })

    return NextResponse.json(
      {
        error: "workflow_dispatch_failed",
        data: {
          run: serializePlatformWorkflowRun(detail),
          detailPath: buildPlatformWorkflowRunDetailPath(run.id),
        },
      },
      { status: 502 },
    )
  }
}
