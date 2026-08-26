"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { WorkbenchWorkflowDirectory, type WorkbenchWorkflowDirectoryAction } from "@aimarketing/workbench-ui"
import type { PlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"
import type { WorkflowDefinition } from "@/lib/workflows/store"

type WorkflowListDefinition = Omit<WorkflowDefinition, "createdAt" | "updatedAt"> & {
  createdAt: string
  updatedAt: string
}

type WorkflowListRunItem = {
  id: number
  workflowId: number | null
  itemSlug: string
  status: string
  createdAt: string | null
  finishedAt: string | null
}

type WorkflowTemplateItem = Pick<
  PlatformRegistryEntryExecutionState,
  | "slug"
  | "status"
  | "title"
  | "summary"
>

export function WorkflowListPage({
  locale,
  initialWorkflows,
  initialTemplates,
  recentRuns,
}: {
  locale: "zh" | "en"
  initialWorkflows: WorkflowListDefinition[]
  initialTemplates: WorkflowTemplateItem[]
  recentRuns: WorkflowListRunItem[]
  currentUserName: string
}) {
  const router = useRouter()
  const [workflows, setWorkflows] = useState(initialWorkflows)
  const [templates] = useState(initialTemplates)
  const [errorMessage, setErrorMessage] = useState("")

  async function createWorkflow(payload: {
    title: string
    description: string | null
    nodes?: WorkflowDefinition["nodes"]
    edges?: WorkflowDefinition["edges"]
    metadata?: WorkflowDefinition["metadata"]
  }) {
    const response = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.data) {
      throw new Error(typeof result?.error === "string" ? result.error : "workflow_create_failed")
    }

    const created = result.data as WorkflowDefinition
    return {
      ...created,
      createdAt: new Date(created.createdAt).toISOString(),
      updatedAt: new Date(created.updatedAt).toISOString(),
    } satisfies WorkflowListDefinition
  }

  async function handleCreate() {
    setErrorMessage("")
    try {
      const created = await createWorkflow({
        title: locale === "zh" ? "未命名工作流" : "Untitled workflow",
        description: null,
      })
      setWorkflows((current) => [created, ...current])
      router.push(`/dashboard/workflows/${created.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_create_failed")
    }
  }

  async function handleDuplicate(workflow: WorkflowListDefinition) {
    setErrorMessage("")
    try {
      const created = await createWorkflow({
        title: `${workflow.title} ${locale === "zh" ? "副本" : "Copy"}`,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
        metadata: workflow.metadata,
      })
      setWorkflows((current) => [created, ...current])
      router.push(`/dashboard/workflows/${created.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_duplicate_failed")
    }
  }

  async function handleCreateFromTemplate(template: WorkflowTemplateItem) {
    setErrorMessage("")
    try {
      const response = await fetch(`/api/workflow-templates/${template.slug}/instantiate?locale=${locale}`, {
        method: "POST",
        credentials: "same-origin",
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.data) {
        throw new Error(typeof result?.error === "string" ? result.error : "workflow_template_instantiate_failed")
      }

      const created = result.data as WorkflowDefinition
      const normalized = {
        ...created,
        createdAt: new Date(created.createdAt).toISOString(),
        updatedAt: new Date(created.updatedAt).toISOString(),
      } satisfies WorkflowListDefinition
      setWorkflows((current) => [normalized, ...current])
      router.push(`/dashboard/workflows/${normalized.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_template_instantiate_failed")
    }
  }

  async function handleDeleteWorkflow(workflow: WorkflowListDefinition) {
    const confirmed =
      typeof window !== "undefined" &&
      window.confirm(
        locale === "zh"
          ? `确认删除工作流「${workflow.title}」？此操作不可撤销。`
          : `Delete workflow "${workflow.title}"? This cannot be undone.`,
      )
    if (!confirmed) return

    setErrorMessage("")
    try {
      const response = await fetch(`/api/workflows/${workflow.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "If-Match": `"${workflow.revision ?? 1}"` },
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof result?.error === "string" ? result.error : "workflow_delete_failed")
      }
      setWorkflows((current) => current.filter((item) => item.id !== workflow.id))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "workflow_delete_failed")
    }
  }

  const handleDirectoryAction = async (action: WorkbenchWorkflowDirectoryAction) => {
    if (action.type === "create") return handleCreate()
    if (!action.id) return

    if (action.type === "open") {
      router.push(`/dashboard/workflows/${action.id}`)
      return
    }
    if (action.type === "duplicate") {
      const workflow = workflows.find((item) => String(item.id) === action.id)
      if (workflow) await handleDuplicate(workflow)
      return
    }
    if (action.type === "delete") {
      const workflow = workflows.find((item) => String(item.id) === action.id)
      if (workflow) await handleDeleteWorkflow(workflow)
      return
    }
    if (action.type === "instantiate") {
      const template = templates.find((item) => item.slug === action.id)
      if (template) await handleCreateFromTemplate(template)
      return
    }
    if (action.type === "open-run") {
      router.push(`/dashboard/workflows/runs/${action.id}`)
    }
  }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <WorkbenchWorkflowDirectory
        locale={locale}
        workflows={workflows.map((workflow) => ({
          id: String(workflow.id),
          title: workflow.title,
          description: workflow.description ?? "",
          status: workflow.status,
          updatedAt: workflow.updatedAt,
          nodeCount: workflow.nodes.length,
        }))}
        templates={templates.map((template) => ({
          id: template.slug,
          title: template.title,
          description: template.summary,
          status: "ready",
        }))}
        recentRuns={recentRuns.map((run) => ({
          id: String(run.id),
          ...(run.workflowId === null ? {} : { workflowId: String(run.workflowId) }),
          workflowTitle: workflows.find((workflow) => workflow.id === run.workflowId)?.title ?? run.itemSlug,
          status: run.status,
          createdAt: run.createdAt ?? "",
          ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
        }))}
        onAction={handleDirectoryAction}
      />
      {errorMessage ? <p className="mx-auto max-w-[1440px] px-4 pb-6 text-sm text-destructive">{errorMessage}</p> : null}
    </div>
  )
}
