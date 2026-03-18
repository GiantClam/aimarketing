export interface DifyConfig {
    baseUrl: string;
    apiKey: string;
}

const DIFY_FETCH_RETRY_DELAYS_MS = [500, 1500];

function getHeaders(config: DifyConfig) {
    if (!config.apiKey) {
        console.warn("Dify API KEY is not provided");
    }
    return {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
}

function isRetryableDifyFetchError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const causeMessage =
        error && typeof error === "object" && "cause" in error
            ? getErrorMessage((error as { cause?: unknown }).cause).toLowerCase()
            : "";
    const combined = `${message} ${causeMessage}`;

    return (
        combined.includes("fetch failed") ||
        combined.includes("econnreset") ||
        combined.includes("socket hang up") ||
        combined.includes("connect timeout") ||
        combined.includes("headers timeout") ||
        combined.includes("body timeout") ||
        combined.includes("und_err_connect_timeout") ||
        combined.includes("other side closed") ||
        combined.includes("networkerror")
    );
}

async function fetchWithRetry(input: string, init: RequestInit) {
    for (let attempt = 0; attempt <= DIFY_FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            return await fetch(input, init);
        } catch (error) {
            if (init.signal?.aborted || !isRetryableDifyFetchError(error) || attempt === DIFY_FETCH_RETRY_DELAYS_MS.length) {
                throw error;
            }

            console.warn("dify.fetch.retry", {
                url: input,
                attempt: attempt + 1,
                message: getErrorMessage(error),
            });
            await sleep(DIFY_FETCH_RETRY_DELAYS_MS[attempt]);
        }
    }

    throw new Error("dify_fetch_retry_exhausted");
}

async function fetchWithoutRetry(input: string, init: RequestInit) {
    return fetch(input, init);
}

export async function sendMessage(config: DifyConfig, payload: any, init?: RequestInit) {
    return fetchWithoutRetry(`${config.baseUrl}/chat-messages`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify(payload),
        ...init,
    });
}

export async function runWorkflow(config: DifyConfig, payload: any, init?: RequestInit) {
    return fetchWithoutRetry(`${config.baseUrl}/workflows/run`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify(payload),
        ...init,
    });
}

export async function stopMessage(config: DifyConfig, taskId: string, user: string) {
    return fetchWithRetry(`${config.baseUrl}/chat-messages/${taskId}/stop`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify({ user }),
    });
}

export async function getMessages(config: DifyConfig, conversationId: string, user: string, firstId?: string, limit = 20) {
    const url = new URL(`${config.baseUrl}/messages`);
    url.searchParams.append("conversation_id", conversationId);
    url.searchParams.append("user", user);
    url.searchParams.append("limit", limit.toString());
    if (firstId) {
        url.searchParams.append("first_id", firstId);
    }

    return fetchWithRetry(url.toString(), {
        method: "GET",
        headers: getHeaders(config),
    });
}

export async function getConversations(config: DifyConfig, user: string, lastId?: string, limit = 20) {
    const url = new URL(`${config.baseUrl}/conversations`);
    url.searchParams.append("user", user);
    url.searchParams.append("limit", limit.toString());
    if (lastId) {
        url.searchParams.append("last_id", lastId);
    }

    return fetchWithRetry(url.toString(), {
        method: "GET",
        headers: getHeaders(config),
    });
}

export async function deleteConversation(config: DifyConfig, conversationId: string, user: string) {
    return fetchWithRetry(`${config.baseUrl}/conversations/${conversationId}`, {
        method: "DELETE",
        headers: getHeaders(config),
        body: JSON.stringify({ user }),
    });
}

export async function renameConversation(config: DifyConfig, conversationId: string, name: string, user: string) {
    return fetchWithRetry(`${config.baseUrl}/conversations/${conversationId}/name`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify({ name, user, auto_generate: false }),
    });
}
