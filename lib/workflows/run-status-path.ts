export function buildWorkflowRunStatusPath(detailPath: string) {
  return detailPath.includes("?") ? `${detailPath}&mode=status` : `${detailPath}?mode=status`
}
