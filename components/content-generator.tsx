"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Wand2,
  Copy,
  Download,
  Save,
  RefreshCw,
  ImageIcon,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
} from "lucide-react"

interface GeneratedContent {
  id: string
  type: "text" | "image"
  title: string
  content: string
  timestamp: string
  knowledgeSource?: "industry_kb" | "personal_kb"
  rating?: "up" | "down"
}

const mockGeneratedContent: GeneratedContent[] = [
  {
    id: "1",
    type: "text",
    title: "小红书种草文案",
    content:
      "🌟【真实测评】这款面膜真的太好用了！\n\n姐妹们，今天必须来分享这个宝藏面膜！用了一个月，皮肤状态真的肉眼可见的好转✨\n\n💡 主要成分：\n• 玻尿酸 - 深层补水\n• 烟酰胺 - 提亮肤色\n• 胶原蛋白 - 紧致肌肤\n\n🔥 使用感受：\n质地很温和，敷上去凉凉的很舒服，15分钟后撕下来皮肤水润润的，而且不会过敏！坚持用了一个月，朋友都说我皮肤变好了～\n\n💰 价格也很美丽，性价比超高！\n\n#面膜推荐 #护肤分享 #美妆好物 #种草",
    timestamp: "2分钟前",
    knowledgeSource: "personal_kb",
  },
  {
    id: "2",
    type: "text",
    title: "产品促销邮件",
    content:
      "主题：🎉 限时特惠！您心仪的产品现在8折优惠\n\n亲爱的用户，\n\n感谢您一直以来对我们的支持！为了回馈您的信任，我们特别推出限时优惠活动：\n\n🔥 全场8折优惠\n⏰ 活动时间：即日起至本月底\n🎁 满299元还送精美礼品\n\n热门推荐：\n• 明星产品A - 原价199，现价159\n• 新品B - 原价299，现价239\n• 套装C - 原价499，现价399\n\n立即购买，享受优惠！\n\n[立即购买] [查看更多]\n\n如有疑问，请联系客服：400-123-4567\n\n祝好！\n您的品牌团队",
    timestamp: "5分钟前",
    knowledgeSource: "personal_kb",
  },
]

interface ContentGeneratorProps {
  initialPrompt?: string
}

export function ContentGenerator({ initialPrompt = "" }: ContentGeneratorProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent[]>(mockGeneratedContent)
  const [activeTab, setActiveTab] = useState("generate")

  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)

    // Simulate content generation
    setTimeout(() => {
      const newContent: GeneratedContent = {
        id: Date.now().toString(),
        type: "text",
        title: "新生成的内容",
        content: `基于您的需求："${prompt}"\n\n我为您生成了以下内容：\n\n这是一个示例生成的营销内容，结合了您的要求和知识库信息。内容包含了吸引人的标题、清晰的结构和有效的行动指引。\n\n具体内容会根据您选择的知识库和具体需求进行定制化生成。`,
        timestamp: "刚刚",
        knowledgeSource: prompt.includes("@") ? "personal_kb" : undefined,
      }

      setGeneratedContent((prev) => [newContent, ...prev])
      setIsGenerating(false)
      setActiveTab("history")
    }, 2000)
  }

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    // Show toast notification
  }

  const handleSave = (contentId: string) => {
    // Save to user's content library
    console.log("Saving content:", contentId)
  }

  const handleRating = (contentId: string, rating: "up" | "down") => {
    setGeneratedContent((prev) => prev.map((item) => (item.id === contentId ? { ...item, rating } : item)))
  }

  const handleRegenerate = () => {
    handleGenerate()
  }

  return (
    <div className="h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <div className="border-b border-border p-4">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="generate" className="font-manrope">
              内容生成
            </TabsTrigger>
            <TabsTrigger value="history" className="font-manrope">
              生成历史
            </TabsTrigger>
            <TabsTrigger value="saved" className="font-manrope">
              已保存
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="generate" className="h-full p-6 m-0">
            <div className="max-w-4xl mx-auto h-full flex flex-col">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2 font-sans">AI 内容生成</h2>
                <p className="text-muted-foreground font-manrope">描述您的需求，AI 将为您生成专业的营销内容</p>
              </div>

              <Card className="flex-1 flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans">
                    <Wand2 className="w-5 h-5" />
                    内容需求描述
                  </CardTitle>
                  <CardDescription className="font-manrope">
                    详细描述您需要的内容类型、风格、目标受众等信息
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="例如：@个人知识库 帮我写一篇小红书种草文案，产品是护肤面膜，目标用户是25-35岁女性，要求语言亲切自然，突出产品效果..."
                    className="flex-1 min-h-[200px] font-manrope resize-none"
                    disabled={isGenerating}
                  />
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="w-3 h-3 mr-1" />
                        <span className="font-manrope">AI 驱动</span>
                      </Badge>
                      {prompt.includes("@个人知识库") && (
                        <Badge variant="secondary" className="text-xs">
                          <span className="font-manrope">个人知识库</span>
                        </Badge>
                      )}
                      {prompt.includes("@行业知识库") && (
                        <Badge variant="secondary" className="text-xs">
                          <span className="font-manrope">行业知识库</span>
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setPrompt("")}
                        disabled={isGenerating || !prompt}
                        className="font-manrope"
                      >
                        清空
                      </Button>
                      <Button
                        onClick={handleGenerate}
                        disabled={isGenerating || !prompt.trim()}
                        className="font-manrope"
                      >
                        {isGenerating ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4 mr-2" />
                            生成内容
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="h-full p-6 m-0">
            <div className="max-w-6xl mx-auto h-full">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2 font-sans">生成历史</h2>
                <p className="text-muted-foreground font-manrope">查看和管理您之前生成的所有内容</p>
              </div>

              <ScrollArea className="h-[calc(100%-120px)]">
                <div className="space-y-6">
                  {generatedContent.map((content) => (
                    <Card key={content.id} className="border-border">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                              {content.type === "text" ? (
                                <FileText className="w-4 h-4 text-primary" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-primary" />
                              )}
                            </div>
                            <div>
                              <CardTitle className="text-lg font-sans">{content.title}</CardTitle>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground font-manrope">{content.timestamp}</span>
                                {content.knowledgeSource && (
                                  <Badge variant="outline" className="text-xs">
                                    <span className="font-manrope">
                                      {content.knowledgeSource === "personal_kb" ? "个人知识库" : "行业知识库"}
                                    </span>
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRating(content.id, "up")}
                              className={content.rating === "up" ? "text-green-600" : ""}
                            >
                              <ThumbsUp className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRating(content.id, "down")}
                              className={content.rating === "down" ? "text-red-600" : ""}
                            >
                              <ThumbsDown className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-muted/30 rounded-lg p-4 mb-4">
                          <pre className="text-sm whitespace-pre-wrap font-manrope leading-relaxed">
                            {content.content}
                          </pre>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(content.content)}
                            className="font-manrope"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            复制
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSave(content.id)}
                            className="font-manrope"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            保存
                          </Button>
                          <Button variant="outline" size="sm" className="font-manrope bg-transparent">
                            <Download className="w-4 h-4 mr-2" />
                            导出
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRegenerate}
                            className="font-manrope bg-transparent"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            重新生成
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="saved" className="h-full p-6 m-0">
            <div className="max-w-6xl mx-auto h-full flex items-center justify-center">
              <div className="text-center">
                <Save className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2 font-sans">暂无保存的内容</h3>
                <p className="text-muted-foreground font-manrope">您保存的内容将显示在这里</p>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
