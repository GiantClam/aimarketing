import type { ImageAssistantTaskType } from "@/lib/image-assistant/types"

function normalizeIntentText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function looksLikeReferenceUpscaleIntent(prompt: string) {
  const normalized = normalizeIntentText(prompt)
  if (!normalized) return false

  const zhUpscaleKeywordPattern =
    /(?:\u9ad8\u6e05\u5316|\u8d85\u6e05\u5316|\u53d8\u6e05\u6670|\u66f4\u6e05\u6670|\u63d0\u9ad8\u6e05\u6670\u5ea6|\u63d0\u5347\u6e05\u6670\u5ea6|\u63d0\u9ad8\u5206\u8fa8\u7387|\u63d0\u5347\u5206\u8fa8\u7387|\u65e0\u635f\u653e\u5927|\u9ad8\u6e05\u4fee\u590d|\u8d85\u6e05\u4fee\u590d|\u753b\u8d28\u4fee\u590d|\u63d0\u5347\u753b\u8d28|\u589e\u5f3a\u7ec6\u8282|\u7ec6\u8282\u589e\u5f3a|\u9510\u5316(?:\u4e00\u4e0b)?|\u53d8\u9ad8\u6e05|\u505a\u6210\u9ad8\u6e05)/u
  const zhUpscaleTargetPattern =
    /(?:\u63d0(?:\u9ad8|\u5347)|\u8c03(?:\u9ad8|\u5230)|\u62c9\u5230|\u53d8\u6210|\u53d8\u4e3a).{0,6}(?:\d+(?:\.\d+)?\s*[kK]|\d+\s*[pP]|\u9ad8\u5206\u8fa8\u7387|\u9ad8\u6e05).{0,6}(?:\u6e05\u6670\u5ea6|\u5206\u8fa8\u7387|\u753b\u8d28)?/u
  const zhUpscaleResolutionPattern =
    /(?:\d+(?:\.\d+)?\s*[kK]|\d+\s*[pP]).{0,6}(?:\u6e05\u6670\u5ea6|\u5206\u8fa8\u7387|\u753b\u8d28)/u
  const enUpscalePattern =
    /\b(upscale|enhance(?:\s+this\s+image)?|sharpen|improve\s+(?:the\s+)?(?:resolution|quality|clarity|details)|increase\s+(?:the\s+)?resolution|high(?:er)?\s+resolution|super[-\s]?resolution)\b/i

  return (
    zhUpscaleKeywordPattern.test(normalized) ||
    zhUpscaleTargetPattern.test(normalized) ||
    zhUpscaleResolutionPattern.test(normalized) ||
    enUpscalePattern.test(normalized)
  )
}

export function looksLikeReferenceEditIntent(input: {
  prompt: string
  taskType?: ImageAssistantTaskType | "generate" | "edit" | null
  referenceCount?: number
}) {
  if (typeof input.referenceCount === "number" && input.referenceCount <= 0) {
    return false
  }
  if (input.taskType === "generate") {
    return false
  }

  const prompt = normalizeIntentText(input.prompt)
  if (!prompt) return false

  const zhEditActionPattern =
    /(?:\u5220\u9664|\u5220\u6389|\u53bb\u6389|\u53bb\u9664|\u79fb\u9664|\u64e6\u6389|\u62b9\u6389|\u6d88\u9664|\u62ff\u6389|\u4fee\u6389|\u4fee\u9664|\u6539\u6210|\u6539\u4e3a|\u53d8\u6210|\u53d8\u4e3a|\u6362\u6210|\u6362\u4e3a|\u66ff\u6362|\u4fdd\u7559|\u53ea\u4fee\u6539|\u5c40\u90e8\u4fee\u6539|\u5c40\u90e8\u7f16\u8f91|\u53bb\u773c\u955c|\u6458\u6389|\u53bb\u6c34\u5370|\u53bb\u7455\u75b5|\u78e8\u76ae|\u4fee\u56fe|\u7cbe\u4fee|\u6362\u989c\u8272|\u6539\u989c\u8272|\u6539\u8272|\u53d8\u7ea2|\u53d8\u84dd|\u53d8\u7eff|\u8c03\u6210|\u8c03\u4e3a)/u
  const zhEditSentencePattern =
    /(?:\u628a|\u5c06).{0,24}(?:\u6539\u6210|\u6539\u4e3a|\u6362\u6210|\u6362\u4e3a|\u53d8\u6210|\u53d8\u4e3a|\u66ff\u6362\u4e3a|\u5220\u9664|\u53bb\u6389|\u53bb\u9664|\u79fb\u9664|\u4fdd\u7559).{0,40}/u
  const enEditActionPattern =
    /\b(remove|delete|erase|retouch|edit out|clean up|replace|swap|change|fix|touch up|take off|keep)\b/i

  return (
    zhEditActionPattern.test(prompt) ||
    zhEditSentencePattern.test(prompt) ||
    enEditActionPattern.test(prompt) ||
    looksLikeReferenceUpscaleIntent(prompt)
  )
}
