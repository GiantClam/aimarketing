export interface TauriBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
}

type TauriWindow = Window & { __TAURI__?: { core?: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> }; event?: { listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> } } };

export const tauriBridge: TauriBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>) {
    const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
    return invoke ? invoke<T>(command, args) : Promise.reject(new Error("tauri_bridge_unavailable"));
  },
  listen<T>(event: string, handler: (payload: T) => void) {
    const listen = (window as TauriWindow).__TAURI__?.event?.listen;
    return listen ? listen<T>(event, (value) => handler(value.payload)) : Promise.reject(new Error("tauri_bridge_unavailable"));
  },
};
