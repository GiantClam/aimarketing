export type AssetLibraryTab = "all" | "recent" | "documents";

export type AssetLibraryFilterItem = {
  readonly relative_path: string;
  readonly mime_type: string;
  readonly created_at: string;
};

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DOCUMENT_MIME_TYPE = /text|json|pdf|word|markdown|presentation|spreadsheet/iu;

export function filterAssetLibraryItems<T extends AssetLibraryFilterItem>(items: readonly T[], tab: AssetLibraryTab, query: string, now = Date.now()): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesQuery = !normalizedQuery || `${item.relative_path} ${item.mime_type}`.toLowerCase().includes(normalizedQuery);
    const matchesTab = tab === "all"
      || (tab === "documents"
        ? DOCUMENT_MIME_TYPE.test(item.mime_type)
        : now - new Date(item.created_at).getTime() < RECENT_WINDOW_MS);
    return matchesQuery && matchesTab;
  });
}
