import type { AgentRuntimeInput } from "./contracts"

const NEGATED_EXPORT_PATTERN = /(?:暂不|不要|无需|不用|不需要|别|取消|拒绝|否决|do\s+not|don't|no\s+need|not\s+yet|cancel|reject)/iu
const CHINESE_CONFIRMATION_PATTERN = /(?:确认|同意|批准|可以)\s*[，,、：:\s]*(?:直接\s*)?(?:继续执行\s*)?(?:导出|下载|生成(?:\s*(?:pptx|ppt|文件))?|执行生成|生成与质量检查)/iu
const ENGLISH_CONFIRMATION_PATTERN = /(?:confirm|approve|approved|yes|go\s+ahead)\b.{0,30}\b(?:export|download|generate|render)\b/iu

/**
 * Only an explicit approval in the current user turn may unlock PPT export.
 * Generic requests such as “生成一个 PPT” intentionally do not match.
 */
export function isExplicitPptExportConfirmation(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : ""
  if (!normalized || NEGATED_EXPORT_PATTERN.test(normalized)) return false
  return CHINESE_CONFIRMATION_PATTERN.test(normalized) || ENGLISH_CONFIRMATION_PATTERN.test(normalized)
}

export function isEditablePptRuntimeInput(input: Pick<AgentRuntimeInput, "agentId" | "selectedSkillIds">) {
  return input.agentId === "executive-ppt" || (input.selectedSkillIds || []).includes("ppt-master")
}

export function shouldRunNativePptxExportFallback(
  input: Pick<AgentRuntimeInput, "agentId" | "selectedSkillIds" | "exportConfirmationGranted">,
) {
  return isEditablePptRuntimeInput(input) && input.exportConfirmationGranted === true
}

export function isPptxExportAuthorized(
  input: Pick<AgentRuntimeInput, "agentId" | "selectedSkillIds" | "exportConfirmationGranted">,
) {
  return !isEditablePptRuntimeInput(input) || input.exportConfirmationGranted === true
}
