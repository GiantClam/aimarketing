import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_ATTACHMENT_CHUNK_BYTES, localFileUploadErrorCode, persistLocalFile, type LocalFileBridge } from "../src/local-file-upload";

function fakeFile(bytes: Uint8Array): File {
  return {
    name: "workflow-input.mp4",
    size: bytes.length,
    slice(start: number, end: number) {
      return { arrayBuffer: async () => bytes.slice(start, end).buffer };
    },
  } as File;
}

test("persists local workflow files through bounded Blob slices", async () => {
  const bytes = new Uint8Array(LOCAL_ATTACHMENT_CHUNK_BYTES * 2 + 19).fill(7);
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const bridge: LocalFileBridge = {
    async invoke<T>(command: string, args?: Record<string, unknown>) {
      calls.push({ command, args });
      if (command === "begin_local_attachment") return { relativePath: "attachments/input.mp4" } as T;
      if (command === "finish_local_attachment") return { relativePath: "attachments/input.mp4", byteLength: bytes.length } as T;
      return undefined as T;
    },
  };

  assert.deepEqual(await persistLocalFile(fakeFile(bytes), bridge), { relativePath: "attachments/input.mp4", byteLength: bytes.length });
  const chunks = calls.filter((call) => call.command === "append_local_attachment_chunk");
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((call) => call.args?.offset), [0, LOCAL_ATTACHMENT_CHUNK_BYTES, LOCAL_ATTACHMENT_CHUNK_BYTES * 2]);
  assert.ok(chunks.every((call) => Array.isArray(call.args?.bytes) && call.args.bytes.length <= LOCAL_ATTACHMENT_CHUNK_BYTES));
});

test("cleans up a partially uploaded file and preserves string-shaped Tauri errors", async () => {
  const calls: string[] = [];
  const bridge: LocalFileBridge = {
    async invoke<T>(command: string) {
      calls.push(command);
      if (command === "begin_local_attachment") return { relativePath: "attachments/input.mp4" } as T;
      if (command === "append_local_attachment_chunk") throw "attachment_too_large";
      return undefined as T;
    },
  };

  await assert.rejects(() => persistLocalFile(fakeFile(new Uint8Array([1])), bridge), (error) => localFileUploadErrorCode(error) === "attachment_too_large");
  assert.deepEqual(calls, ["begin_local_attachment", "append_local_attachment_chunk", "abort_local_attachment"]);
  assert.equal(localFileUploadErrorCode({ message: "attachment_too_large" }), "attachment_too_large");
});
