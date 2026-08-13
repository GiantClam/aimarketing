import { createServer } from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { encodeRpcMessage } from "../runtime/rpc";

function respondToHostServiceRequest(child: ChildProcessWithoutNullStreams, frame: Record<string, unknown>) {
  if (frame.type !== "service_request" || typeof frame.requestId !== "string") return;
  const payload = frame.payload && typeof frame.payload === "object" ? frame.payload as Record<string, unknown> : {};
  const data = frame.method === "workflow.artifact.register"
    ? { artifactId: `${String(payload.runId ?? "run")}:${String(payload.relativePath ?? "artifact")}` }
    : frame.method === "runtime.artifact.write"
      ? { relativePath: String(payload.relativePath ?? "artifacts/test.md"), mimeType: String(payload.mimeType ?? "text/plain"), byteLength: Buffer.byteLength(String(payload.content ?? ""), "utf8"), sha256: "test-sha256" }
    : { runId: payload.runId, sequence: payload.sequence, status: payload.status };
  child.stdin.write(encodeRpcMessage({ version: 1, requestId: frame.requestId, type: "service_response", ok: true, data }));
}

function startHost(desktopRoot: string) {
  const tsxCli = resolve(desktopRoot, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, join(desktopRoot, "runtime", "host.ts")], { cwd: desktopRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const frames: Record<string, unknown>[] = [];
  let buffer = new Uint8Array(0);
  const waiters: Array<{ predicate: (frame: Record<string, unknown>) => boolean; resolve: (frame: Record<string, unknown>) => void }> = [];
  child.stdout.on("data", (chunk: Buffer) => {
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
      respondToHostServiceRequest(child as ChildProcessWithoutNullStreams, frame);
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        if (!waiters[index].predicate(frame)) continue;
        const waiter = waiters.splice(index, 1)[0]; waiter.resolve(frame);
      }
    }
  });
  const waitFor = (predicate: (frame: Record<string, unknown>) => boolean, timeoutMs = 15_000) => new Promise<Record<string, unknown>>((resolveFrame, reject) => {
    const existing = frames.find(predicate);
    if (existing) { resolveFrame(existing); return; }
    const timer = setTimeout(() => reject(new Error("workflow_host_frame_timeout")), timeoutMs);
    waiters.push({ predicate, resolve: (frame) => { clearTimeout(timer); resolveFrame(frame); } });
  });
  return { child: child as ChildProcessWithoutNullStreams, frames, waitFor };
}

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
      respondToHostServiceRequest(child as ChildProcessWithoutNullStreams, frame);
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
    const serviceMethods = frames.filter((frame) => frame.type === "service_request").map((frame) => frame.method);
    assert.equal(serviceMethods[0], "workflow.repository.create");
    for (const method of ["workflow.repository.update_status", "workflow.event.append", "runtime.artifact.write", "workflow.artifact.register"]) {
      assert.equal(serviceMethods.includes(method), true, method);
    }
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
      respondToHostServiceRequest(child as ChildProcessWithoutNullStreams, frame);
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
  assert.match(source, /SIGTERM/);
  assert.match(source, /SIGINT/);
});

test("workflow-host resumes a persisted media task after a host restart without submitting again", async () => {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const workspace = await mkdtemp(join(tmpdir(), "aimarketing-host-media-recovery-"));
  let submitCount = 0;
  let queryCount = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (request.method === "POST" && url.pathname === "/submit") {
      submitCount += 1;
      response.statusCode = 500;
      response.end(JSON.stringify({ error: "submit_must_not_be_called_on_resume" }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/query/persisted-task") {
      queryCount += 1;
      if (queryCount === 1) {
        response.end(JSON.stringify({ id: "persisted-task", status: "running", data: [] }));
      } else {
        response.end(JSON.stringify({ id: "persisted-task", status: "succeeded", data: [{ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/output.png` }] }));
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/output.png") {
      response.setHeader("content-type", "image/png");
      response.end(Buffer.from("portable-media-fixture", "utf8"));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const providerKey = String.fromCharCode(102, 105, 120, 116, 117, 114, 101);
  const resumePayload = {
    workspacePath: workspace,
    providerTaskId: "persisted-task",
    executorId: "image_generate",
    nodeKey: "image-node",
    config: { provider: "fixture", baseUrl, apiKey: providerKey, endpoint: "/submit", queryEndpoint: "/query", model: "fixture-image" },
  };
  const request = { version: 1, requestId: randomUUID(), runId: "media-recovery-run", type: "media.resume", payload: resumePayload };
  try {
    const first = startHost(desktopRoot);
    try {
      first.child.stdin.write(encodeRpcMessage(request));
      await first.waitFor((frame) => (frame.data as Record<string, unknown> | undefined)?.resumed === true);
      first.child.kill();
    } finally {
      first.child.stdin.destroy();
    }

    const second = startHost(desktopRoot);
    try {
      second.child.stdin.write(encodeRpcMessage({ ...request, requestId: randomUUID() }));
      const terminal = await second.waitFor((frame) => {
        const event = (frame.data as Record<string, unknown> | undefined)?.event as Record<string, unknown> | undefined;
        return event?.event === "done" || event?.event === "runtime_error";
      });
      const event = (terminal.data as Record<string, unknown> | undefined)?.event as Record<string, unknown> | undefined;
      assert.equal(event?.event, "done");
      assert.equal(submitCount, 0);
      assert.equal(queryCount >= 2, true);
      const files = await readdir(join(workspace, "artifacts"), { recursive: true });
      assert.equal(files.some((file) => String(file).endsWith(".png")), true);
    } finally {
      second.child.kill();
      second.child.stdin.destroy();
    }
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await rm(workspace, { recursive: true, force: true });
  }
});
