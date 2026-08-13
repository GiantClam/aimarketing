import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

export type CandidateKind = "system" | "private" | "desktop-gui"

export type OpenCodeCandidate = {
  kind: CandidateKind
  path: string
  runnable?: boolean
  reason?: string
}

export function classifyCandidatePath(candidatePath: string): CandidateKind {
  const normalized = candidatePath.replaceAll("/", "\\").toLowerCase()
  if (normalized.includes("@opencode-aidesktop") || normalized.endsWith("\\opencode.app")) return "desktop-gui"
  if (normalized.includes("\\.private\\") || normalized.includes("\\private-opencode")) return "private"
  return "system"
}

export function deduplicateCandidates(candidates: OpenCodeCandidate[]) {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = path.resolve(candidate.path).replaceAll("/", "\\").toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function existingCandidate(candidatePath: string | undefined, kind?: CandidateKind): OpenCodeCandidate | null {
  if (!candidatePath || !existsSync(candidatePath)) return null
  const candidateKind = kind ?? classifyCandidatePath(candidatePath)
  return {
    kind: candidateKind,
    path: path.resolve(candidatePath),
    runnable: candidateKind !== "desktop-gui",
    ...(candidateKind === "desktop-gui" ? { reason: "desktop_bundle_has_no_supported_serve_cli_contract" } : {}),
  }
}

export function discoverOpenCodeCandidates(spikeDirectory: string, privateVersion = "1.18.14") {
  const candidates: OpenCodeCandidate[] = []
  const explicitSystem = existingCandidate(process.env.OPENCODE_SYSTEM_PATH, "system")
  const explicitPrivate = existingCandidate(process.env.OPENCODE_PRIVATE_PATH, "private")
  if (explicitSystem) candidates.push(explicitSystem)
  if (explicitPrivate) candidates.push(explicitPrivate)

  const programFiles = process.env.ProgramFiles
  if (programFiles) {
    const globalBinary = existingCandidate(path.join(programFiles, "nodejs", "node_modules", "opencode-ai", "bin", "opencode.exe"), "system")
    if (globalBinary) candidates.push(globalBinary)
  }

  const privateBinary = existingCandidate(
    path.join(spikeDirectory, ".private", `opencode-${privateVersion}`, "node_modules", "opencode-ai", "bin", "opencode.exe"),
    "private",
  )
  if (privateBinary) candidates.push(privateBinary)

  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const desktopBinary = existingCandidate(path.join(localAppData, "Programs", "@opencode-aidesktop", "OpenCode.exe"), "desktop-gui")
    if (desktopBinary) candidates.push(desktopBinary)
  }

  try {
    const paths = execFileSync("where.exe", ["opencode"], { encoding: "utf8", windowsHide: true })
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter((value) => value.toLowerCase().endsWith(".exe"))
    for (const candidatePath of paths) {
      const candidate = existingCandidate(candidatePath)
      if (candidate) candidates.push(candidate)
    }
  } catch {
    // PATH lookup is advisory; explicit and conventional candidates remain usable.
  }

  return deduplicateCandidates(candidates)
}
