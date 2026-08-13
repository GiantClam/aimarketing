import test from "node:test";
import assert from "node:assert/strict";
import { encodeRpcMessage } from "../runtime/rpc";

test("RPC framing is byte-counted UTF-8", () => {
  const frame = encodeRpcMessage({ version: 1, requestId: "测试", type: "health", payload: {} });
  const separator = frame.indexOf(":");
  const body = frame.slice(separator + 1, -1);
  assert.equal(Number(frame.slice(0, separator)), Buffer.byteLength(body, "utf8"));
  assert.equal(JSON.parse(body).requestId, "测试");
});

test("RPC framing rejects oversized payloads", () => {
  assert.throws(() => encodeRpcMessage({ data: "x".repeat(8 * 1024 * 1024) }), /runtime_message_too_large/);
});
