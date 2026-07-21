"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Clock3, Loader2, TriangleAlert } from "lucide-react"

import { WorkspaceTaskEvents } from "@/components/workspace/workspace-message-primitives"
import type { TaskRunPart } from "@/lib/ai-entry/message-parts/types"
import {
  getAiEntryTaskElapsedSeconds,
  isAiEntryTaskHeartbeatStale,
} from "@/lib/ai-entry/task-run-runtime"
import { cn } from "@/lib/utils"

function formatUpdatedAt(updatedAt: number, isZh: boolean) {
  try {
    return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(updatedAt * 1000))
  } catch {
    return ""
  }
}

function formatElapsedSeconds(elapsedSeconds: number, isZh: boolean) {
  if (elapsedSeconds < 60) {
    return isZh ? `${elapsedSeconds} 秒` : `${elapsedSeconds}s`
  }

  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60

  if (hours > 0) {
    return isZh
      ? `${hours} 小时 ${minutes} 分`
      : `${hours}h ${minutes}m`
  }

  if (minutes > 0 && seconds > 0) {
    return isZh ? `${minutes} 分 ${seconds} 秒` : `${minutes}m ${seconds}s`
  }

  return isZh ? `${minutes} 分钟` : `${minutes}m`
}

export function TaskRunPartView({ part, isZh }: { part: TaskRunPart; isZh: boolean }) {
  const { taskRun } = part
  const isOpenCodeTask = taskRun.task_type === "opencode_agent_run"
  const [nowMs, setNowMs] = useState(() => Date.now())
  const percent =
    taskRun.status === "success"
      ? 100
      : Math.max(
          0,
          Math.min(100, Math.round((taskRun.progress_current / Math.max(1, taskRun.progress_total)) * 100)),
        )
  const isRunning = taskRun.status === "pending" || taskRun.status === "running"
  const isHeartbeatStale = isAiEntryTaskHeartbeatStale(taskRun, nowMs)
  const elapsedLabel = formatElapsedSeconds(
    getAiEntryTaskElapsedSeconds(taskRun, nowMs),
    isZh,
  )
  const statusLabel =
    taskRun.status === "pending"
      ? isZh
        ? "排队中"
        : "Queued"
      : taskRun.status === "success"
      ? isZh
        ? "已完成"
        : "Completed"
      : taskRun.status === "failed"
        ? isZh
          ? "失败"
          : "Failed"
        : isZh
          ? "进行中"
          : "Running"

  useEffect(() => {
    if (!isRunning) return

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 30_000)

    return () => window.clearInterval(intervalId)
  }, [isRunning])

  return (
    <div className="rounded-[12px] border border-border bg-background/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {taskRun.status === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : taskRun.status === "failed" ? (
              <TriangleAlert className="h-4 w-4 text-destructive" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
            <span className="truncate">
              {isOpenCodeTask
                ? isZh
                  ? "智能体任务"
                  : "Agent task"
                : isZh
                  ? "PPT 预览任务"
                  : "PPT preview task"}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {taskRun.stage_label}
            {taskRun.request_label ? <span className="ml-1">· {taskRun.request_label}</span> : null}
          </div>
        </div>
        <div
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px]",
            taskRun.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : taskRun.status === "failed"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-primary/20 bg-primary/5 text-primary",
          )}
        >
          {statusLabel}
        </div>
      </div>

      <div className="mt-3 rounded-[10px] border border-border/70 bg-muted/20 p-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">
            {taskRun.progress_current}/{taskRun.progress_total}
            <span className="ml-2">
              {isZh ? "耗时" : "Elapsed"} {elapsedLabel}
            </span>
          </span>
          <span className="shrink-0">{formatUpdatedAt(taskRun.updated_at, isZh)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              taskRun.status === "failed" ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${taskRun.status === "failed" ? 100 : percent}%` }}
          />
        </div>
        {taskRun.error ? (
          <div className="mt-2 text-[11px] text-destructive">{taskRun.error}</div>
        ) : null}
        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          <div>{`${isZh ? "任务 ID" : "Task ID"}: ${taskRun.task_id}`}</div>
          {taskRun.selected_template_id ? (
            <div>
              {`${isZh ? "本次已采用模板" : "Selected template for this run"}: ${
                taskRun.selected_template_label || taskRun.selected_template_id
              } (${taskRun.selected_template_id})`}
            </div>
          ) : null}
        </div>
        {taskRun.preview_session_id ? (
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            <span className="truncate">{`session ${taskRun.preview_session_id}`}</span>
          </div>
        ) : null}
        {isHeartbeatStale ? (
          <div className="mt-2 text-[11px] text-amber-700">
            {isZh ? "耗时较长，仍在处理中" : "This is taking longer than usual, but it is still processing."}
          </div>
        ) : null}
      </div>

      {taskRun.events.length > 0 ? (
        <WorkspaceTaskEvents events={taskRun.events} limit={3} className="mt-3 pl-0" />
      ) : null}

      {isRunning ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {isZh ? "刷新页面后会自动恢复这个任务的进度。" : "This task will recover automatically after refresh."}
        </div>
      ) : null}
    </div>
  )
}
