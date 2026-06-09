import { WorkspaceAssetLibrary } from "@/components/platform/workspace-asset-library"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import {
  getPlatformArtifactPreviewKind,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import { listPlatformArtifactsForEnterprise } from "@/lib/platform/task-run-store"

export default async function AssetsPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const artifacts =
    currentUser?.enterpriseId != null
      ? await listPlatformArtifactsForEnterprise(currentUser.enterpriseId)
      : []

  return (
    <WorkspaceAssetLibrary
      locale={displayLocale}
      artifacts={artifacts.map((artifact) => ({
        id: artifact.id,
        title: artifact.title,
        kind: artifact.kind,
        mimeType: artifact.mimeType,
        runId: artifact.runId,
        createdAt: artifact.createdAt instanceof Date ? artifact.createdAt.toISOString() : null,
        previewKind: getPlatformArtifactPreviewKind(artifact),
        sourceUrl: resolvePlatformArtifactSourceUrl(artifact),
        previewUrl: `/api/platform/artifacts/${artifact.id}/download`,
        downloadUrl: `/api/platform/artifacts/${artifact.id}/download?download=1`,
      }))}
    />
  )
}
