export type RuntimeArtifactManifestRecord = {
  path: string
  title?: string
  kind?: string
}

function baseName(value: string) {
  return value.replaceAll("\\", "/").split("/").at(-1) || value
}

export function displayArtifactName(value: string) {
  return baseName(value).replace(/^\d+-/u, "")
}

export function normalizedArtifactName(value: string) {
  return displayArtifactName(value).trim().toLowerCase()
}

export function isInternalPptxName(value: string) {
  return normalizedArtifactName(value) === "result.pptx"
}

export function selectPublishableArtifactRecords(records: RuntimeArtifactManifestRecord[], isPptMaster: boolean) {
  const hasNamedPptx = isPptMaster && records.some((record) => {
    const name = record.title || record.path
    return normalizedArtifactName(name).endsWith(".pptx") && !isInternalPptxName(name)
  })
  const selected = new Map<string, RuntimeArtifactManifestRecord>()
  for (const record of records) {
    const name = record.title || record.path
    if (hasNamedPptx && isInternalPptxName(name)) continue
    const key = normalizedArtifactName(name)
    if (!key) continue
    const previous = selected.get(key)
    if (!previous || isInternalPptxName(previous.title || previous.path)) selected.set(key, record)
  }
  return [...selected.values()]
}
