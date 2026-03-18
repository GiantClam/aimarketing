export interface DifyConfig {
    baseUrl: string;
    apiKey: string;
}

function getHeaders(config: DifyConfig) {
    if (!config.apiKey) {
        console.warn("Dify API KEY is not provided");
    }
    return {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
    };
}

/**
 * 1. 发送对话消息
 */
export async function sendMessage(config: DifyConfig, payload: any, init?: RequestInit) {
    return fetch(`${config.baseUrl}/chat-messages`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify(payload),
        ...init,
    });
}

export async function runWorkflow(config: DifyConfig, payload: any, init?: RequestInit) {
    return fetch(`${config.baseUrl}/workflows/run`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify(payload),
        ...init,
    });
}

/**
 * 2. 停止响应
 */
export async function stopMessage(config: DifyConfig, taskId: string, user: string) {
    return fetch(`${config.baseUrl}/chat-messages/${taskId}/stop`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify({ user }),
    });
}

/**
 * 3. 获取会话历史消息
 */
export async function getMessages(config: DifyConfig, conversationId: string, user: string, firstId?: string, limit = 20) {
    const url = new URL(`${config.baseUrl}/messages`);
    url.searchParams.append("conversation_id", conversationId);
    url.searchParams.append("user", user);
    url.searchParams.append("limit", limit.toString());
    if (firstId) {
        url.searchParams.append("first_id", firstId);
    }

    return fetch(url.toString(), {
        method: "GET",
        headers: getHeaders(config),
    });
}

/**
 * 4. 获取会话列表
 */
export async function getConversations(config: DifyConfig, user: string, lastId?: string, limit = 20) {
    const url = new URL(`${config.baseUrl}/conversations`);
    url.searchParams.append("user", user);
    url.searchParams.append("limit", limit.toString());
    if (lastId) {
        url.searchParams.append("last_id", lastId);
    }

    return fetch(url.toString(), {
        method: "GET",
        headers: getHeaders(config),
    });
}

/**
 * 5. 删除会话
 */
export async function deleteConversation(config: DifyConfig, conversationId: string, user: string) {
    return fetch(`${config.baseUrl}/conversations/${conversationId}`, {
        method: "DELETE",
        headers: getHeaders(config),
        body: JSON.stringify({ user }), // Dify v1/conversations/:id API req body format per docs delete usually accepts body for user
    });
}

/**
 * 6. 会话重命名
 */
export async function renameConversation(config: DifyConfig, conversationId: string, name: string, user: string) {
    return fetch(`${config.baseUrl}/conversations/${conversationId}/name`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify({ name, user, auto_generate: false }),
    });
}
