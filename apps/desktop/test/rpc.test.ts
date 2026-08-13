import test from "node:test";
import assert from "node:assert/strict";
import { decodeRpcFrame, encodeRpcMessage } from "../runtime/rpc";

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

test("RPC framing rejects malformed prefixes and preserves the next valid frame", () => {
  assert.throws(() => decodeRpcFrame('1x:{"version":1}'), /invalid_rpc_frame/);
  assert.throws(() => decodeRpcFrame('8388609:{}'), /runtime_message_too_large/);

  const frame = encodeRpcMessage({ version: 1, requestId: "next", type: "health", payload: {} }).trim();
  assert.equal(decodeRpcFrame(frame).requestId, "next");
});
