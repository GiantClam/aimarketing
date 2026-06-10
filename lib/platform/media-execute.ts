import type { PlatformExecutionProxyTarget } from "@/lib/platform/execute"
import { getRunningHubConfig, isRunningHubConfiguredForTarget } from "@/lib/platform/runninghub"

type PlatformMediaExecutionAction =
  | "generate"
  | "edit"
  | "export"
  | "workflow-plan"
  | "workflow-keyframes"
  | "workflow-confirm"
  | "workflow-run-clips"
  | "workflow-stitch"
  | "workflow-agent-run"

function buildRunningHubProxyTarget(
  mediaTarget: "ai-image" | "ai-video",
  action: PlatformMediaExecutionAction,
): PlatformExecutionProxyTarget {
  return {
    action,
    downstreamPath: `/api/platform/media/run?target=${encodeURIComponent(mediaTarget)}&action=${encodeURIComponent(action)}`,
    requiresLogin: true,
  }
}

function buildVideoWorkflowTarget(
  action: string,
  workflowAction: "plan" | "keyframes" | "confirm" | "run-clips" | "stitch" | "agent-run",
): PlatformExecutionProxyTarget {
  return {
    action,
    downstreamPath: "/api/video-agent/workflow",
    requiresLogin: true,
    bodyOverrides: {
      action: workflowAction,
    },
  }
}

export function resolvePlatformMediaExecutionProxyTarget(
  mediaTarget: "ai-image" | "ai-video" | "visual-ad-pipeline",
  action: string,
  runningHubConfig = getRunningHubConfig(),
): PlatformExecutionProxyTarget | null {
  if (mediaTarget === "ai-image") {
    if (isRunningHubConfiguredForTarget("ai-image", runningHubConfig)) {
      if (action === "execute" || action === "generate" || action === "generate-image") {
        return buildRunningHubProxyTarget("ai-image", "generate")
      }
      if (action === "edit" || action === "edit-image") {
        return buildRunningHubProxyTarget("ai-image", "edit")
      }
      if (action === "export" || action === "export-image") {
        return buildRunningHubProxyTarget("ai-image", "export")
      }
      return null
    }

    if (action === "execute" || action === "generate" || action === "generate-image") {
      return {
        action: "generate",
        downstreamPath: "/api/image-assistant/generate",
        requiresLogin: true,
      }
    }
    if (action === "edit" || action === "edit-image") {
      return {
        action,
        downstreamPath: "/api/image-assistant/edit",
        requiresLogin: true,
      }
    }
    if (action === "export" || action === "export-image") {
      return {
        action,
        downstreamPath: "/api/image-assistant/export",
        requiresLogin: true,
      }
    }
    return null
  }

  if (mediaTarget === "ai-video") {
    if (isRunningHubConfiguredForTarget("ai-video", runningHubConfig)) {
      if (action === "execute" || action === "generate" || action === "workflow" || action === "workflow-plan") {
        return buildRunningHubProxyTarget("ai-video", action === "generate" ? "generate" : "workflow-plan")
      }
      if (action === "workflow-keyframes") {
        return buildRunningHubProxyTarget("ai-video", "workflow-keyframes")
      }
      if (action === "workflow-confirm") {
        return buildRunningHubProxyTarget("ai-video", "workflow-confirm")
      }
      if (action === "workflow-run-clips") {
        return buildRunningHubProxyTarget("ai-video", "workflow-run-clips")
      }
      if (action === "workflow-stitch") {
        return buildRunningHubProxyTarget("ai-video", "workflow-stitch")
      }
      if (action === "workflow-agent-run") {
        return buildRunningHubProxyTarget("ai-video", "workflow-agent-run")
      }
    }

    if (action === "execute" || action === "generate" || action === "workflow" || action === "workflow-plan") {
      return buildVideoWorkflowTarget("workflow-plan", "plan")
    }
    if (action === "workflow-keyframes") {
      return buildVideoWorkflowTarget(action, "keyframes")
    }
    if (action === "workflow-confirm") {
      return buildVideoWorkflowTarget(action, "confirm")
    }
    if (action === "workflow-run-clips") {
      return buildVideoWorkflowTarget(action, "run-clips")
    }
    if (action === "workflow-stitch") {
      return buildVideoWorkflowTarget(action, "stitch")
    }
    if (action === "workflow-agent-run") {
      return buildVideoWorkflowTarget(action, "agent-run")
    }
    if (action === "chat") {
      return {
        action,
        downstreamPath: "/api/video-agent/chat",
        requiresLogin: true,
      }
    }
    if (action === "agent") {
      return {
        action,
        downstreamPath: "/api/video-agent/agent",
        requiresLogin: true,
      }
    }
    if (action === "jobs") {
      return {
        action,
        downstreamPath: "/api/video-agent/jobs",
        requiresLogin: true,
      }
    }
    if (action === "storyboard-confirm") {
      return {
        action,
        downstreamPath: "/api/video-agent/storyboard/confirm",
        requiresLogin: true,
      }
    }
    if (action === "scene-update") {
      return {
        action,
        downstreamPath: "/api/video-agent/scene/update",
        requiresLogin: true,
      }
    }
    if (action === "scene-regenerate") {
      return {
        action,
        downstreamPath: "/api/video-agent/scene/regenerate",
        requiresLogin: true,
      }
    }
    if (action === "video-clips-confirm") {
      return {
        action,
        downstreamPath: "/api/video-agent/video-clips/confirm",
        requiresLogin: true,
      }
    }
    return null
  }

  if (mediaTarget === "visual-ad-pipeline") {
    if (
      action === "execute" ||
      action === "generate" ||
      action === "generate-image" ||
      action === "edit" ||
      action === "edit-image" ||
      action === "export" ||
      action === "export-image"
    ) {
      return resolvePlatformMediaExecutionProxyTarget(
        "ai-image",
        action === "execute" ? "generate" : action,
        runningHubConfig,
      )
    }

    if (
      action === "workflow" ||
      action === "workflow-plan" ||
      action === "workflow-keyframes" ||
      action === "workflow-confirm" ||
      action === "workflow-run-clips" ||
      action === "workflow-stitch" ||
      action === "workflow-agent-run" ||
      action === "chat" ||
      action === "agent" ||
      action === "jobs" ||
      action === "storyboard-confirm" ||
      action === "scene-update" ||
      action === "scene-regenerate" ||
      action === "video-clips-confirm"
    ) {
      return resolvePlatformMediaExecutionProxyTarget("ai-video", action, runningHubConfig)
    }
    return null
  }

  return null
}
