"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, RefreshCcw, Workflow, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkspaceOutputActions } from "@/components/workspace/workspace-output-actions"
import { WorkflowNodeOutputPreview } from "@/components/workflows/workflow-node-output-preview"
import { cn } from "@/lib/utils"
import type { SerializedWorkflowRunDetail } from "@/lib/workflows/run-detail-serialization"
import { summarizeWorkflowRunGovernance } from "@/lib/workflows/run-governance"
import { isWorkflowNodeType, resolveWorkflowNodeTitle } from "@/lib/workflows/schema"
import { buildWorkflowRunStatusPath } from "@/lib/workflows/run-status-path"
import { isWorkflowRunActiveStatus } from "@/lib/workflows/run-status"

type WorkflowRunStatus = string
type WorkflowNodeExecutionStatus = string

type SerializedWorkflowNode = {
  nodeKey: string
  type: string
  title: string
  positionX: number
  positionY: number
  config: Record<string, unknown>
}

type SerializedWorkflowEdge = {
  sourceNodeKey: string
  targetNodeKey: string
  inputName: string | null
}

export type WorkflowRunResultsDetail = SerializedWorkflowRunDetail & {
  detailPath: string
}

type WorkflowRunStatusSnapshot = {
  run: WorkflowRunResultsDetail["run"]
  nodeExecutions: WorkflowRunResultsDetail["nodeExecutions"]
  detailPath: string
  statusPath?: string
}

type WorkflowRunResultsPageProps = {
  locale: "zh" | "en"
  detail: WorkflowRunResultsDetail
  firstArtifactSourceUrl: string | null
  embedded?: boolean
  onDetailChange?: (detail: WorkflowRunResultsDetail) => void
  onDismiss?: () => void
}

function formatTimestamp(locale: "zh" | "en", value: string | null) {
  if (!value) return locale === "zh" ? "未记录" : "Not recorded"

  try {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

function getStatusTone(status: WorkflowRunStatus | WorkflowNodeExecutionStatus) {
  if (status === "succeeded") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "running") return "border-blue-200 bg-blue-50 text-blue-700"
  if (status === "rejected") return "border-slate-200 bg-slate-100 text-slate-700"
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700"
  if (status === "cancelled") return "border-neutral-200 bg-neutral-100 text-neutral-600"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function getStatusLabel(locale: "zh" | "en", status: WorkflowRunStatus | WorkflowNodeExecutionStatus) {
  if (locale === "zh") {
    if (status === "queued") return "排队中"
    if (status === "running") return "运行中"
    if (status === "succeeded") return "已成功"
    if (status === "rejected") return "已驳回"
    if (status === "failed") return "失败"
    return "已取消"
  }

  if (status === "queued") return "Queued"
  if (status === "running") return "Running"
  if (status === "succeeded") return "Succeeded"
  if (status === "rejected") return "Rejected"
  if (status === "failed") return "Failed"
  return "Cancelled"
}

function buildChildMap(nodes: SerializedWorkflowNode[], edges: SerializedWorkflowEdge[]) {
  const childMap = new Map<string, string[]>()
  for (const node of nodes) {
    childMap.set(node.nodeKey, [])
  }

  for (const edge of edges) {
    const current = childMap.get(edge.sourceNodeKey) ?? []
    current.push(edge.targetNodeKey)
    childMap.set(edge.sourceNodeKey, current)
  }

  return childMap
}

function collectDescendantKeys(nodeKey: string, childMap: Map<string, string[]>) {
  const collected = new Set<string>()
  const queue = [...(childMap.get(nodeKey) ?? [])]

  while (queue.length > 0) {
    const next = queue.shift()!
    if (collected.has(next)) continue
    collected.add(next)
    for (const child of childMap.get(next) ?? []) {
      queue.push(child)
    }
  }

  return collected
}

function formatNodeType(locale: "zh" | "en", type: string) {
  return isWorkflowNodeType(type) ? resolveWorkflowNodeTitle(type, null, locale) : type.replace(/_/g, " ")
}

function getGovernanceTone(status: "tracked" | "attention" | "pending") {
  if (status === "tracked") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "pending") return "border-blue-200 bg-blue-50 text-blue-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function getGovernanceLabel(locale: "zh" | "en", status: "tracked" | "attention" | "pending") {
  if (locale === "zh") {
    if (status === "tracked") return "有证据"
    if (status === "pending") return "待运行"
    return "缺少信号"
  }

  if (status === "tracked") return "Tracked"
  if (status === "pending") return "Pending"
  return "Needs signal"
}

export function WorkflowRunResultsPage({
  locale,
  detail: initialDetail,
  firstArtifactSourceUrl,
  embedded = false,
  onDetailChange,
  onDismiss,
}: WorkflowRunResultsPageProps) {
  const [detail, setDetail] = useState(initialDetail)
  const [message, setMessage] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<{ nodeKey: string; mode: "node" | "branch" } | null>(null)
  const [knowledgeJobAction, setKnowledgeJobAction] = useState<{ jobId: number; action: "approve" | "reject" } | null>(null)
  const detailRequestInFlightRef = useRef(false)

  const childMap = useMemo(() => buildChildMap(detail.workflow.nodes, detail.workflow.edges), [detail.workflow.edges, detail.workflow.nodes])
  const workflowNodeMap = useMemo(
    () => new Map(detail.workflow.nodes.map((node) => [node.nodeKey, node] as const)),
    [detail.workflow.nodes],
  )
  const firstArtifact = detail.run.artifacts[0] ?? null
  const governanceSummary = useMemo(
    () =>
      summarizeWorkflowRunGovernance({
        locale,
        workflow: detail.workflow,
        run: detail.run,
        nodeExecutions: detail.nodeExecutions,
      }),
    [detail.nodeExecutions, detail.run, detail.workflow, locale],
  )

  useEffect(() => {
    setDetail(initialDetail)
  }, [initialDetail])

  useEffect(() => {
    if (!isWorkflowRunActiveStatus(detail.run.status)) return

    let cancelled = false
    detailRequestInFlightRef.current = false

    const refreshDetail = async () => {
      if (detailRequestInFlightRef.current) return
      detailRequestInFlightRef.current = true
      try {
        const response = await fetch(detail.statusPath || buildWorkflowRunStatusPath(detail.detailPath), {
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => null)

        if (!response?.ok) return

        const payload = (await response.json().catch(() => null)) as { data?: WorkflowRunStatusSnapshot } | null
        if (!payload?.data?.run || cancelled) return

        const nextStatus = payload.data.run.status
        if (isWorkflowRunActiveStatus(nextStatus)) {
          setDetail((current) => ({
            ...current,
            run: {
              ...current.run,
              ...payload.data!.run,
            },
            nodeExecutions: payload.data!.nodeExecutions,
          }))
          return
        }

        const fullResponse = await fetch(detail.detailPath, {
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => null)
        const fullPayload = fullResponse?.ok
          ? ((await fullResponse.json().catch(() => null)) as { data?: WorkflowRunResultsDetail } | null)
          : null
        if (!cancelled && fullPayload?.data?.run) {
          setDetail(fullPayload.data)
          onDetailChange?.(fullPayload.data)
        }
      } finally {
        detailRequestInFlightRef.current = false
      }
    }

    void refreshDetail()
    const timer = window.setInterval(() => {
      void refreshDetail()
    }, 3000)

    return () => {
      cancelled = true
      detailRequestInFlightRef.current = false
      window.clearInterval(timer)
    }
  }, [detail.detailPath, detail.run.status, detail.statusPath, onDetailChange])

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Workflow Run",
          title: "工作流运行结果",
          description: "这里直接读取 workflow run、node execution、artifact 和 work item 的真实链路，并暴露节点级与分支级重试。",
          backToWorkflows: "返回工作流",
          backToTasks: "返回任务中心",
          statusLabel: "运行状态",
          timeline: "节点时间线",
          outputs: "输出与结果",
          events: "运行事件",
          payload: "结果载荷",
          workflow: "工作流",
          retryNode: "重试节点",
          retryBranch: "重试分支",
          retryHint: "分支重试会重跑该节点及其所有下游节点。",
          artifact: "输出产物",
          workItem: "作品记录",
          governance: "治理摘要",
          governanceSignals: "治理信号",
          qualityGate: "质量门",
          reviewRules: "审查规则",
          channels: "默认渠道",
          bannedTerms: "禁用词",
          knowledgeJobs: "知识入库任务",
          approveKnowledgeJob: "确认入库",
          rejectKnowledgeJob: "驳回入库",
          approvalSignals: "审批信号",
          defaultPreset: "默认预设",
          knowledgeFlow: "知识闭环",
          noneConfigured: "未配置",
          none: "暂无",
          executionId: "执行记录",
          nodeCount: "个节点",
          edgeCount: "条连线",
          workItemCount: "个作品记录",
          inputPayload: "已记录输入载荷",
          panelTitle: "当前运行结果",
          dismiss: "关闭结果面板",
      }
      : {
          eyebrow: "Workflow Run",
          title: "Workflow run results",
          description:
            "This page reads the real workflow run, node execution, artifact, and work-item chain, and exposes node-level and branch-level retry.",
          backToWorkflows: "Back to workflows",
          backToTasks: "Back to task center",
          statusLabel: "Run status",
          timeline: "Node timeline",
          outputs: "Outputs and results",
          events: "Run events",
          payload: "Result payload",
          workflow: "Workflow",
          retryNode: "Retry node",
          retryBranch: "Retry branch",
          retryHint: "Branch retry reruns this node and all downstream nodes.",
          artifact: "Artifact",
          workItem: "Work item",
          governance: "Governance summary",
          governanceSignals: "Governance signals",
          qualityGate: "Quality gate",
          reviewRules: "Review rules",
          channels: "Default channels",
          bannedTerms: "Banned terms",
          knowledgeJobs: "Knowledge save jobs",
          approveKnowledgeJob: "Approve save",
          rejectKnowledgeJob: "Reject save",
          approvalSignals: "Approval signals",
          defaultPreset: "Default preset",
          knowledgeFlow: "Knowledge loop",
          noneConfigured: "Unconfigured",
          none: "None",
          executionId: "Execution record",
          nodeCount: "nodes",
          edgeCount: "edges",
          workItemCount: "work items",
          inputPayload: "Input payload recorded",
          panelTitle: "Current run results",
          dismiss: "Close results panel",
        }

  async function refreshDetail() {
    const response = await fetch(detail.detailPath, {
      credentials: "same-origin",
      cache: "no-store",
    })
    const payload = (await response.json().catch(() => null)) as { data?: WorkflowRunResultsDetail; error?: string } | null
    if (!response.ok || !payload?.data?.run) {
      throw new Error(payload?.error || "workflow_run_refresh_failed")
    }
    setDetail(payload.data)
    onDetailChange?.(payload.data)
  }

  async function retryNode(nodeKey: string, mode: "node" | "branch") {
    setRetrying({ nodeKey, mode })
    setMessage(null)

    try {
      const response = await fetch(`/api/workflows/runs/${detail.run.id}/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ mode, nodeKey }),
      })
      const payload = (await response.json().catch(() => null)) as { data?: WorkflowRunResultsDetail; error?: string } | null
      if (!response.ok || !payload?.data?.run) {
        throw new Error(payload?.error || "workflow_retry_failed")
      }

      setDetail(payload.data)
      onDetailChange?.(payload.data)
      setMessage(
        locale === "zh"
          ? mode === "branch"
            ? "分支已重新执行。"
            : "节点已重新执行。"
          : mode === "branch"
            ? "Branch retried."
            : "Node retried.",
      )
      toast.success(mode === "branch" ? copy.retryBranch : copy.retryNode)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "workflow_retry_failed"
      setMessage(errorMessage)
      toast.error(mode === "branch" ? copy.retryBranch : copy.retryNode, {
        description: errorMessage,
      })
    } finally {
      setRetrying(null)
    }
  }

  async function resolveKnowledgeSaveJob(jobId: number, action: "approve" | "reject") {
    setKnowledgeJobAction({ jobId, action })
    setMessage(null)

    try {
      const response = await fetch(`/api/platform/knowledge-save-jobs/${jobId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ action }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || "knowledge_save_job_action_failed")
      }

      await refreshDetail()
      const successMessage =
        locale === "zh"
          ? action === "approve"
            ? "知识草稿已确认入库。"
            : "知识草稿已驳回。"
          : action === "approve"
            ? "Knowledge draft approved."
            : "Knowledge draft rejected."
      setMessage(successMessage)
      toast.success(action === "approve" ? copy.approveKnowledgeJob : copy.rejectKnowledgeJob)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "knowledge_save_job_action_failed"
      setMessage(errorMessage)
      toast.error(action === "approve" ? copy.approveKnowledgeJob : copy.rejectKnowledgeJob, {
        description: errorMessage,
      })
    } finally {
      setKnowledgeJobAction(null)
    }
  }

  return (
    <div className={cn("bg-transparent", embedded ? "h-full overflow-auto" : "h-full overflow-auto")}>
      <section className={cn(embedded ? "h-full" : "public-grid-bg workspace-page-shell mx-auto max-w-7xl")}>
        <div className={cn("workspace-stack", embedded ? "h-full" : "")}>
          {embedded ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-card/80 px-4 py-3">
              <div className="min-w-0">
                <div className="dashboard-kicker text-muted-foreground">{copy.eyebrow}</div>
                <h2 className="mt-1 truncate font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {copy.panelTitle}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={cn("rounded-[6px] border px-3 py-1.5 text-xs font-medium", getStatusTone(detail.run.status))}>
                  {getStatusLabel(locale, detail.run.status)}
                </Badge>
                {onDismiss ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-[8px]"
                    onClick={onDismiss}
                    aria-label={copy.dismiss}
                    title={copy.dismiss}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
              <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-4xl space-y-3">
                  <h1 className="font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
                    {copy.title}
                  </h1>
                  <p className="text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/dashboard/workflows"
                    className="dashboard-chip rounded-[4px] px-4 py-2 text-sm text-foreground transition hover:bg-primary hover:text-primary-foreground"
                  >
                    {copy.backToWorkflows}
                  </Link>
                  <Link
                    href="/dashboard/tasks"
                    className="dashboard-chip rounded-[4px] px-4 py-2 text-sm text-foreground transition hover:bg-primary hover:text-primary-foreground"
                  >
                    {copy.backToTasks}
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.statusLabel}</div>
              <div className="mt-3 flex items-center gap-3">
                <Badge className={cn("rounded-[6px] border px-3 py-1.5 text-xs font-medium", getStatusTone(detail.run.status))}>
                  {getStatusLabel(locale, detail.run.status)}
                </Badge>
                <span className="text-sm text-muted-foreground">{detail.run.externalSystem || copy.none}</span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-foreground/85">
                <div className="dashboard-chip rounded-[4px] px-3 py-2">Started: {formatTimestamp(locale, detail.run.startedAt)}</div>
                <div className="dashboard-chip rounded-[4px] px-3 py-2">
                  Finished: {formatTimestamp(locale, detail.run.finishedAt)}
                </div>
              </div>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.timeline}</div>
              <div className="mt-3 text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {detail.nodeExecutions.length}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {detail.workflow.nodes.length} {copy.nodeCount} · {detail.workflow.edges.length} {copy.edgeCount}
              </p>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.outputs}</div>
              <div className="mt-3 text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {detail.run.artifacts.length}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {detail.run.workItems.length} {copy.workItemCount}
              </p>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.events}</div>
              <div className="mt-3 text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {detail.run.events.length}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {detail.run.inputPayload ? copy.inputPayload : copy.none}
              </p>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.governance}</div>
              <div className="mt-3 text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {governanceSummary.totalCreditsConsumed}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {governanceSummary.qualityGates.length} {copy.qualityGate} · {governanceSummary.knowledgeSaveJobCount} {copy.knowledgeJobs}
              </p>
            </article>
          </div>

          {message ? (
            <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 px-4 py-3 text-sm text-muted-foreground">
              {message}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{copy.timeline}</div>
              <div className="mt-3 space-y-3">
                {detail.nodeExecutions.map((execution, index) => {
                  const descendants = collectDescendantKeys(execution.nodeKey, childMap)
                  const canRetryBranch =
                    descendants.size > 0 && (execution.status === "failed" || execution.status === "cancelled")
                  const nodeMeta = workflowNodeMap.get(execution.nodeKey)
                  const displayTitle =
                    nodeMeta && isWorkflowNodeType(nodeMeta.type)
                      ? resolveWorkflowNodeTitle(nodeMeta.type, nodeMeta.title, locale)
                      : nodeMeta?.title || execution.nodeKey
                  const nodeOutput =
                    execution.outputPayload && Object.keys(execution.outputPayload).length > 0 ? execution.outputPayload : null
                  const isRetrying = retrying?.nodeKey === execution.nodeKey

                  return (
                    <section
                      key={execution.id}
                      className={cn(
                        "rounded-[12px] border border-border/80 bg-background/70 p-3",
                        execution.status === "failed"
                          ? "border-red-200/80"
                          : execution.status === "running"
                            ? "border-blue-200/80"
                            : execution.status === "succeeded"
                              ? "border-emerald-200/80"
                              : "border-border/80",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="dashboard-chip rounded-[4px] px-2.5 py-1 text-[11px] text-muted-foreground">
                              #{String(index + 1).padStart(2, "0")}
                            </span>
                            <Badge className={cn("rounded-[6px] border px-3 py-1.5 text-xs font-medium", getStatusTone(execution.status))}>
                              {getStatusLabel(locale, execution.status)}
                            </Badge>
                            <span className="dashboard-chip rounded-[4px] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                              {formatNodeType(locale, execution.nodeType)}
                            </span>
                          </div>
                          <h3 className="font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                            {displayTitle}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {execution.nodeKey} ·{" "}
                            {descendants.size > 0
                              ? `${descendants.size} ${locale === "zh" ? "个下游节点" : "downstream nodes"}`
                              : locale === "zh"
                                ? "叶节点"
                                : "Leaf node"}
                          </p>
                        </div>

                        {execution.status === "failed" || execution.status === "cancelled" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              className="public-button-secondary h-9 px-3 text-xs"
                              type="button"
                              disabled={isRetrying}
                              onClick={() => {
                                void retryNode(execution.nodeKey, "node")
                              }}
                            >
                              {isRetrying && retrying?.mode === "node" ? (
                                <RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <AlertCircle className="mr-2 h-3.5 w-3.5" />
                              )}
                              {copy.retryNode}
                            </Button>
                            {canRetryBranch ? (
                              <Button
                                className="public-button-primary h-9 px-3 text-xs"
                                type="button"
                                disabled={isRetrying}
                                onClick={() => {
                                  void retryNode(execution.nodeKey, "branch")
                                }}
                              >
                                {isRetrying && retrying?.mode === "branch" ? (
                                  <RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Workflow className="mr-2 h-3.5 w-3.5" />
                                )}
                                {copy.retryBranch}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                          {copy.executionId}: {execution.id}
                        </div>
                        <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                          Started: {formatTimestamp(locale, execution.startedAt)}
                        </div>
                        <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                          Finished: {formatTimestamp(locale, execution.finishedAt)}
                        </div>
                        <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                          Credits: {execution.creditsConsumed}
                        </div>
                        <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                          Provider: {execution.providerId || copy.none}
                        </div>
                        <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                          Model: {execution.modelId || copy.none}
                        </div>
                        <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85 md:col-span-2">
                          Task run: {execution.taskRunId ?? copy.none}
                        </div>
                      </div>

                      {execution.inputPayload ? (
                        <div className="mt-3 rounded-[10px] border border-border/70 bg-background/80 p-3">
                          <div className="dashboard-kicker text-muted-foreground">Input</div>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground/80">
                            {JSON.stringify(execution.inputPayload, null, 2)}
                          </pre>
                        </div>
                      ) : null}

                      {nodeOutput ? (
                        <div className="mt-3 rounded-[10px] border border-border/70 bg-background/80 p-3">
                          <div className="dashboard-kicker text-muted-foreground">Output</div>
                          <div className="mt-3">
                            <WorkflowNodeOutputPreview
                              locale={locale}
                              status={execution.status}
                              outputPayload={nodeOutput}
                              errorMessage={execution.errorMessage}
                            />
                          </div>
                          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground/80">
                            {JSON.stringify(nodeOutput, null, 2)}
                          </pre>
                        </div>
                      ) : execution.errorMessage && (execution.status === "failed" || execution.status === "cancelled") ? (
                        <div className="mt-3 rounded-[10px] border border-border/70 bg-background/80 p-3">
                          <div className="dashboard-kicker text-muted-foreground">Output</div>
                          <div className="mt-3">
                            <WorkflowNodeOutputPreview
                              locale={locale}
                              status={execution.status}
                              outputPayload={null}
                              errorMessage={execution.errorMessage}
                            />
                          </div>
                        </div>
                      ) : null}

                      {(execution.status === "failed" || execution.status === "cancelled") && canRetryBranch ? (
                        <div className="mt-4 rounded-[10px] border border-dashed border-border bg-background/70 p-3 text-xs leading-6 text-muted-foreground">
                          {copy.retryHint}
                        </div>
                      ) : null}
                    </section>
                  )
                })}
              </div>
            </article>

            <aside className="space-y-3">
              {firstArtifact ? (
                <WorkspaceOutputActions
                  locale={locale}
                  artifactLabel={firstArtifact.title}
                  artifactId={firstArtifact.id}
                  shareUrl={`/dashboard/workflows/runs/${detail.run.id}`}
                  downloadFilename={firstArtifact.title}
                  downloadMimeType={firstArtifact.mimeType || "application/octet-stream"}
                  downloadUrl={firstArtifactSourceUrl || `/api/platform/artifacts/${firstArtifact.id}/download?download=1`}
                  downloadPayload={firstArtifact.payload}
                />
              ) : null}

              <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="dashboard-kicker text-muted-foreground">{copy.governance}</div>
                <div className="mt-3 space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                      Credits: {governanceSummary.totalCreditsConsumed}
                    </div>
                    <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                      {copy.approvalSignals}: {governanceSummary.approvalSignalCount}
                    </div>
                    <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                      {copy.knowledgeFlow}: {governanceSummary.explicitKnowledgeReadNodes} / {governanceSummary.explicitKnowledgeWriteNodes}
                    </div>
                    <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                      Queue to knowledge: {governanceSummary.assetToKnowledgeQueueNodes}
                    </div>
                  </div>

                  <div className="rounded-[10px] border border-border/70 bg-background/80 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.defaultPreset}</div>
                    {governanceSummary.defaultPreset ? (
                      <div className="mt-3 space-y-2 text-sm text-foreground/85">
                        <div className="font-semibold text-foreground">{governanceSummary.defaultPreset.name}</div>
                        <div>{governanceSummary.defaultPreset.industry || copy.noneConfigured}</div>
                        <div>{governanceSummary.defaultPreset.audience || copy.noneConfigured}</div>
                        <div>{governanceSummary.defaultPreset.brandVoice || copy.noneConfigured}</div>
                        {governanceSummary.defaultPreset.notes ? (
                          <div className="text-muted-foreground">{governanceSummary.defaultPreset.notes}</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-muted-foreground">{copy.noneConfigured}</div>
                    )}
                  </div>

                  <div className="rounded-[10px] border border-border/70 bg-background/80 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.governanceSignals}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {governanceSummary.reviewRules.map((item) => (
                        <span key={`review-${item}`} className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                          {copy.reviewRules}: {item}
                        </span>
                      ))}
                      {governanceSummary.channelTargets.map((item) => (
                        <span key={`channel-${item}`} className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                          {copy.channels}: {item}
                        </span>
                      ))}
                      {governanceSummary.bannedTerms.map((item) => (
                        <span key={`banned-${item}`} className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                          {copy.bannedTerms}: {item}
                        </span>
                      ))}
                      {governanceSummary.allowedKnowledgeDatasetIds.map((item) => (
                        <span key={`knowledge-${item}`} className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                          Knowledge ID: {item}
                        </span>
                      ))}
                      {governanceSummary.reviewRules.length === 0 &&
                      governanceSummary.channelTargets.length === 0 &&
                      governanceSummary.bannedTerms.length === 0 &&
                      governanceSummary.allowedKnowledgeDatasetIds.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{copy.noneConfigured}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[10px] border border-border/70 bg-background/80 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.qualityGate}</div>
                    <div className="mt-3 space-y-2">
                      {governanceSummary.qualityGates.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{copy.noneConfigured}</div>
                      ) : (
                        governanceSummary.qualityGates.map((gate) => (
                          <div key={gate.label} className="rounded-[8px] border border-border/70 bg-card/60 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-foreground">{gate.label}</div>
                              <Badge className={cn("rounded-[6px] border px-3 py-1 text-xs font-medium", getGovernanceTone(gate.status))}>
                                {getGovernanceLabel(locale, gate.status)}
                              </Badge>
                            </div>
                            {gate.evidence.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {gate.evidence.map((item) => (
                                  <span key={item} className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-[10px] border border-border/70 bg-background/80 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.knowledgeJobs}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                        queued:{governanceSummary.knowledgeSaveJobStatusCounts.queued}
                      </span>
                      <span className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                        running:{governanceSummary.knowledgeSaveJobStatusCounts.running}
                      </span>
                      <span className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                        succeeded:{governanceSummary.knowledgeSaveJobStatusCounts.succeeded}
                      </span>
                      <span className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                        failed:{governanceSummary.knowledgeSaveJobStatusCounts.failed}
                      </span>
                      <span className="dashboard-chip rounded-[4px] px-2.5 py-1 text-xs text-foreground/85">
                        rejected:{governanceSummary.knowledgeSaveJobStatusCounts.rejected}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {detail.run.knowledgeSaveJobs.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{copy.none}</div>
                      ) : (
                        detail.run.knowledgeSaveJobs.map((job) => (
                          <div key={job.id} className="rounded-[8px] border border-border/70 bg-card/60 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-foreground">
                                #{job.id} · {job.targetType}
                              </div>
                              <Badge className={cn("rounded-[6px] border px-3 py-1 text-xs font-medium", getStatusTone(job.status))}>
                                {getStatusLabel(locale, job.status)}
                              </Badge>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              {(typeof job.requestPayload?.artifactTitle === "string" && job.requestPayload.artifactTitle) || copy.none}
                            </div>
                            {job.status === "queued" &&
                            job.requestPayload?.manualConfirmationRequired === true &&
                            typeof job.requestPayload?.datasetId === "number" ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => resolveKnowledgeSaveJob(job.id, "approve")}
                                  disabled={knowledgeJobAction?.jobId === job.id}
                                  className="dashboard-button-primary"
                                >
                                  {copy.approveKnowledgeJob}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resolveKnowledgeSaveJob(job.id, "reject")}
                                  disabled={knowledgeJobAction?.jobId === job.id}
                                  className="dashboard-button-secondary"
                                >
                                  {copy.rejectKnowledgeJob}
                                </Button>
                              </div>
                            ) : null}
                            {job.errorMessage ? (
                              <div className="mt-2 text-xs text-red-600">{job.errorMessage}</div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>

              <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="dashboard-kicker text-muted-foreground">{copy.payload}</div>
                <div className="mt-3 space-y-3">
                  <div className="rounded-[10px] border border-border/70 bg-background/80 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Input</div>
                    <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground/80">
                      {detail.run.inputPayload ? JSON.stringify(detail.run.inputPayload, null, 2) : copy.none}
                    </pre>
                  </div>
                  <div className="rounded-[10px] border border-border/70 bg-background/80 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Normalized result</div>
                    <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground/80">
                      {detail.run.normalizedResult ? JSON.stringify(detail.run.normalizedResult, null, 2) : copy.none}
                    </pre>
                  </div>
                </div>
              </article>

              <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="dashboard-kicker text-muted-foreground">{copy.outputs}</div>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.artifact}</div>
                    <div className="mt-2 space-y-2">
                      {detail.run.artifacts.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{copy.none}</div>
                      ) : (
                        detail.run.artifacts.map((item) => (
                          <div key={item.id} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                            #{item.id} · {item.title} · {item.mimeType || "application/json"}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.workItem}</div>
                    <div className="mt-2 space-y-2">
                      {detail.run.workItems.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{copy.none}</div>
                      ) : (
                        detail.run.workItems.map((item) => (
                          <div key={item.id} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                            #{item.id} · {item.type} · {item.title}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>

              <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="dashboard-kicker text-muted-foreground">{copy.events}</div>
                <div className="mt-4 space-y-3">
                  {detail.run.events.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{copy.none}</div>
                  ) : (
                    detail.run.events.map((event) => (
                      <div key={event.id} className="rounded-[10px] border border-border/70 bg-background/80 p-3">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <span>{event.level}</span>
                          <span>·</span>
                          <span>{formatTimestamp(locale, event.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm text-foreground/85">{event.message}</p>
                        {event.payload ? (
                          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </article>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}
