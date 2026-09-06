import { createInterface } from "node:readline";
import { MAX_RUNTIME_MESSAGE_BYTES, type RuntimeCommand, type RuntimeResponse } from "@coworkany/runtime-contracts";

export function encodeRpcMessage(value: unknown) {
  const body = JSON.stringify(value);
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > MAX_RUNTIME_MESSAGE_BYTES) throw new Error("runtime_message_too_large");
  return `${bytes}:${body}\n`;
}

export function decodeRpcFrame(frame: string): RuntimeCommand {
  const separator = frame.indexOf(":");
  if (separator <= 0) throw new Error("invalid_rpc_frame");
  const prefix = frame.slice(0, separator);
  if (!/^\d+$/.test(prefix)) throw new Error("invalid_rpc_frame");
  const size = Number(prefix);
  if (!Number.isSafeInteger(size) || size < 2) throw new Error("invalid_rpc_frame");
  if (size > MAX_RUNTIME_MESSAGE_BYTES) throw new Error("runtime_message_too_large");
  const payload = frame.slice(separator + 1);
  if (Buffer.byteLength(payload, "utf8") !== size) throw new Error("incomplete_rpc_frame");
  return JSON.parse(payload) as RuntimeCommand;
}

export function createRpcReader(input: NodeJS.ReadableStream, onMessage: (command: RuntimeCommand) => void, onError: (error: Error) => void) {
  const reader = createInterface({ input });
  reader.on("line", (line) => {
    if (!line) return;
    try {
      onMessage(decodeRpcFrame(line));
    } catch (error) { onError(error instanceof Error ? error : new Error(String(error))); }
  });
  return reader;
}

export function writeRpcResponse(output: NodeJS.WritableStream, response: RuntimeResponse) { output.write(encodeRpcMessage(response)); }

export function writeRpcServiceRequest(output: NodeJS.WritableStream, request: { readonly version: 1; readonly requestId: string; readonly type: "service_request"; readonly method: string; readonly payload?: Record<string, unknown> }) {
  output.write(encodeRpcMessage(request));
}
