import assert from "node:assert/strict";
import test from "node:test";
import { isTauriBridgeAvailable, tauriBridge } from "../src/tauri";

test("detects whether the Tauri invoke bridge is available", () => {
  const originalWindow = globalThis.window;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    assert.equal(isTauriBridgeAvailable(), false);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { __TAURI__: { core: { invoke: async () => undefined } } },
    });
    assert.equal(isTauriBridgeAvailable(), true);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("normalizes message writes to UIMessage parts and metadata before Tauri IPC", async () => {
  const originalWindow = globalThis.window;
  let received: Record<string, unknown> | undefined;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { __TAURI__: { core: { invoke: async (_command: string, args?: Record<string, unknown>) => { received = args; return undefined; } } } } });
    await tauriBridge.invoke("append_message", { input: { id: "m1", conversation_id: "c1", role: "user", content: "你好", parts_json: JSON.stringify([{ id: "text-1", type: "text", text: "你好" }]), created_at: "2026-08-26T00:00:00Z" } });
    const input = received?.input as Record<string, unknown>;
    assert.equal(typeof input.metadata_json, "string");
    assert.match(String(input.parts_json), /"type":"text"/u);
    assert.doesNotMatch(String(input.parts_json), /"id":"text-1"/u);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
