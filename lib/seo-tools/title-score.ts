export type SeoTitleRuleScore = {
  total: number
  keyword: number
  length: number
  width: number
  uniqueness: number
  characterCount: number
  estimatedPixelWidth: number
  keywordPosition: "start" | "included" | "missing"
  duplicateRatio: number
  notes: string[]
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
}

function isCjk(character: string) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(character)
}

export function estimateSeoTitlePixelWidth(title: string) {
  return Array.from(title).reduce((width, character) => {
    if (isCjk(character)) return width + 14
    if (/\s/u.test(character)) return width + 4
    if (/[A-Z]/u.test(character)) return width + 8.5
    if (/[a-z0-9]/iu.test(character)) return width + 7.2
    return width + 6.5
  }, 0)
}

function titleTokens(title: string) {
  const normalized = normalize(title)
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || []
  const cjkBigrams = Array.from(normalized)
    .filter(isCjk)
    .reduce<string[]>((tokens, character, index, characters) => {
      const next = characters[index + 1]
      if (next && isCjk(next)) tokens.push(`${character}${next}`)
      return tokens
    }, [])
  return new Set([...words, ...cjkBigrams])
}

function calculateDuplicateRatio(title: string, candidates: string[]) {
  const source = titleTokens(title)
  if (source.size === 0) return 0

  let highestRatio = 0
  for (const candidate of candidates) {
    if (candidate === title) continue
    const target = titleTokens(candidate)
    if (target.size === 0) continue
    let intersections = 0
    for (const token of source) {
      if (target.has(token)) intersections += 1
    }
    highestRatio = Math.max(highestRatio, intersections / new Set([...source, ...target]).size)
  }
  return Math.round(highestRatio * 100) / 100
}

export function scoreSeoTitle(input: {
  title: string
  keyword: string
  candidates?: string[]
  language?: "zh-CN" | "en-US"
}): SeoTitleRuleScore {
  const title = input.title.trim()
  const normalizedTitle = normalize(title)
  const normalizedKeyword = normalize(input.keyword)
  const characterCount = Array.from(title).length
  const estimatedPixelWidth = Math.round(estimateSeoTitlePixelWidth(title))
  const duplicateRatio = calculateDuplicateRatio(title, input.candidates || [])
  const keywordPosition = !normalizedKeyword || !normalizedTitle.includes(normalizedKeyword)
    ? "missing"
    : normalizedTitle.startsWith(normalizedKeyword)
      ? "start"
      : "included"
  const keyword = keywordPosition === "start" ? 28 : keywordPosition === "included" ? 22 : 0
  const length = characterCount >= 24 && characterCount <= 68 ? 24 : characterCount >= 16 && characterCount <= 80 ? 17 : 8
  const width = estimatedPixelWidth <= 580 ? 24 : estimatedPixelWidth <= 660 ? 14 : 4
  const uniqueness = duplicateRatio <= 0.35 ? 24 : duplicateRatio <= 0.55 ? 15 : 6
  const isChinese = input.language === "zh-CN"
  const notes = [
    keywordPosition === "start"
      ? isChinese ? "关键词位于标题开头。" : "The keyword appears at the beginning of the title."
      : keywordPosition === "included"
        ? isChinese ? "标题自然包含关键词。" : "The title includes the keyword naturally."
        : isChinese ? "标题未包含完整关键词。" : "The title does not include the full keyword.",
    estimatedPixelWidth <= 580
      ? isChinese ? "预计可见宽度处于常见搜索结果范围内。" : "The estimated visible width fits a common search-result range."
      : isChinese ? "预计搜索结果中可能被截断。" : "The title may be truncated in search results.",
    duplicateRatio <= 0.35
      ? isChinese ? "与本次其他候选的表达重叠较低。" : "It has low phrasing overlap with the other candidates in this report."
      : isChinese ? "与本次其他候选表达较接近，建议保留更差异化的角度。" : "It is close to other candidate phrasing; retain a more distinct angle.",
  ]

  return {
    total: keyword + length + width + uniqueness,
    keyword,
    length,
    width,
    uniqueness,
    characterCount,
    estimatedPixelWidth,
    keywordPosition,
    duplicateRatio,
    notes,
  }
}
