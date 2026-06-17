import { WorkspaceCapabilitiesMediaWorkspace } from "@/components/platform/workspace-capabilities-media-workspace"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import {
  getPlatformArtifactPreviewKind,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import {
  getCapabilityMediaWorkspaceFeatures,
  type CapabilityMediaWorkspaceFeatureId,
} from "@/lib/platform/capabilities-media-workspace"
import { listPlatformCapabilityExecutionStates } from "@/lib/platform/execution"
import { listPlatformArtifactsForEnterprise } from "@/lib/platform/task-run-store"

function normalizeInitialFeatureId(value: string | string[] | undefined): CapabilityMediaWorkspaceFeatureId | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === "ai-video") return "text-to-video"
  if (
    raw === "ai-music" ||
    raw === "voice-clone" ||
    raw === "voice-synthesis" ||
    raw === "text-to-video" ||
    raw === "image-to-video" ||
    raw === "digital-human" ||
    raw === "video-enhance"
  ) {
    return raw
  }
  return null
}

export default async function DashboardCapabilitiesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const resolvedSearchParams = (await searchParams) || {}
  const currentUser = await getServerSessionUser().catch(() => null)
  const mediaWorkspace = getCapabilityMediaWorkspaceFeatures(displayLocale)
  const artifacts =
    currentUser?.enterpriseId != null
      ? await listPlatformArtifactsForEnterprise(currentUser.enterpriseId)
      : []
  const executionMap = new Map(
    (await listPlatformCapabilityExecutionStates(locale, currentUser)).map((item) => [item.capabilitySlug, item] as const),
  )

  return (
    <WorkspaceCapabilitiesMediaWorkspace
        locale={displayLocale}
        groups={mediaWorkspace.groups}
        features={mediaWorkspace.features}
        capabilityStates={{
          "ai-video": executionMap.get("ai-video")
            ? {
                runtimeStatus: executionMap.get("ai-video")!.runtimeStatus,
                accessState: executionMap.get("ai-video")!.accessState,
                title: executionMap.get("ai-video")!.title,
                summary: executionMap.get("ai-video")!.summary,
              }
            : null,
          "ai-music": executionMap.get("ai-music")
            ? {
                runtimeStatus: executionMap.get("ai-music")!.runtimeStatus,
                accessState: executionMap.get("ai-music")!.accessState,
                title: executionMap.get("ai-music")!.title,
                summary: executionMap.get("ai-music")!.summary,
              }
            : null,
        }}
        assetOptions={artifacts.map((artifact) => ({
          id: artifact.id,
          title: artifact.title,
          previewKind: getPlatformArtifactPreviewKind(artifact),
          sourceUrl: resolvePlatformArtifactSourceUrl(artifact),
        }))}
        initialFeatureId={normalizeInitialFeatureId(resolvedSearchParams.feature)}
      />
  )
}
