import type { AgentRuntimeInputV2, RuntimeCheckpointRef } from "../../../../lib/ai-runtime/contracts"
import { buildOpenCodeSystemPrompt, buildOpenCodeUserPrompt } from "../../../../lib/ai-runtime/opencode-prompt"
import { ensureSharedSkillSet, type SharedSkillBundleBucket } from "./shared-agent-skill-loader"

type SessionSandbox = {
  exec(command: string, options?: Record<string, unknown>): Promise<{ success?: boolean; stderr?: string }>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>
  writeFile(path: string, content: string): Promise<unknown>
  createBackup(options: { dir: string; name?: string; ttl?: number; localBucket?: boolean; excludes?: string[] }): Promise<{ id: string; dir: string; localBucket?: boolean }>
  restoreBackup(backup: { id: string; dir: string; localBucket?: boolean }): Promise<{ success: boolean; dir: string; id: string }>
}

export function getSessionDirectory(sessionKey: string) {
  if (!/^sess-[0-9a-f]{40}$/.test(sessionKey)) throw new Error("session_key_invalid")
  return `/workspace/sessions/${sessionKey}`
}

export type PreparedSessionWorkspace = {
  sessionDir: string
  sharedSkillSet?: {
    cacheHit: boolean
    r2Read: boolean
  }
}

export async function prepareSessionWorkspace(sandbox: SessionSandbox, input: AgentRuntimeInputV2, checkpoint: RuntimeCheckpointRef | null, sharedSkillBucket?: SharedSkillBundleBucket) {
  const sessionDir = getSessionDirectory(input.sessionKey)
  if (checkpoint?.backupId) {
    try {
      const restored = await sandbox.restoreBackup({
        id: checkpoint.backupId,
        dir: checkpoint.backupDir || sessionDir,
        localBucket: checkpoint.resumePayload.localBucket === true,
      })
      if (!restored.success) throw new Error("runtime_workspace_restore_failed")
    } catch {
      // A sleeping Sandbox has no durable disk. Discard a partial restore and
      // recreate the current session from the control-plane bundle below.
      const cleared = await sandbox.exec(`rm -rf ${JSON.stringify(sessionDir)}`)
      if (cleared.success === false) throw new Error(cleared.stderr || "runtime_workspace_recovery_clear_failed")
    }
  }
  await sandbox.mkdir(`${sessionDir}/input`, { recursive: true })
  await sandbox.mkdir(`${sessionDir}/project`, { recursive: true })
  await sandbox.mkdir(`${sessionDir}/final`, { recursive: true })
  await sandbox.mkdir(`${sessionDir}/runtime-home`, { recursive: true })
  await sandbox.mkdir(`${sessionDir}/turns/${input.runId}`, { recursive: true })
  let sharedSkillSet: PreparedSessionWorkspace["sharedSkillSet"]
  if (input.sharedSkillSetSelection) {
    if (!sharedSkillBucket) throw new Error("shared_skill_bundle_bucket_unavailable")
    sharedSkillSet = await ensureSharedSkillSet({ sandbox, bucket: sharedSkillBucket, sessionDir, selection: input.sharedSkillSetSelection, enterpriseId: input.enterpriseId })
  } else {
    // Generic Chat sessions do not require a governed shared-Agent bundle.
    // The optional image-baked runtime bundle is copied when present, but a
    // minimal container may intentionally omit those directories.
    const skillsDir = JSON.stringify(`${sessionDir}/.opencode/skills`)
    const agentsDir = JSON.stringify(`${sessionDir}/.opencode/agents`)
    const bundle = await sandbox.exec(`mkdir -p ${skillsDir} ${agentsDir} && if [ -d /workspace/runtime/skills ]; then cp -R /workspace/runtime/skills/. ${skillsDir}/; fi && if [ -d /workspace/runtime/agents ]; then cp -R /workspace/runtime/agents/. ${agentsDir}/; fi`)
    if (bundle.success === false) throw new Error(bundle.stderr || "opencode_runtime_bundle_install_failed")
  }
  await sandbox.writeFile(`${sessionDir}/turns/${input.runId}/input.json`, JSON.stringify(input))
  await sandbox.writeFile(`${sessionDir}/turns/${input.runId}/system.md`, buildOpenCodeSystemPrompt(input))
  // Cloudflare Dashi turns use the CLI continuation path, which cannot be
  // relied on to restore the application conversation after a container
  // sleep/restore. Keep the system prompt separate, but provide the ordered
  // history in the native user prompt so follow-up turns retain their brief.
  await sandbox.writeFile(`${sessionDir}/turns/${input.runId}/prompt.md`, buildOpenCodeUserPrompt(input, { includeConversationHistory: true }))
  return { sessionDir, ...(sharedSkillSet ? { sharedSkillSet } : {}) }
}

export async function createSessionWorkspaceBackup(sandbox: SessionSandbox, sessionDir: string, options: { localBucket: boolean; runId: string }) {
  return sandbox.createBackup({
    dir: sessionDir,
    name: `opencode-session-${options.runId}`,
    ttl: 7 * 24 * 60 * 60,
    localBucket: options.localBucket,
    excludes: ["turns/*/input.json", ".opencode/skills", ".opencode/agents", ".platform/shared-skill-cache", ".platform/shared-skill-active-id"],
  })
}
