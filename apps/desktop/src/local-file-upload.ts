export const LOCAL_ATTACHMENT_CHUNK_BYTES = 256 * 1024;

export type LocalFileBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

export type LocalFileUploadResult = {
  relativePath: string;
  byteLength: number;
};

export function localFileUploadErrorCode(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "";
}

/**
 * WebView2 does not consistently expose File.stream(), so upload Blob slices
 * in bounded IPC messages instead of relying on a ReadableStream.
 */
export async function persistLocalFile(file: File, bridge: LocalFileBridge): Promise<LocalFileUploadResult> {
  let createdPath: string | undefined;
  try {
    const created = await bridge.invoke<{ relativePath: string }>("begin_local_attachment", { fileName: file.name, byteLength: file.size });
    createdPath = created.relativePath;
    for (let offset = 0; offset < file.size; offset += LOCAL_ATTACHMENT_CHUNK_BYTES) {
      const chunk = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + LOCAL_ATTACHMENT_CHUNK_BYTES)).arrayBuffer());
      if (!chunk.length) continue;
      await bridge.invoke("append_local_attachment_chunk", { relativePath: created.relativePath, offset, bytes: Array.from(chunk) });
    }
    return bridge.invoke<LocalFileUploadResult>("finish_local_attachment", { relativePath: created.relativePath, expectedByteLength: file.size });
  } catch (error) {
    if (createdPath) await bridge.invoke("abort_local_attachment", { relativePath: createdPath }).catch(() => undefined);
    throw error;
  }
}
