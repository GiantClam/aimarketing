import { createInterface } from "node:readline";
import { MAX_RUNTIME_MESSAGE_BYTES, type RuntimeCommand, type RuntimeResponse } from "@aimarketing/runtime-contracts";

export function encodeRpcMessage(value: unknown) {
  const body = JSON.stringify(value);
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > MAX_RUNTIME_MESSAGE_BYTES) throw new Error("runtime_message_too_large");
  return `${bytes}:${body}\n`;
}

export function createRpcReader(input: NodeJS.ReadableStream, onMessage: (command: RuntimeCommand) => void, onError: (error: Error) => void) {
  let buffer = "";
  const reader = createInterface({ input });
  reader.on("line", (line) => {
    if (!line && !buffer) return;
    buffer += line;
    try {
      const separator = buffer.indexOf(":");
      if (separator <= 0) throw new Error("invalid_rpc_frame");
      const size = Number.parseInt(buffer.slice(0, separator), 10);
      const payload = buffer.slice(separator + 1);
      if (!Number.isSafeInteger(size) || size < 2 || Buffer.byteLength(payload, "utf8") !== size) throw new Error("incomplete_rpc_frame");
      onMessage(JSON.parse(payload) as RuntimeCommand); buffer = "";
    } catch (error) { onError(error instanceof Error ? error : new Error(String(error))); }
  });
  return reader;
}

export function writeRpcResponse(output: NodeJS.WritableStream, response: RuntimeResponse) { output.write(encodeRpcMessage(response)); }
