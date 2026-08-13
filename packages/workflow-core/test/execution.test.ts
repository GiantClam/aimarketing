import test from "node:test";
import assert from "node:assert/strict";
import { executeWorkflow, type WorkflowDefinitionEnvelope } from "../src/index";

const definition: WorkflowDefinitionEnvelope = { schemaVersion: 2, revision: 1, definitionHash: "", nodes: [
  { nodeKey: "input", type: "text_input", nodeVersion: 1, title: "Text", positionX: 0, positionY: 0, config: { text: "hello" } },
  { nodeKey: "writer", type: "writer", nodeVersion: 1, title: "Writer", positionX: 1, positionY: 0, config: {} },
], edges: [{ edgeKey: "e1", sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: "writer", targetPortId: "text" }] };

test("workflow execution propagates ports and emits ordered events", async () => {
  const calls: string[] = []; const events: number[] = [];
  const result = await executeWorkflow(definition, { runId: "run-1", ports: { capability: { execute: async ({ executorId, inputs }) => { calls.push(`${executorId}:${JSON.stringify(inputs)}`); return executorId === "text_input" ? { text: "hello" } : { text: "done" }; } }, events: { append: async (event) => events.push(event.sequence) } } });
  assert.equal(result.status, "succeeded"); assert.equal(calls[1], 'writer:{"text":"hello"}'); assert.deepEqual(events, [1, 2, 3, 4, 5, 6]);
});

test("workflow cancellation returns cancelled without executing remaining nodes", async () => {
  const controller = new AbortController(); controller.abort();
  const result = await executeWorkflow(definition, { runId: "run-2", signal: controller.signal, ports: { capability: { execute: async () => ({}) } } });
  assert.equal(result.status, "cancelled");
});

test("workflow executes independent DAG levels concurrently and emits deterministic node events", async () => {
  const parallelDefinition: WorkflowDefinitionEnvelope = { schemaVersion: 2, revision: 1, definitionHash: "", nodes: [
    { nodeKey: "input", type: "text_input", nodeVersion: 1, title: "Text", positionX: 0, positionY: 0, config: { text: "hello" } },
    { nodeKey: "writer-a", type: "writer", nodeVersion: 1, title: "Writer A", positionX: 1, positionY: 0, config: {} },
    { nodeKey: "writer-b", type: "writer", nodeVersion: 1, title: "Writer B", positionX: 1, positionY: 1, config: {} },
  ], edges: [
    { edgeKey: "a", sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: "writer-a", targetPortId: "text" },
    { edgeKey: "b", sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: "writer-b", targetPortId: "text" },
  ] };
  let active = 0; let peak = 0; const events: string[] = [];
  const result = await executeWorkflow(parallelDefinition, { runId: "parallel-run", ports: {
    capability: { execute: async ({ executorId }) => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1; return executorId === "text_input" ? { text: "hello" } : { text: executorId }; } },
    events: { append: async (event) => { events.push(`${event.type}:${String(event.payload.nodeKey ?? "")}`); } },
  } });
  assert.equal(result.status, "succeeded");
  assert.equal(peak, 2);
  assert.deepEqual(events, ["run_started:", "node_started:input", "node_succeeded:input", "node_started:writer-a", "node_started:writer-b", "node_succeeded:writer-a", "node_succeeded:writer-b", "run_succeeded:"]);
});

test("workflow emits a node failure event before returning a failed run", async () => {
  const events: string[] = [];
  const result = await executeWorkflow(definition, { runId: "failed-run", ports: {
    capability: { execute: async ({ executorId }) => executorId === "writer" ? Promise.reject(new Error("provider_down")) : { text: "hello" } },
    events: { append: async (event) => { events.push(event.type); } },
  } });
  assert.equal(result.status, "failed");
  assert.ok(events.includes("node_failed"));
  assert.equal(events.at(-1), "run_failed");
});

test("workflow foreach executes its body with bounded concurrency and collects input order", async () => {
  const foreachDefinition: WorkflowDefinitionEnvelope = { schemaVersion: 2, revision: 1, definitionHash: "", nodes: [
    { nodeKey: "upload", type: "upload", nodeVersion: 1, title: "Upload", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "foreach", type: "foreach", nodeVersion: 1, title: "For Each", positionX: 1, positionY: 0, config: { inputPortId: "asset", collectNodeKey: "collect", concurrency: 2, maxIterations: 10, failurePolicy: "fail_fast" } },
    { nodeKey: "agent", type: "agent_execute", nodeVersion: 1, title: "Agent", positionX: 2, positionY: 0, config: {} },
    { nodeKey: "collect", type: "collect", nodeVersion: 1, title: "Collect", positionX: 3, positionY: 0, config: {} },
  ], edges: [
    { edgeKey: "upload-foreach", sourceNodeKey: "upload", sourcePortId: "asset", targetNodeKey: "foreach", targetPortId: "items.asset" },
    { edgeKey: "foreach-agent", sourceNodeKey: "foreach", sourcePortId: "item.asset", targetNodeKey: "agent", targetPortId: "asset" },
    { edgeKey: "agent-collect", sourceNodeKey: "agent", sourcePortId: "text", targetNodeKey: "collect", targetPortId: "items.text" },
  ] };
  let active = 0; let peak = 0;
  const result = await executeWorkflow(foreachDefinition, { runId: "foreach-run", ports: { capability: { execute: async ({ executorId, inputs }) => {
    if (executorId === "upload") return { assets: ["a", "b", "c"] };
    if (executorId === "foreach") return { assets: ["a", "b", "c"] };
    if (executorId === "agent_execute") { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 8)); active -= 1; return { text: `done-${String(inputs.asset)}` }; }
    return { text: inputs["items.text"] };
  } } } });
  assert.equal(result.status, "succeeded");
  assert.equal(peak, 2);
  assert.deepEqual(result.outputs.collect?.text, ["done-a", "done-b", "done-c"]);
});
