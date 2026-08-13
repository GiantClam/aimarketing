import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { encodeRpcMessage } from "../runtime/rpc";

test("workflow-host creates a stable session mapping through RPC", async () => {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const tsxCli = resolve(desktopRoot, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, join(desktopRoot, "runtime", "host.ts")], { cwd: desktopRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const response = await new Promise<Record<string, unknown>>((resolveResponse, reject) => {
    let buffer = new Uint8Array(0);
    const onData = (chunk: Buffer) => {
      const next = new Uint8Array(buffer.length + chunk.length); next.set(buffer); next.set(chunk, buffer.length); buffer = next;
      const separator = buffer.indexOf(58); if (separator < 1) return;
      const size = Number.parseInt(Buffer.from(buffer.subarray(0, separator)).toString("ascii"), 10); const end = separator + 1 + size;
      if (end > buffer.length) return;
      child.stdout.off("data", onData); resolveResponse(JSON.parse(Buffer.from(buffer.subarray(separator + 1, end)).toString("utf8")) as Record<string, unknown>);
    };
    child.stdout.on("data", onData); child.once("error", reject);
    child.stdin.end(encodeRpcMessage({ version: 1, requestId: randomUUID(), type: "session.create", payload: { conversationId: "conversation-1", workspacePath: desktopRoot } }));
  });
  child.kill();
  assert.equal(response.ok, true);
  assert.equal((response.data as Record<string, unknown>).conversationId, "conversation-1");
  assert.equal(typeof (response.data as Record<string, unknown>).sessionId, "string");
  assert.equal((response.data as Record<string, unknown>).transport, "opencode-serve");
  assert.equal((response.data as Record<string, unknown>).fullAccess, true);
});

test("workflow-host executes a v2 local file workflow and streams node lifecycle events", async () => {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const tsxCli = resolve(desktopRoot, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
  const workspace = await mkdtemp(join(tmpdir(), "aimarketing-host-workflow-"));
  const child = spawn(process.execPath, [tsxCli, join(desktopRoot, "runtime", "host.ts")], { cwd: desktopRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const frames: Record<string, unknown>[] = [];
  let buffer: Uint8Array = new Uint8Array(0);
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolveDonePromise) => { resolveDone = resolveDonePromise; });
  const onData = (chunk: Buffer) => {
    buffer = Uint8Array.from([...buffer, ...chunk]);
    while (true) {
      const view = Buffer.from(buffer);
      const separator = view.indexOf(58);
      if (separator < 1) return;
      const size = Number.parseInt(view.subarray(0, separator).toString("ascii"), 10);
      const end = separator + 1 + size;
      if (!Number.isFinite(size) || end > buffer.length) return;
      const frame = JSON.parse(view.subarray(separator + 1, end).toString("utf8")) as Record<string, unknown>;
      frames.push(frame); buffer = buffer.subarray(end);
      const event = (frame.data as Record<string, unknown> | undefined)?.event as Record<string, unknown> | undefined;
      if (event?.event === "done" || event?.event === "runtime_error") resolveDone?.();
    }
  };
  child.stdout.on("data", onData);
  try {
    const runId = `workflow-${randomUUID()}`;
    child.stdin.write(encodeRpcMessage({ version: 1, requestId: randomUUID(), runId, type: "workflow.run", payload: {
      workspacePath: workspace,
      definition: {
        schemaVersion: 2, revision: 1, definitionHash: "",
        nodes: [
          { nodeKey: "input", type: "text_input", nodeVersion: 1, title: "Input", positionX: 0, positionY: 0, config: { text: "hello" } },
          { nodeKey: "file", type: "file_create", nodeVersion: 1, title: "File", positionX: 1, positionY: 0, config: { fileName: "hello.md", fileFormat: "md" } },
          { nodeKey: "output", type: "output", nodeVersion: 1, title: "Output", positionX: 2, positionY: 0, config: {} },
        ],
        edges: [
          { edgeKey: "input-file", sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: "file", targetPortId: "text" },
          { edgeKey: "file-output", sourceNodeKey: "file", sourcePortId: "asset", targetNodeKey: "output", targetPortId: "assets" },
        ],
      },
    } }));
    await Promise.race([done, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("workflow_host_timeout")), 15_000))]);
    const events = frames.map((frame) => (frame.data as Record<string, unknown> | undefined)?.event as Record<string, unknown> | undefined).filter(Boolean) as Record<string, unknown>[];
    assert.equal(events.some((event) => event.event === "done"), true);
    assert.equal(events.some((event) => event.tool === "workflow:node_started"), true);
    assert.equal(events.some((event) => event.tool === "artifact:file"), true);
  } finally {
    child.kill();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("workflow-host expands foreach items instead of passing one array to the body", async () => {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const tsxCli = resolve(desktopRoot, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
  const workspace = await mkdtemp(join(tmpdir(), "aimarketing-host-foreach-"));
  const child = spawn(process.execPath, [tsxCli, join(desktopRoot, "runtime", "host.ts")], { cwd: desktopRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let buffer: Uint8Array = new Uint8Array(0); const events: Record<string, unknown>[] = []; let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolveDonePromise) => { resolveDone = resolveDonePromise; });
  child.stdout.on("data", (chunk: Buffer) => {
    buffer = Uint8Array.from([...buffer, ...chunk]);
    while (true) {
      const view = Buffer.from(buffer);
      const separator = view.indexOf(58); if (separator < 1) return;
      const size = Number.parseInt(view.subarray(0, separator).toString("ascii"), 10); const end = separator + 1 + size;
      if (!Number.isFinite(size) || end > buffer.length) return;
      const frame = JSON.parse(view.subarray(separator + 1, end).toString("utf8")) as Record<string, unknown>; buffer = buffer.subarray(end);
      const event = (frame.data as Record<string, unknown> | undefined)?.event as Record<string, unknown> | undefined;
      if (event) events.push(event);
      if (event?.event === "done" || event?.event === "runtime_error") resolveDone?.();
    }
  });
  try {
    child.stdin.write(encodeRpcMessage({ version: 1, requestId: randomUUID(), runId: "foreach-host-run", type: "workflow.run", payload: {
      workspacePath: workspace,
      definition: {
        schemaVersion: 2, revision: 1, definitionHash: "",
        nodes: [
          { nodeKey: "upload", type: "upload", nodeVersion: 1, title: "Upload", positionX: 0, positionY: 0, config: { uploadedFiles: ["a", "b", "c"] } },
          { nodeKey: "foreach", type: "foreach", nodeVersion: 1, title: "For Each", positionX: 1, positionY: 0, config: { inputPortId: "asset", collectNodeKey: "collect", concurrency: 2, maxIterations: 10, failurePolicy: "fail_fast" } },
          { nodeKey: "body", type: "output", nodeVersion: 1, title: "Body", positionX: 2, positionY: 0, config: {} },
          { nodeKey: "collect", type: "collect", nodeVersion: 1, title: "Collect", positionX: 3, positionY: 0, config: {} },
        ],
        edges: [
          { edgeKey: "upload-foreach", sourceNodeKey: "upload", sourcePortId: "asset", targetNodeKey: "foreach", targetPortId: "items.asset" },
          { edgeKey: "foreach-body", sourceNodeKey: "foreach", sourcePortId: "item.asset", targetNodeKey: "body", targetPortId: "assets" },
          { edgeKey: "body-collect", sourceNodeKey: "body", sourcePortId: "assets", targetNodeKey: "collect", targetPortId: "items.asset" },
        ],
      },
    } }));
    await Promise.race([done, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("workflow_host_foreach_timeout")), 15_000))]);
    assert.equal(events.some((event) => event.event === "done"), true);
    assert.equal(events.filter((event) => event.tool === "workflow:node_started").length >= 3, true);
  } finally {
    child.kill();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("workflow-host routes persisted provider tasks through workflow-core recovery", () => {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const source = readFileSync(join(desktopRoot, "runtime", "host.ts"), "utf8");
  assert.match(source, /function readWorkflowRecovery/);
  assert.match(source, /recovering: readWorkflowRecovery\(command\.payload\?\.recovering\)/);
  assert.match(source, /resume: async \(\{ executorId, nodeKey, config, inputs, providerTaskId \}, signal\)/);
  assert.match(source, /runMediaCapability\(command, runId, nodeKey, executorId, config, inputs, workspacePath, signal, providerTaskId\)/);
  assert.match(source, /recoveryDefinitionHash/);
  assert.match(source, /completed: command\.payload\.completed/);
  assert.match(source, /run\.emergency_stop/);
  assert.match(source, /tool: "run:emergency_stop"/);
});
