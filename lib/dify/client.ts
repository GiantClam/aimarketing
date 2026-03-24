export interface DifyConfig {
    baseUrl: string;
    apiKey: string;
}

const DIFY_FETCH_RETRY_DELAYS_MS = [500, 1500];
const DIFY_AUTH_BLOCK_WINDOW_MS = Number.parseInt(process.env.DIFY_AUTH_BLOCK_WINDOW_MS || "", 10) || 15 * 60 * 1000;
const DIFY_AUTH_BLOCK_STORE_KEY = "__aimarketingDifyAuthBlockedUntil__";

type DifyAuthBlockStore = Map<string, number>;

function getDifyAuthBlockStore(): DifyAuthBlockStore {
    const globalScope = globalThis as typeof globalThis & {
        [DIFY_AUTH_BLOCK_STORE_KEY]?: DifyAuthBlockStore;
    };
    if (!globalScope[DIFY_AUTH_BLOCK_STORE_KEY]) {
        globalScope[DIFY_AUTH_BLOCK_STORE_KEY] = new Map<string, number>();
    }
    return globalScope[DIFY_AUTH_BLOCK_STORE_KEY]!;
}

function normalizeHeaderValue(headers: RequestInit["headers"], key: string) {
    if (!headers) return null;
    const normalized = new Headers(headers);
    const value = normalized.get(key);
    return value && value.trim() ? value.trim() : null;
}

function getAuthFingerprint(init: RequestInit) {
    const authorization = normalizeHeaderValue(init.headers, "authorization");
    if (!authorization) return null;
    return authorization;
}

function markAuthTemporarilyBlocked(authFingerprint: string, context: { url: string; reason: string }) {
    const blockedUntil = Date.now() + DIFY_AUTH_BLOCK_WINDOW_MS;
    getDifyAuthBlockStore().set(authFingerprint, blockedUntil);
    console.warn("dify.auth.temporarily_blocked", {
        url: context.url,
        reason: context.reason,
        blockedUntil,
    });
}

function isAuthTemporarilyBlocked(authFingerprint: string) {
    const blockedUntil = getDifyAuthBlockStore().get(authFingerprint);
    if (!blockedUntil) return false;
    if (blockedUntil <= Date.now()) {
        getDifyAuthBlockStore().delete(authFingerprint);
        return false;
    }
    return true;
}

function createAuthBlockedResponse() {
    return new Response(
        JSON.stringify({
            code: "upstream_credential_temporarily_blocked",
            message: "Upstream credential temporarily blocked after unauthorized response",
            status: 503,
        }),
        {
            status: 503,
            headers: {
                "Content-Type": "application/json",
            },
        },
    );
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
    const authFingerprint = getAuthFingerprint(init);
    if (authFingerprint && isAuthTemporarilyBlocked(authFingerprint)) {
        return createAuthBlockedResponse();
    }

    for (let attempt = 0; attempt <= DIFY_FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            const response = await fetch(input, init);
            if (response.status === 401 && authFingerprint) {
                markAuthTemporarilyBlocked(authFingerprint, {
                    url: input,
                    reason: "unauthorized",
                });
            }
            return response;
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
    const authFingerprint = getAuthFingerprint(init);
    if (authFingerprint && isAuthTemporarilyBlocked(authFingerprint)) {
        return createAuthBlockedResponse();
    }

    const response = await fetch(input, init);
    if (response.status === 401 && authFingerprint) {
        markAuthTemporarilyBlocked(authFingerprint, {
            url: input,
            reason: "unauthorized",
        });
    }
    return response;
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
