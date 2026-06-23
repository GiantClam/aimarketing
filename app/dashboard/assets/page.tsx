import { WorkspaceAssetLibrary } from "@/components/platform/workspace-asset-library"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { listEnterpriseUnifiedAssetLibraryItems } from "@/lib/platform/assets"

export default async function AssetsPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const artifacts =
    currentUser?.enterpriseId != null
      ? await listEnterpriseUnifiedAssetLibraryItems(currentUser.enterpriseId)
      : []

  return <WorkspaceAssetLibrary locale={displayLocale} artifacts={artifacts} />
}
