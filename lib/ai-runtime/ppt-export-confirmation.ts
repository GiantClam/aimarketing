import type { AgentRuntimeInput } from "./contracts"

/**
 * Export intent belongs to the native OpenCode session and selected Skill.
 * The application must not reinterpret user language or discard a PPTX that
 * the Skill deliberately produced.
 *
 * Kept as a compatibility boundary for older runtime callers. A valid PPTX
 * artifact is publishable; the Skill owns the workflow confirmation gate.
 */
export function isPptxExportAuthorized(
  _input: Pick<AgentRuntimeInput, "agentId" | "selectedSkillIds">,
) {
  return true
}
