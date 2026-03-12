export const WRITER_PLATFORM_ORDER = ["wechat", "xiaohongshu", "x", "facebook"] as const

export type WriterPlatform = (typeof WRITER_PLATFORM_ORDER)[number]
export type WriterMode = "article" | "thread"

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

export const WRITER_PLATFORM_CONFIG: Record<WriterPlatform, WriterPlatformConfig> = {
  wechat: {
    id: "wechat",
    label: "公众号文章写手",
    shortLabel: "公众号",
    description: "适合输出深度分析、案例拆解和可复用方法论的长文。",
    audience: "行业从业者、企业决策者、专业读者",
    tone: "专业、可信、分析型",
    formatGuidance: "输出结构化长文，包含标题、导语、小标题、案例或数据、总结与行动建议。",
    wordRange: "1500-3200 字",
    imageAspectRatio: "16:9",
    imageStyle: "专业、简洁、偏编辑插图或信息图",
    imageCount: "2-4 张",
    copyHint: "适合复制 Markdown 正文；图片单独下载后插入公众号后台。",
    supportsThread: false,
    skillStack: ["content-creation", "research-enhanced", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Nano Banana prompt workflow", "Markdown packager"],
    promptKeywords: ["深度分析", "案例拆解", "趋势判断", "方法论"],
  },
  xiaohongshu: {
    id: "xiaohongshu",
    label: "小红书图文写手",
    shortLabel: "小红书",
    description: "适合输出轻量、抓眼、适合移动端阅读的图文笔记。",
    audience: "年轻消费群体、知识博主读者、效率工具用户",
    tone: "友好、口语化、强钩子",
    formatGuidance: "短段落输出，强调标题钩子、重点分点、结尾互动与标签。",
    wordRange: "300-900 字",
    imageAspectRatio: "3:4",
    imageStyle: "明亮、生活化、封面感强，适合移动端图文笔记",
    imageCount: "3-6 张",
    copyHint: "建议复制正文文本并逐张下载封面与配图，再到小红书编辑器排版。",
    supportsThread: false,
    skillStack: ["content-creation", "research-enhanced", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Nano Banana prompt workflow"],
    promptKeywords: ["爆款标题", "收藏感", "移动端阅读", "标签话题"],
  },
  x: {
    id: "x",
    label: "X 文章写手",
    shortLabel: "X",
    description: "适合输出高信息密度、国际化表达的单篇长文或线程内容。",
    audience: "海外科技用户、创作者、创业者、行业观察者",
    tone: "直接、清晰、观点驱动",
    formatGuidance: "支持单篇长文和线程模式；线程模式需拆成多段短帖并保留主线。",
    wordRange: "长文 600-1400 字 / 线程 6-12 段",
    imageAspectRatio: "16:9",
    imageStyle: "极简、科技感、适合横向社交分享",
    imageCount: "1-3 张",
    copyHint: "长文可整体复制，线程模式建议逐段复制；图片支持下载或复制图链。",
    supportsThread: true,
    skillStack: ["content-creation", "research-enhanced", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Thread-ready markdown formatting"],
    promptKeywords: ["hook", "takeaway", "thread", "global audience"],
  },
  facebook: {
    id: "facebook",
    label: "Facebook 文章写手",
    shortLabel: "Facebook",
    description: "适合输出社区讨论型、品牌叙事型的长文或多段帖文。",
    audience: "品牌社区成员、兴趣社群用户、海外营销受众",
    tone: "亲和、叙事性、可分享",
    formatGuidance: "支持长文与多段帖文；兼顾品牌故事、观点表达和互动提问。",
    wordRange: "长文 800-1800 字 / 多段帖文 4-8 段",
    imageAspectRatio: "16:9",
    imageStyle: "温暖、品牌感、适合社区传播",
    imageCount: "1-4 张",
    copyHint: "适合复制正文后在 Facebook Composer 微调，图片分批下载上传。",
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

export function getWriterModeOptions(platform: WriterPlatform) {
  if (WRITER_PLATFORM_CONFIG[platform].supportsThread) {
    return [
      { value: "article" as const, label: "单篇长文", description: "适合一篇完整文章或一条长帖内容。" },
      { value: "thread" as const, label: "线程 / 多段帖文", description: "适合拆分观点，逐段发布。" },
    ]
  }

  return [{ value: "article" as const, label: "标准图文", description: "适合单篇完整图文内容。" }]
}
