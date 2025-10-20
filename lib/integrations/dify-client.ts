// Dify 集成客户端
export class DifyClient {
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = process.env.DIFY_BASE_URL || "http://localhost:5001"
    this.apiKey = process.env.DIFY_API_KEY || ""
  }

  // 创建对话会话
  async createConversation(userId: number) {
    const response = await fetch(`${this.baseUrl}/v1/chat-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        inputs: {},
        query: "",
        user: userId.toString(),
        conversation_id: "",
      }),
    })

    if (!response.ok) {
      throw new Error(`Dify conversation creation failed: ${response.statusText}`)
    }

    return response.json()
  }

  // 发送消息并获取 AI 回复（支持流式响应）
  async sendMessage(params: {
    query: string
    userId: number
    conversationId?: string
    knowledgeSource: "industry_kb" | "personal_kb"
    stream?: boolean
  }) {
    const { query, userId, conversationId, knowledgeSource, stream = false } = params

    // 根据知识库选择配置检索参数
    const retrievalConfig = {
      search_method: "semantic_search",
      reranking_enable: true,
      reranking_model: {
        reranking_provider_name: "cohere",
        reranking_model_name: "rerank-english-v2.0",
      },
      top_k: 3,
      score_threshold_enabled: false,
      // 根据知识库类型选择不同的数据集
      dataset_ids:
        knowledgeSource === "industry_kb" ? [process.env.DIFY_INDUSTRY_DATASET_ID] : [`user_${userId}_personal_kb`],
    }

    const response = await fetch(`${this.baseUrl}/v1/chat-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        inputs: {},
        query,
        user: userId.toString(),
        conversation_id: conversationId || "",
        response_mode: stream ? "streaming" : "blocking",
        retrieval_setting: retrievalConfig,
      }),
    })

    if (!response.ok) {
      throw new Error(`Dify message failed: ${response.statusText}`)
    }

    return stream ? response : response.json()
  }

  // 获取对话历史
  async getConversationHistory(conversationId: string, userId: number) {
    const response = await fetch(`${this.baseUrl}/v1/messages?conversation_id=${conversationId}&user=${userId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get conversation history: ${response.statusText}`)
    }

    return response.json()
  }

  // 创建个人知识库数据集
  async createPersonalDataset(userId: number, name: string) {
    const response = await fetch(`${this.baseUrl}/v1/datasets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        name: `user_${userId}_${name}`,
        description: `Personal knowledge base for user ${userId}`,
        permission: "only_me",
        indexing_technique: "high_quality",
        embedding_model: "text-embedding-ada-002",
        embedding_model_provider: "openai",
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to create personal dataset: ${response.statusText}`)
    }

    return response.json()
  }
}

export const difyClient = new DifyClient()
