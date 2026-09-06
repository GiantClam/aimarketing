export function artifactDisplayName(title?: string, relativePath?: string) {
  const value = title?.trim() || relativePath?.trim() || "Artifact";
  return value.split(/[\\/]+/u).filter(Boolean).at(-1) ?? value;
}
