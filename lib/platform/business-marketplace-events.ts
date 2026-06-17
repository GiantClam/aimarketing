export const BUSINESS_MARKETPLACE_SELECTION_UPDATED_EVENT = "aimarketing:business-marketplace-selection-updated"

export function dispatchBusinessMarketplaceSelectionUpdated() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(BUSINESS_MARKETPLACE_SELECTION_UPDATED_EVENT))
}
