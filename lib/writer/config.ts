export const WRITER_PLATFORM_ORDER = ["wechat", "xiaohongshu", "x", "facebook"] as const

export type WriterPlatform = (typeof WRITER_PLATFORM_ORDER)[number]
export type WriterMode = "article" | "thread"
export const WRITER_LANGUAGE_ORDER = ["auto", "zh", "en", "ja", "ko", "fr", "de", "es"] as const
export type WriterLanguage = (typeof WRITER_LANGUAGE_ORDER)[number]

export const WRITER_LANGUAGE_CONFIG: Record<
  WriterLanguage,
  {
    value: WriterLanguage
    label: string
    description: string
  }
> = {
  auto: { value: "auto", label: "自动识别", description: "跟随用户提示词中的语言要求" },
  zh: { value: "zh", label: "中文", description: "输出中文内容" },
  en: { value: "en", label: "English", description: "Output English content" },
  ja: { value: "ja", label: "日本語", description: "日本語で出力" },
  ko: { value: "ko", label: "한국어", description: "한국어로 출력" },
  fr: { value: "fr", label: "Français", description: "Sortie en français" },
  de: { value: "de", label: "Deutsch", description: "Ausgabe auf Deutsch" },
  es: { value: "es", label: "Español", description: "Salida en español" },
}

export type WriterPlatformConfig = {
  id: WriterPlatform
  label: string
  shortLabel: string
  description: string
  audience: string
  tone: string
  formatGuidance: string
  wordRange: string
  imageAspectRatio: string
  imageStyle: string
  imageCount: string
  copyHint: string
  supportsThread: boolean
  skillStack: string[]
  toolStack: string[]
  promptKeywords: string[]
}

export const DEFAULT_WRITER_PLATFORM: WriterPlatform = "wechat"
export const DEFAULT_WRITER_MODE: WriterMode = "article"
export const DEFAULT_WRITER_LANGUAGE: WriterLanguage = "auto"

export const WRITER_PLATFORM_CONFIG: Record<WriterPlatform, WriterPlatformConfig> = {
  wechat: {
    id: "wechat",
    label: "公众号文章写手",
    shortLabel: "公众号",
    description: "适合输出深度分析、案例拆解和可复用方法论的长文。",
    audience: "行业从业者、企业决策者、专业读者",
    tone: "专业、可信、分析型",
    formatGuidance: "适合完整文章，但不强制固定为“引言-正文-结束语”模板，可根据主题自然组织结构。",
    wordRange: "1500-3500 字",
    imageAspectRatio: "16:9",
    imageStyle: "专业、简洁、偏编辑插图或信息图",
    imageCount: "2-4 张",
    copyHint: "支持复制富文本或 Markdown，适合继续粘贴到公众号编辑器微调。",
    supportsThread: false,
    skillStack: ["content-creation", "research-enhanced", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Gemini image generation", "Markdown packager"],
    promptKeywords: ["深度分析", "案例拆解", "趋势判断", "方法论"],
  },
  xiaohongshu: {
    id: "xiaohongshu",
    label: "小红书图文写手",
    shortLabel: "小红书",
    description: "适合输出轻量、抓眼、适合移动端阅读的图文笔记。",
    audience: "年轻消费群体、知识博主读者、效率工具用户",
    tone: "友好、口语化、强钩子",
    formatGuidance: "强调短段落、强节奏、可收藏，不强制传统文章结构。",
    wordRange: "300-900 字",
    imageAspectRatio: "3:4",
    imageStyle: "明亮、生活化、封面感强，适合移动端图文笔记",
    imageCount: "3-6 张",
    copyHint: "适合复制富文本正文，再将图片按卡片顺序上传到小红书编辑器。",
    supportsThread: false,
    skillStack: ["content-creation", "research-enhanced", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Gemini image generation"],
    promptKeywords: ["爆款标题", "收藏感", "移动端阅读", "标签话题"],
  },
  x: {
    id: "x",
    label: "X 文章写手",
    shortLabel: "X",
    description: "适合输出高信息密度的单帖或线程内容。",
    audience: "海外科技用户、创作者、创业者、行业观察者",
    tone: "直接、清晰、观点驱动",
    formatGuidance: "支持单篇和线程；线程模式按多段短帖生成，不强制长文式结构。",
    wordRange: "单篇长帖 / 5-12 段线程",
    imageAspectRatio: "16:9",
    imageStyle: "极简、科技感、适合横向社交分享",
    imageCount: "1-3 张",
    copyHint: "单篇可整体复制；线程模式建议按段复制，图片单独下载或复制图链。",
    supportsThread: true,
    skillStack: ["content-creation", "research-enhanced", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Thread-ready markdown formatting"],
    promptKeywords: ["hook", "takeaway", "thread", "global audience"],
  },
  facebook: {
    id: "facebook",
    label: "Facebook 文章写手",
    shortLabel: "Facebook",
    description: "适合输出社区讨论型、品牌叙事型的长帖或多段帖文。",
    audience: "品牌社区成员、兴趣社群用户、海外营销受众",
    tone: "亲和、叙事、可分享",
    formatGuidance: "支持长帖与多段帖文，根据内容自然组织结构，不强制文章模板。",
    wordRange: "长帖 / 4-8 段帖文",
    imageAspectRatio: "16:9",
    imageStyle: "温暖、品牌感、适合社区传播",
    imageCount: "1-4 张",
    copyHint: "适合复制正文后在 Facebook Composer 微调，图片分批上传。",
    supportsThread: true,
    skillStack: ["content-creation", "research-enhanced", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Social post packaging"],
    promptKeywords: ["community", "storytelling", "engagement", "shareability"],
  },
}

export function isWriterPlatform(value: string | null | undefined): value is WriterPlatform {
  return Boolean(value && value in WRITER_PLATFORM_CONFIG)
}

export function normalizeWriterPlatform(value: string | null | undefined): WriterPlatform {
  return isWriterPlatform(value) ? value : DEFAULT_WRITER_PLATFORM
}

export function normalizeWriterMode(platform: WriterPlatform, value: string | null | undefined): WriterMode {
  if (value === "thread" && WRITER_PLATFORM_CONFIG[platform].supportsThread) {
    return "thread"
  }

  return DEFAULT_WRITER_MODE
}

export function isWriterLanguage(value: string | null | undefined): value is WriterLanguage {
  return Boolean(value && value in WRITER_LANGUAGE_CONFIG)
}

export function normalizeWriterLanguage(value: string | null | undefined): WriterLanguage {
  return isWriterLanguage(value) ? value : DEFAULT_WRITER_LANGUAGE
}

export function getWriterModeOptions(platform: WriterPlatform) {
  if (WRITER_PLATFORM_CONFIG[platform].supportsThread) {
    return [
      { value: "article" as const, label: "单篇长文", description: "适合一篇完整文章或一条长帖内容。" },
      { value: "thread" as const, label: "线程 / 多段帖文", description: "适合拆分观点，逐段发布。" },
    ]
  }

  return [{ value: "article" as const, label: "标准图文", description: "适合单篇完整图文内容。" }]
}
