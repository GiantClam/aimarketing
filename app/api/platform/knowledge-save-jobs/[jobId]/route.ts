import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { createPersonalKnowledgeDocument } from "@/lib/knowledge/personal-datasets"
import { ingestKnowledgeFile } from "@/lib/knowledge/service"
import { assertArtifactEnterpriseAccess } from "@/lib/platform/artifact-actions"
import {
  getPlatformArtifact,
  getPlatformKnowledgeSaveJob,
  updatePlatformKnowledgeSaveJob,
} from "@/lib/platform/task-run-store"

export const runtime = "nodejs"

function readKnowledgeJobAction(body: Record<string, unknown> | null) {
  return body?.action === "reject" ? "reject" : body?.action === "approve" ? "approve" : null
}

function readKnowledgeArtifactMarkdown(artifact: Awaited<ReturnType<typeof getPlatformArtifact>>) {
  if (!artifact) return null
  const payload = artifact.payload
  if (!payload || typeof payload !== "object") return null
  return typeof payload.text === "string" && payload.text.trim() ? payload.text.trim() : null
}

function readPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null
}

function readKnowledgeCategory(value: unknown) {
  return typeof value === "string" &&
    ["general", "brand", "product", "case-study", "compliance", "campaign"].includes(value)
    ? (value as "general" | "brand" | "product" | "case-study" | "compliance" | "campaign")
    : "general"
}

function buildKnowledgeFileName(title: string) {
  const normalized = title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "")
  return `${normalized || "workflow-knowledge"}.md`
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.id) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }
    if (!currentUser.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { jobId } = await context.params
    const numericJobId = Number(jobId)
    if (!Number.isInteger(numericJobId) || numericJobId <= 0) {
      return NextResponse.json({ error: "invalid_knowledge_save_job_id" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const action = readKnowledgeJobAction(body)
    if (!action) {
      return NextResponse.json({ error: "invalid_knowledge_save_job_action" }, { status: 400 })
    }

    const job = await getPlatformKnowledgeSaveJob(numericJobId)
    if (!job || job.enterpriseId !== currentUser.enterpriseId) {
      return NextResponse.json({ error: "knowledge_save_job_not_found" }, { status: 404 })
    }

    if (job.status === "succeeded" || job.status === "rejected") {
      return NextResponse.json({ error: "knowledge_save_job_already_resolved" }, { status: 409 })
    }

    const artifact = assertArtifactEnterpriseAccess(currentUser, await getPlatformArtifact(job.artifactId))

    if (action === "reject") {
      const rejected = await updatePlatformKnowledgeSaveJob(job.id, currentUser.enterpriseId, {
        status: "rejected",
        errorMessage: null,
        resultPayload: {
          action: "rejected",
          actorUserId: currentUser.id,
          resolvedAt: new Date().toISOString(),
        },
      })

      return NextResponse.json({ data: rejected })
    }

    const requestPayload = job.requestPayload ?? {}
    const datasetId = readPositiveInteger(requestPayload.datasetId)
    const datasetScope = requestPayload.datasetScope === "personal" ? "personal" : "enterprise"
    const knowledgeCategory = readKnowledgeCategory(requestPayload.knowledgeCategory)
    const markdown = readKnowledgeArtifactMarkdown(artifact)

    if (!datasetId || !markdown) {
      return NextResponse.json({ error: "knowledge_save_job_not_actionable" }, { status: 409 })
    }

    await updatePlatformKnowledgeSaveJob(job.id, currentUser.enterpriseId, {
      status: "running",
      errorMessage: null,
    })

    try {
      const resultPayload =
        datasetScope === "personal"
          ? await (async () => {
              const document = await createPersonalKnowledgeDocument({
                userId: artifact.ownerUserId,
                enterpriseId: artifact.enterpriseId,
                datasetId,
                name: artifact.title,
                sourceType: "workflow",
                status: "ready",
                contentMarkdown: markdown,
                metadata: {
                  knowledgeCategory,
                  sourceArtifactId: artifact.id,
                  knowledgeSaveJobId: job.id,
                },
              })

              return {
                action: "approved",
                actorUserId: currentUser.id,
                resolvedAt: new Date().toISOString(),
                datasetId,
                datasetScope,
                knowledgeCategory,
                knowledgeDocumentId: document.id,
              }
            })()
          : await (async () => {
              const document = await ingestKnowledgeFile({
                enterpriseId: artifact.enterpriseId,
                datasetId,
                category: knowledgeCategory,
                fileName: buildKnowledgeFileName(artifact.title),
                contentType: artifact.mimeType || "text/markdown",
                bytes: Buffer.from(markdown, "utf8"),
              })

              return {
                action: "approved",
                actorUserId: currentUser.id,
                resolvedAt: new Date().toISOString(),
                datasetId,
                datasetScope,
                knowledgeCategory,
                knowledgeDocumentId: document.id,
              }
            })()

      const approved = await updatePlatformKnowledgeSaveJob(job.id, currentUser.enterpriseId, {
        status: "succeeded",
        errorMessage: null,
        resultPayload,
      })

      return NextResponse.json({ data: approved })
    } catch (error) {
      const message = error instanceof Error ? error.message : "knowledge_save_job_approve_failed"
      await updatePlatformKnowledgeSaveJob(job.id, currentUser.enterpriseId, {
        status: "failed",
        errorMessage: message,
      })
      return NextResponse.json({ error: message }, { status: 500 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_save_job_action_failed"
    const status =
      message === "authentication_required"
        ? 401
        : message === "enterprise_context_required"
          ? 403
          : message === "artifact_not_found"
            ? 404
            : 500

    return NextResponse.json({ error: message }, { status })
  }
}
