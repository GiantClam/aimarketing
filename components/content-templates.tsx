"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, MessageSquare, Mail, ShoppingBag, Zap } from "lucide-react"

interface ContentTemplate {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  industryKnowledgeBaseId?: string
  workflowUrl: string
  workflowId: string
  workflowApiKey: string
  workflowType: "n8n" | "dify"
  templateType: "public" | "custom"
  customUserId?: string
  usageCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface ContentTemplatesProps {
  onTemplateSelect: (template: ContentTemplate) => void
}

export function ContentTemplates({ onTemplateSelect }: ContentTemplatesProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [templates, setTemplates] = useState<ContentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch("/api/templates")
        if (!response.ok) {
          throw new Error("Failed to fetch templates")
        }
        const data = await response.json()
        setTemplates(data.templates || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load templates")
      } finally {
        setLoading(false)
      }
    }

    fetchTemplates()
  }, [])

  const filteredTemplates =
    selectedCategory === "all" ? templates : templates.filter((template) => template.category === selectedCategory)

  const categories = Array.from(new Set(templates.map((t) => t.category)))

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "social":
      case "社交媒体":
        return <MessageSquare className="w-4 h-4" />
      case "email":
      case "邮件营销":
        return <Mail className="w-4 h-4" />
      case "article":
      case "文章内容":
        return <FileText className="w-4 h-4" />
      case "ecommerce":
      case "电商文案":
        return <ShoppingBag className="w-4 h-4" />
      default:
        return <Zap className="w-4 h-4" />
    }
  }

  const getCategoryName = (category: string) => {
    // Return the category as-is since it's already in Chinese from database
    return category
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground font-manrope">加载模板中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive font-manrope mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            重试
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-2 font-sans">内容模板</h2>
              <p className="text-muted-foreground font-manrope">选择预设模板快速开始内容创作</p>
            </div>

            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="space-y-6">
              <TabsList
                className="grid w-full max-w-4xl"
                style={{ gridTemplateColumns: `repeat(${categories.length + 1}, 1fr)` }}
              >
                <TabsTrigger value="all" className="font-manrope">
                  全部
                </TabsTrigger>
                {categories.map((category) => (
                  <TabsTrigger key={category} value={category} className="font-manrope">
                    {getCategoryName(category)}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6">
                {filteredTemplates.map((template) => (
                  <Card key={template.id} className="border-border hover:shadow-lg transition-all cursor-pointer group">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                            {getCategoryIcon(template.category)}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {getCategoryIcon(template.category)}
                            <span className="ml-1 font-manrope">{getCategoryName(template.category)}</span>
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <Badge
                            variant={template.templateType === "public" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {template.templateType === "public" ? "公用" : "定制"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {template.workflowType.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      <CardTitle className="text-lg font-sans group-hover:text-primary transition-colors">
                        {template.name}
                      </CardTitle>
                      <CardDescription className="font-manrope">{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1 mb-4">
                        {template.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs font-manrope">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground font-manrope">
                          使用次数: {template.usageCount}
                        </span>
                      </div>
                      <Button
                        onClick={() => onTemplateSelect(template)}
                        className="w-full font-manrope"
                        variant="outline"
                      >
                        使用模板
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filteredTemplates.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 font-sans">暂无模板</h3>
                  <p className="text-muted-foreground font-manrope mb-4">
                    {selectedCategory === "all" ? "还没有可用的模板" : `${selectedCategory} 分类下暂无模板`}
                  </p>
                </div>
              )}
            </Tabs>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
