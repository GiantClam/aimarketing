import { desktopUIMessageStorage, workbenchMessageToDesktopUIMessage, type WorkbenchMessage } from "@aimarketing/workbench-client";

export interface TauriBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
}

type TauriWindow = Window & { __TAURI__?: { core?: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> }; event?: { listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> } } };

function normalizeMessageInvokeArgs(command: string, args?: Record<string, unknown>) {
  if (command !== "append_message" || !args?.input || typeof args.input !== "object") return args;
  const input = args.input as Record<string, unknown>;
  if (typeof input.metadata_json === "string") return args;
  let rawParts: unknown;
  try { rawParts = JSON.parse(typeof input.parts_json === "string" ? input.parts_json : "[]"); } catch { rawParts = []; }
  const message: WorkbenchMessage = {
    id: String(input.id ?? "message"),
    conversationId: String(input.conversation_id ?? ""),
    role: input.role === "user" || input.role === "assistant" ? input.role : "assistant",
    content: String(input.content ?? ""),
    createdAt: typeof input.created_at === "string" ? input.created_at : new Date().toISOString(),
    parts: Array.isArray(rawParts) ? rawParts as WorkbenchMessage["parts"] : undefined,
  };
  const normalized = desktopUIMessageStorage(workbenchMessageToDesktopUIMessage(message));
  return { ...args, input: { ...input, content: normalized.content, parts_json: normalized.parts_json, metadata_json: normalized.metadata_json } };
}

export function isTauriBridgeAvailable() {
  return typeof window !== "undefined" && typeof (window as TauriWindow).__TAURI__?.core?.invoke === "function";
}

export const tauriBridge: TauriBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>) {
    const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
    return invoke ? invoke<T>(command, normalizeMessageInvokeArgs(command, args)) : Promise.reject(new Error("tauri_bridge_unavailable"));
  },
  listen<T>(event: string, handler: (payload: T) => void) {
    const listen = (window as TauriWindow).__TAURI__?.event?.listen;
    return listen ? listen<T>(event, (value) => handler(value.payload)) : Promise.reject(new Error("tauri_bridge_unavailable"));
  },
};
