// n8n 集成客户端
export class N8nClient {
  private baseUrl: string
  private apiKey: string

  constructor()
  constructor(opts: { baseUrl?: string; apiKey?: string })
  constructor(opts?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = opts?.baseUrl || process.env.N8N_BASE_URL || "http://localhost:5678"
    this.apiKey = opts?.apiKey || process.env.N8N_API_KEY || ""
  }

  // 通用 Webhook 触发（支持覆盖 baseUrl 和自定义 Header）
  async triggerWebhook(
    webhookPath: string,
    payload: unknown,
    options?: { baseUrl?: string; headers?: Record<string, string> }
  ): Promise<{ ok: boolean; status: number; data: any }> {
    const urlBase = options?.baseUrl || this.baseUrl
    const response = await fetch(`${urlBase.replace(/\/$/, "")}/webhook/${webhookPath.replace(/^\//, "")}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey ? `Bearer ${this.apiKey}` : "",
        ...(options?.headers || {}),
      },
      body: JSON.stringify(payload ?? {}),
    })

    const contentType = response.headers.get("content-type") || ""
    const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : await response.text().catch(() => "")

    if (!response.ok) {
      throw new Error(`n8n webhook failed (${response.status}): ${response.statusText}`)
    }

    return { ok: true, status: response.status, data }
  }

  // 指定用户/连接的工作流触发（传入用户自有 n8n 域名）
  async triggerWorkflow(params: {
    webhookPath: string
    payload: unknown
    userScopedBaseUrl?: string
    headers?: Record<string, string>
  }): Promise<{ ok: boolean; status: number; data: any }> {
    const { webhookPath, payload, userScopedBaseUrl, headers } = params
    return this.triggerWebhook(webhookPath, payload, { baseUrl: userScopedBaseUrl, headers })
  }

  // 触发行业知识库爬取工作流（保留兼容）
  async triggerIndustryKnowledgeCrawl(urls: string[], userId: number) {
    return this.triggerWebhook("industry-kb-crawl", {
      urls,
      userId,
      timestamp: new Date().toISOString(),
    })
  }

  // 触发个人文件处理工作流（保留兼容）
  async triggerPersonalFileProcessing(fileInfo: {
    userId: number
    fileName: string
    storageKey: string
    fileType: string
  }) {
    return this.triggerWebhook("personal-file-process", fileInfo)
  }

  // 获取工作流执行状态
  async getWorkflowStatus(executionId: string, options?: { baseUrl?: string }) {
    const urlBase = options?.baseUrl || this.baseUrl
    const response = await fetch(`${urlBase.replace(/\/$/, "")}/api/v1/executions/${executionId}`, {
      headers: {
        Authorization: this.apiKey ? `Bearer ${this.apiKey}` : "",
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get workflow status: ${response.statusText}`)
    }

    return response.json()
  }
}

export const n8nClient = new N8nClient()
