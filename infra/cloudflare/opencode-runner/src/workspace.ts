import type { AgentRuntimeInput } from "../../../../lib/ai-runtime/contracts"

export type SandboxFileApi = {
  writeFile(path: string, content: string): Promise<unknown>
  exec(command: string, options?: Record<string, unknown>): Promise<unknown>
}

export function getRunDirectory(runId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) throw new Error("run_id_invalid")
  return `/workspace/runs/${runId}`
}

export async function prepareRunWorkspace(sandbox: SandboxFileApi, input: AgentRuntimeInput) {
  const runDir = getRunDirectory(input.runId)
  const promptModule = await import("../../../../lib/ai-runtime/opencode-prompt")
  const promptRuntime = (promptModule as unknown as { default?: typeof promptModule }).default || promptModule
  await sandbox.exec(`mkdir -p ${runDir}/artifacts ${runDir}/tmp`, { cwd: "/workspace" })
  await sandbox.writeFile(`${runDir}/input.json`, JSON.stringify(input))
  await sandbox.writeFile(`${runDir}/system.md`, promptRuntime.buildOpenCodeSystemPrompt(input))
  await sandbox.writeFile(`${runDir}/prompt.md`, promptRuntime.buildOpenCodeUserPrompt(input))
  return runDir
}
