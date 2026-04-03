import {
  buildSoulCardInput,
  type WriterAcceptedSample,
  type WriterMemoryItem,
  type WriterSoulCard,
  type WriterSoulProfile,
} from "@/lib/writer/memory/types"

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function pickTone(profile: WriterSoulProfile | null, memories: WriterMemoryItem[]) {
  if (profile?.tone?.trim()) return profile.tone.trim()
  const feedback = memories.find((item) => item.type === "feedback")
  if (feedback?.content?.trim()) {
    return feedback.content.trim().slice(0, 60)
  }
  return "adaptive"
}

function pickSentenceStyle(profile: WriterSoulProfile | null, memories: WriterMemoryItem[]) {
  if (profile?.sentenceStyle?.trim()) return profile.sentenceStyle.trim()
  const styleHint = memories.find((item) => /短句|长句|节奏|结构|句式/iu.test(item.content))
  if (styleHint?.content?.trim()) return styleHint.content.trim().slice(0, 60)
  return "clear and concise"
}

function mergeTaboos(profile: WriterSoulProfile | null, memories: WriterMemoryItem[]) {
  const seeds = [
    ...(profile?.tabooList || []),
    ...memories
      .filter((item) => item.type === "feedback")
      .flatMap((item) => {
        const matches = item.content.match(/(?:避免|不要|禁用)[:：]?\s*([^，。；\n]+)/gu)
        return matches || []
      })
      .map((text) => text.replace(/^(?:避免|不要|禁用)[:：]?\s*/u, "").trim()),
  ]
  return [...new Set(seeds.filter(Boolean))].slice(0, 10)
}

function mergeLexicalHints(profile: WriterSoulProfile | null, memories: WriterMemoryItem[], samples: WriterAcceptedSample[]) {
  const fromTitles = memories.map((item) => item.title.trim()).filter(Boolean)
  const fromSamples = samples
    .flatMap((sample) => sample.content.split(/[\s,，。；;、]+/u))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 12)
    .slice(0, 12)
  const merged = [...(profile?.lexicalHints || []), ...fromTitles, ...fromSamples]
  return [...new Set(merged.filter(Boolean))].slice(0, 12)
}

function estimateConfidence(
  profile: WriterSoulProfile | null,
  memories: WriterMemoryItem[],
  samples: WriterAcceptedSample[],
) {
  const profileScore = profile ? clamp(profile.confidence) * 0.6 : 0
  const memoryAvg =
    memories.length > 0 ? memories.reduce((sum, item) => sum + clamp(item.confidence), 0) / memories.length : 0
  const memoryScore = memoryAvg * 0.3
  const sampleScore = Math.min(samples.length, 3) / 3 * 0.1
  return clamp(profileScore + memoryScore + sampleScore)
}

export function composeWriterSoulCard(input: {
  agentType: WriterSoulCard["agentType"]
  profile: WriterSoulProfile | null
  memories: WriterMemoryItem[]
  recentAcceptedSamples: WriterAcceptedSample[]
}): WriterSoulCard {
  return buildSoulCardInput({
    agentType: input.agentType,
    tone: pickTone(input.profile, input.memories),
    sentenceStyle: pickSentenceStyle(input.profile, input.memories),
    tabooList: mergeTaboos(input.profile, input.memories),
    lexicalHints: mergeLexicalHints(input.profile, input.memories, input.recentAcceptedSamples),
    confidence: estimateConfidence(input.profile, input.memories, input.recentAcceptedSamples),
    generatedAt: Date.now(),
  })
}

export function renderSoulCardForPrompt(soulCard: WriterSoulCard, maxChars = 1200) {
  const lines = [
    "Soul Card:",
    `- Tone: ${soulCard.tone || "adaptive"}`,
    `- Sentence style: ${soulCard.sentenceStyle || "clear and concise"}`,
    `- Prefer: ${(soulCard.lexicalHints || []).slice(0, 8).join(" | ") || "none"}`,
    `- Avoid: ${(soulCard.tabooList || []).slice(0, 8).join(" | ") || "none"}`,
    `- Confidence: ${soulCard.confidence.toFixed(2)}`,
  ]

  const text = lines.join("\n")
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`
}

