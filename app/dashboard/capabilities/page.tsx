import { WorkspaceCapabilitiesMediaWorkspace } from "@/components/platform/workspace-capabilities-media-workspace"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import {
  getCapabilityMediaWorkspaceFeatures,
  type CapabilityMediaWorkspaceFeatureId,
} from "@/lib/platform/capabilities-media-workspace"
import { listPlatformCapabilityExecutionStates } from "@/lib/platform/execution"

function normalizeInitialFeatureId(value: string | string[] | undefined): CapabilityMediaWorkspaceFeatureId | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (
    raw === "ai-music" ||
    raw === "voice-clone" ||
    raw === "voice-synthesis" ||
    raw === "ai-video" ||
    raw === "face-fusion" ||
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
  const executionMap = new Map(
    (await listPlatformCapabilityExecutionStates(locale, currentUser)).map((item) => [item.capabilitySlug, item] as const),
  )

  return (
    <>
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
        initialFeatureId={normalizeInitialFeatureId(resolvedSearchParams.feature)}
      />
    </>
  )
}
