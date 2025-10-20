// n8n 集成客户端
export class N8nClient {
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = process.env.N8N_BASE_URL || "http://localhost:5678"
    this.apiKey = process.env.N8N_API_KEY || ""
  }

  // 触发行业知识库爬取工作流
  async triggerIndustryKnowledgeCrawl(urls: string[], userId: number) {
    const response = await fetch(`${this.baseUrl}/webhook/industry-kb-crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        urls,
        userId,
        timestamp: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      throw new Error(`n8n workflow failed: ${response.statusText}`)
    }

    return response.json()
  }

  // 触发个人文件处理工作流
  async triggerPersonalFileProcessing(fileInfo: {
    userId: number
    fileName: string
    storageKey: string
    fileType: string
  }) {
    const response = await fetch(`${this.baseUrl}/webhook/personal-file-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(fileInfo),
    })

    if (!response.ok) {
      throw new Error(`n8n file processing failed: ${response.statusText}`)
    }

    return response.json()
  }

  // 获取工作流执行状态
  async getWorkflowStatus(executionId: string) {
    const response = await fetch(`${this.baseUrl}/api/v1/executions/${executionId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get workflow status: ${response.statusText}`)
    }

    return response.json()
  }
}

export const n8nClient = new N8nClient()
