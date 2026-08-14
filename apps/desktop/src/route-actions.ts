/**
 * Resolve the capability that a desktop run must execute.
 *
 * The video route is a shared catalog for video and audio features. Its
 * selected feature is authoritative; using the route-level video default
 * would silently execute the wrong Provider when an audio feature is chosen.
 */
export function resolveDesktopRunAction(path: string, routeAction: string | null, selectedAction: string): string {
  if (path === "/dashboard/video") return selectedAction;
  return routeAction ?? selectedAction;
}
