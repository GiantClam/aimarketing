import { pptFrontendTemplateOptions } from "@/lib/lead-tools/ppt-preview-data-fixed"

const pptWorkerSupportedTemplateIdSet = new Set<string>(pptFrontendTemplateOptions.map((option) => option.id))

export function getPptWorkerSupportedTemplateIds() {
  return pptFrontendTemplateOptions.map((option) => option.id)
}

export function isPptWorkerTemplateSupported(templateId: unknown) {
  return typeof templateId === "string" && pptWorkerSupportedTemplateIdSet.has(templateId.trim())
}
