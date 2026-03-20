export const WRITER_PLATFORM_ORDER = [
  "wechat",
  "xiaohongshu",
  "weibo",
  "douyin",
  "x",
  "linkedin",
  "instagram",
  "tiktok",
  "facebook",
  "generic",
] as const

export type WriterPlatform = (typeof WRITER_PLATFORM_ORDER)[number]
export type WriterMode = "article" | "thread"

export const WRITER_CONTENT_TYPE_ORDER = [
  "social_cn",
  "social_global",
  "longform",
  "email",
  "newsletter",
  "website_copy",
  "ads",
  "case_study",
  "product",
  "speech",
] as const

export type WriterContentType = (typeof WRITER_CONTENT_TYPE_ORDER)[number]

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
  auto: { value: "auto", label: "自动识别", description: "根据用户输入自动判断输出语言" },
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

export type WriterContentTypeConfig = {
  id: WriterContentType
  label: string
  description: string
  defaultTargetPlatform: string
  defaultOutputForm: string
  defaultLengthTarget: string
}

export const DEFAULT_WRITER_PLATFORM: WriterPlatform = "wechat"
export const DEFAULT_WRITER_MODE: WriterMode = "article"
export const DEFAULT_WRITER_LANGUAGE: WriterLanguage = "auto"

export const WRITER_PLATFORM_CONFIG: Record<WriterPlatform, WriterPlatformConfig> = {
  wechat: {
    id: "wechat",
    label: "微信公众号写作",
    shortLabel: "公众号",
    description: "适合深度文章、行业分析、品牌观点和案例拆解。",
    audience: "行业从业者、企业决策者、专业读者",
    tone: "professional, analytical, trusted",
    formatGuidance: "适合完整文章，不强制套固定模板。",
    wordRange: "1500-3500 字",
    imageAspectRatio: "16:9",
    imageStyle: "专业、简洁、编辑化",
    imageCount: "2-4 张",
    copyHint: "适合生成可直接继续编辑或发布的长文草稿。",
    supportsThread: false,
    skillStack: ["content-creation", "research-enhanced", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Gemini image generation"],
    promptKeywords: ["深度分析", "案例拆解", "方法论", "长文"],
  },
  xiaohongshu: {
    id: "xiaohongshu",
    label: "小红书图文写作",
    shortLabel: "小红书",
    description: "适合种草笔记、经验分享和移动端快读内容。",
    audience: "年轻消费群体、兴趣用户、生活方式读者",
    tone: "conversational, catchy, save-worthy",
    formatGuidance: "强调短段落、强节奏和收藏感。",
    wordRange: "300-900 字",
    imageAspectRatio: "3:4",
    imageStyle: "明亮、生活化、封面感强",
    imageCount: "3-6 张",
    copyHint: "适合输出图文笔记和卡片式配图占位。",
    supportsThread: false,
    skillStack: ["content-creation", "social-native", "image-generation"],
    toolStack: ["Google Search", "Jina Reader", "Gemini image generation"],
    promptKeywords: ["种草", "收藏", "移动端", "短段落"],
  },
  weibo: {
    id: "weibo",
    label: "微博文案写作",
    shortLabel: "微博",
    description: "适合热点传播、活动预热和观点型短帖。",
    audience: "泛社交读者、品牌关注者、活动受众",
    tone: "direct, timely, spreadable",
    formatGuidance: "优先短帖或短串文，快速进入观点或事件。",
    wordRange: "80-300 字 / 短串文",
    imageAspectRatio: "16:9",
    imageStyle: "传播感强、信息聚焦",
    imageCount: "1-2 张",
    copyHint: "适合热点短帖、活动预热和评论型输出。",
    supportsThread: true,
    skillStack: ["content-creation", "social-native"],
    toolStack: ["Short-form packaging"],
    promptKeywords: ["热点", "传播", "话题", "评论"],
  },
  douyin: {
    id: "douyin",
    label: "抖音脚本写作",
    shortLabel: "抖音",
    description: "适合短视频口播、种草脚本和节奏型表达。",
    audience: "短视频用户、兴趣电商受众",
    tone: "spoken, fast, hook-first",
    formatGuidance: "优先脚本化表达，强调前 1-3 秒抓人。",
    wordRange: "15-60 秒脚本",
    imageAspectRatio: "9:16",
    imageStyle: "竖版、动感、适合封面占位",
    imageCount: "1 张",
    copyHint: "适合口播脚本和分镜提示。",
    supportsThread: false,
    skillStack: ["content-creation", "short-video"],
    toolStack: ["Hook planning", "Script formatting"],
    promptKeywords: ["口播", "短视频", "脚本", "种草"],
  },
  x: {
    id: "x",
    label: "X 写作",
    shortLabel: "X",
    description: "适合高信息密度单帖、thread 和观点型内容。",
    audience: "海外科技用户、创业者、创作者",
    tone: "direct, sharp, opinion-driven",
    formatGuidance: "支持单帖和串文，thread 需要多段短帖结构。",
    wordRange: "长帖 / 5-12 段 thread",
    imageAspectRatio: "16:9",
    imageStyle: "极简、科技感、适合横向社交分享",
    imageCount: "1-3 张",
    copyHint: "适合生成单帖、thread 和观点型短内容。",
    supportsThread: true,
    skillStack: ["content-creation", "social-native", "image-generation"],
    toolStack: ["Thread-ready markdown formatting"],
    promptKeywords: ["hook", "thread", "takeaway", "global audience"],
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn 写作",
    shortLabel: "LinkedIn",
    description: "适合职业观点、创始人叙事和专业社交内容。",
    audience: "职业人士、B2B 受众、行业从业者",
    tone: "credible, professional, insight-led",
    formatGuidance: "强调首屏钩子与分段留白，适合中长帖。",
    wordRange: "300-1200 words",
    imageAspectRatio: "16:9",
    imageStyle: "专业、简洁、适合职场传播",
    imageCount: "1-3 张",
    copyHint: "适合 thought leadership、创始人视角和职业社交内容。",
    supportsThread: false,
    skillStack: ["content-creation", "social-native", "image-generation"],
    toolStack: ["Professional post formatting"],
    promptKeywords: ["thought leadership", "operator", "founder story"],
  },
  instagram: {
    id: "instagram",
    label: "Instagram 写作",
    shortLabel: "Instagram",
    description: "适合 caption、carousel 和视觉配套文案。",
    audience: "视觉导向用户、品牌粉丝、生活方式内容受众",
    tone: "visual-first, emotional, concise",
    formatGuidance: "强调首句停留和视觉配合，不写成长文章。",
    wordRange: "caption / carousel copy",
    imageAspectRatio: "4:5",
    imageStyle: "视觉优先、构图饱满",
    imageCount: "1-5 张",
    copyHint: "适合 caption、轮播文案和 reel 配套文字。",
    supportsThread: false,
    skillStack: ["content-creation", "visual-social", "image-generation"],
    toolStack: ["Caption packaging", "Carousel structuring"],
    promptKeywords: ["caption", "carousel", "visual-first", "reel"],
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok 脚本写作",
    shortLabel: "TikTok",
    description: "适合 hook-first 短视频脚本和快节奏表达。",
    audience: "短视频受众、年轻用户、兴趣内容读者",
    tone: "spoken, energetic, fast-moving",
    formatGuidance: "优先短视频脚本与快节奏分句。",
    wordRange: "15-45 second script",
    imageAspectRatio: "9:16",
    imageStyle: "竖版、动感、适合短视频封面",
    imageCount: "1 张",
    copyHint: "适合输出 hook、setup、value、CTA 四段式脚本。",
    supportsThread: false,
    skillStack: ["content-creation", "short-video"],
    toolStack: ["Hook planning", "Script formatting"],
    promptKeywords: ["hook", "short video", "script", "spoken"],
  },
  facebook: {
    id: "facebook",
    label: "Facebook 写作",
    shortLabel: "Facebook",
    description: "适合社区讨论、叙事型长帖和品牌传播内容。",
    audience: "品牌社区成员、兴趣社群用户、海外营销受众",
    tone: "narrative, community-oriented, shareable",
    formatGuidance: "支持长帖和多段贴文，自然组织结构。",
    wordRange: "长帖 / 4-8 段多帖",
    imageAspectRatio: "16:9",
    imageStyle: "温暖、品牌感、适合社区传播",
    imageCount: "1-4 张",
    copyHint: "适合社区叙事、活动传播和品牌贴文。",
    supportsThread: true,
    skillStack: ["content-creation", "social-native", "image-generation"],
    toolStack: ["Social post packaging"],
    promptKeywords: ["community", "storytelling", "engagement", "shareability"],
  },
  generic: {
    id: "generic",
    label: "通用文稿",
    shortLabel: "文稿",
    description: "适合邮件、网站文案、案例、产品文案、演讲稿等非社交场景。",
    audience: "按具体写作任务变化",
    tone: "clear, credible, scenario-aware",
    formatGuidance: "使用场景原生结构，不强制套社交平台写法。",
    wordRange: "按场景自适应",
    imageAspectRatio: "16:9",
    imageStyle: "简洁、编辑化、通用占位",
    imageCount: "0-2 张",
    copyHint: "适合非社交文稿、结构化页面文案和脚本型文本。",
    supportsThread: false,
    skillStack: ["content-creation", "scenario-routing"],
    toolStack: ["Structured drafting"],
    promptKeywords: ["email", "website", "case study", "speech", "product"],
  },
}

export const WRITER_CONTENT_TYPE_CONFIG: Record<WriterContentType, WriterContentTypeConfig> = {
  social_cn: {
    id: "social_cn",
    label: "中文社媒",
    description: "适合微信公众号、小红书、微博、抖音等中文平台内容。",
    defaultTargetPlatform: "WeChat Official Account",
    defaultOutputForm: "平台原生图文或脚本",
    defaultLengthTarget: "按平台原生长度",
  },
  social_global: {
    id: "social_global",
    label: "海外社媒",
    description: "适合 LinkedIn、X、Instagram、TikTok、Facebook 等内容。",
    defaultTargetPlatform: "LinkedIn",
    defaultOutputForm: "平台原生贴文或脚本",
    defaultLengthTarget: "按平台原生长度",
  },
  longform: {
    id: "longform",
    label: "长文内容",
    description: "适合文章、教程、指南、品牌故事和新闻稿。",
    defaultTargetPlatform: "Long-form publishing",
    defaultOutputForm: "结构化长文",
    defaultLengthTarget: "800-2000 字",
  },
  email: {
    id: "email",
    label: "邮件写作",
    description: "适合 cold email、商务邮件、跟进邮件和回复邮件。",
    defaultTargetPlatform: "Email",
    defaultOutputForm: "单封邮件",
    defaultLengthTarget: "120-250 words",
  },
  newsletter: {
    id: "newsletter",
    label: "Newsletter / 生命周期邮件",
    description: "适合 newsletter、onboarding、nurture 和 retention 内容。",
    defaultTargetPlatform: "Email",
    defaultOutputForm: "newsletter 或生命周期邮件",
    defaultLengthTarget: "200-600 words",
  },
  website_copy: {
    id: "website_copy",
    label: "网站文案",
    description: "适合首页、落地页、产品页和 CTA 区块文案。",
    defaultTargetPlatform: "Website",
    defaultOutputForm: "分区块页面文案",
    defaultLengthTarget: "按页面结构自适应",
  },
  ads: {
    id: "ads",
    label: "广告投放文案",
    description: "适合广告标题、描述、hook 变体和 A/B 文案。",
    defaultTargetPlatform: "Ads",
    defaultOutputForm: "多变体广告文案",
    defaultLengthTarget: "短文案 / 变体组",
  },
  case_study: {
    id: "case_study",
    label: "案例写作",
    description: "适合客户案例、成功故事和销售证明内容。",
    defaultTargetPlatform: "Case Study",
    defaultOutputForm: "案例或客户故事",
    defaultLengthTarget: "600-1500 字",
  },
  product: {
    id: "product",
    label: "产品写作",
    description: "适合产品介绍、卖点、FAQ 和使用指南。",
    defaultTargetPlatform: "Product",
    defaultOutputForm: "产品文案或说明文本",
    defaultLengthTarget: "按产品场景自适应",
  },
  speech: {
    id: "speech",
    label: "演讲与发言",
    description: "适合 keynote、remarks、主持词和讲稿。",
    defaultTargetPlatform: "Speech",
    defaultOutputForm: "演讲稿或提纲",
    defaultLengthTarget: "按时长自适应",
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
      { value: "article" as const, label: "单篇输出", description: "适合一篇完整内容或单条长帖。" },
      { value: "thread" as const, label: "多段串文", description: "适合拆分观点并逐段发布。" },
    ]
  }

  return [{ value: "article" as const, label: "标准输出", description: "适合单篇完整内容。" }]
}

export function isWriterContentType(value: string | null | undefined): value is WriterContentType {
  return Boolean(value && value in WRITER_CONTENT_TYPE_CONFIG)
}

export function normalizeWriterContentType(value: string | null | undefined): WriterContentType {
  return isWriterContentType(value) ? value : "longform"
}
