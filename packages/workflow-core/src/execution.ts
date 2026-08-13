import { compileWorkflowPlan, type CompiledWorkflowPlan } from "./compiler";
import type { WorkflowDefinitionEnvelope } from "./definition";
import type { WorkflowCapabilityPort, WorkflowClock, WorkflowRunEventSink, WorkflowRunRepository } from "./ports";
import { workflowNodeRegistry } from "./node-definitions/registry";

export interface WorkflowExecutionOptions {
  readonly runId: string;
  readonly ports: { readonly capability: WorkflowCapabilityPort; readonly repository?: WorkflowRunRepository; readonly events?: WorkflowRunEventSink; readonly clock?: WorkflowClock };
  readonly signal?: AbortSignal;
  readonly retryLimit?: number;
  readonly completed?: Readonly<Record<string, Record<string, unknown>>>;
}

export interface WorkflowExecutionResult {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "cancelled" | "interrupted";
  readonly outputs: Readonly<Record<string, Record<string, unknown>>>;
  readonly plan: CompiledWorkflowPlan;
  readonly error?: string;
}

export async function executeWorkflow(definition: WorkflowDefinitionEnvelope, options: WorkflowExecutionOptions): Promise<WorkflowExecutionResult> {
  const plan = compileWorkflowPlan(definition);
  const outputs: Record<string, Record<string, unknown>> = { ...(options.completed ?? {}) };
  const sequence = { value: 0 };
  await options.ports.repository?.create({ runId: options.runId, definition });
  await options.ports.repository?.updateStatus(options.runId, "running");
  await appendEvent(options, sequence, "run_started", { definitionHash: plan.definitionHash });
  try {
    const pending = new Map(plan.steps.filter((step) => !outputs[step.nodeKey]).map((step) => [step.nodeKey, step]));
    while (pending.size > 0) {
      throwIfCancelled(options.signal);
      const ready = [...pending.values()]
        .filter((step) => step.dependsOn.every((dependency) => Boolean(outputs[dependency])))
        .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
      if (!ready.length) throw new Error("workflow_dependency_unresolved");
      for (const step of ready) {
        const node = definition.nodes.find((candidate) => candidate.nodeKey === step.nodeKey)!;
        const executorId = workflowNodeRegistry.require(node.type).executorId;
        await appendEvent(options, sequence, "node_started", { nodeKey: node.nodeKey, executorId });
      }
      const results = await Promise.all(ready.map(async (step) => {
        const node = definition.nodes.find((candidate) => candidate.nodeKey === step.nodeKey)!;
        const executorId = workflowNodeRegistry.require(node.type).executorId;
        const inputs = collectInputs(definition, node.nodeKey, outputs);
        try {
          const execution = executorId === "foreach"
            ? await executeForeach(definition, plan, node.nodeKey, node.config, inputs, outputs, options, sequence)
            : { output: await executeWithRetry(executorId, node.nodeKey, node.config, inputs, options), consumedNodeKeys: [] as const };
          return { step, executorId, ...execution } as const;
        } catch (error) {
          await appendEvent(options, sequence, "node_failed", { nodeKey: node.nodeKey, executorId, message: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }));
      for (const { step, executorId, output, consumedNodeKeys = [] } of results.sort((left, right) => left.step.nodeKey.localeCompare(right.step.nodeKey))) {
        outputs[step.nodeKey] = output;
        pending.delete(step.nodeKey);
        for (const nodeKey of consumedNodeKeys) pending.delete(nodeKey);
        await appendEvent(options, sequence, "node_succeeded", { nodeKey: step.nodeKey, executorId });
      }
    }
    await options.ports.repository?.updateStatus(options.runId, "succeeded");
    await appendEvent(options, sequence, "run_succeeded", { nodeCount: plan.steps.length });
    return { runId: options.runId, status: "succeeded", outputs, plan };
  } catch (error) {
    const cancelled = options.signal?.aborted || (error instanceof Error && error.name === "AbortError");
    const status = cancelled ? "cancelled" : "failed";
    await options.ports.repository?.updateStatus(options.runId, status);
    await appendEvent(options, sequence, status === "cancelled" ? "run_cancelled" : "run_failed", { message: error instanceof Error ? error.message : String(error) });
    return { runId: options.runId, status, outputs, plan, error: error instanceof Error ? error.message : String(error) };
  }
}

async function executeWithRetry(executorId: string, nodeKey: string, config: Record<string, unknown>, inputs: Record<string, unknown>, options: WorkflowExecutionOptions, iteration?: { readonly key: string; readonly index: number; readonly item: unknown }) {
  const limit = Math.max(0, Math.min(5, options.retryLimit ?? 0));
  let attempt = 0;
  while (true) {
    throwIfCancelled(options.signal);
    try { return await options.ports.capability.execute({ executorId, nodeKey, config, inputs, ...(iteration ? { iteration } : {}) }, options.signal ?? new AbortController().signal); }
    catch (error) { if (attempt >= limit) throw error; attempt += 1; }
  }
}

type ForeachExecution = { readonly output: Record<string, unknown>; readonly consumedNodeKeys: readonly string[] };

async function executeForeach(
  definition: WorkflowDefinitionEnvelope,
  plan: CompiledWorkflowPlan,
  foreachNodeKey: string,
  config: Record<string, unknown>,
  inputs: Record<string, unknown>,
  completed: Record<string, Record<string, unknown>>,
  options: WorkflowExecutionOptions,
  sequence: { value: number },
): Promise<ForeachExecution> {
  const inputKind = String(config.inputPortId ?? "image").includes("asset") ? "asset" : "image";
  const resolved = await executeWithRetry("foreach", foreachNodeKey, config, inputs, options);
  const items = extractIterationItems(resolved, inputs, inputKind);
  const collectNode = findCollectNode(definition, foreachNodeKey, typeof config.collectNodeKey === "string" ? config.collectNodeKey : "");
  if (!collectNode) throw new Error("workflow_foreach_collect_required");
  const bodyNodeKeys = findForeachBody(definition, foreachNodeKey, collectNode.nodeKey);
  const bodySteps = plan.steps.filter((step) => bodyNodeKeys.has(step.nodeKey)).sort((left, right) => plan.steps.indexOf(left) - plan.steps.indexOf(right));
  const concurrency = Math.max(1, Math.min(6, Number(config.concurrency ?? 1)) || 1);
  const failurePolicy = config.failurePolicy === "fail_fast" ? "fail_fast" : "continue";
  const iterationOutputs = await mapWithConcurrency(items.slice(0, Math.max(1, Math.min(100, Number(config.maxIterations ?? 20) || 20))), concurrency, async (item, index) => {
    throwIfCancelled(options.signal);
    const iterationKey = `${inputKind}-${index + 1}`;
    const localOutputs: Record<string, Record<string, unknown>> = {
      ...completed,
      [foreachNodeKey]: { [inputKind]: item, [`item.${inputKind}`]: item },
    };
    try {
      for (const step of bodySteps) {
        throwIfCancelled(options.signal);
        const node = definition.nodes.find((candidate) => candidate.nodeKey === step.nodeKey)!;
        const executorId = workflowNodeRegistry.require(node.type).executorId;
        const nodeInputs = collectInputs(definition, node.nodeKey, localOutputs);
        await appendEvent(options, sequence, "node_started", { nodeKey: node.nodeKey, executorId, iterationKey, iterationIndex: index });
        try {
          localOutputs[node.nodeKey] = await executeWithRetry(executorId, node.nodeKey, node.config, nodeInputs, options, { key: iterationKey, index, item });
          await appendEvent(options, sequence, "node_succeeded", { nodeKey: node.nodeKey, executorId, iterationKey, iterationIndex: index });
        } catch (error) {
          await appendEvent(options, sequence, "node_failed", { nodeKey: node.nodeKey, executorId, iterationKey, iterationIndex: index, message: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }
      return localOutputs;
    } catch (error) {
      if (failurePolicy === "fail_fast") throw error;
      return null;
    }
  });
  const successful = iterationOutputs.filter((value): value is Record<string, Record<string, unknown>> => value !== null);
  const collectInputsByPort: Record<string, unknown[]> = {};
  for (const edge of definition.edges.filter((candidate) => candidate.targetNodeKey === collectNode.nodeKey)) {
    for (const localOutputs of successful) {
      const value = localOutputs[edge.sourceNodeKey]?.[edge.sourcePortId];
      if (value !== undefined) (collectInputsByPort[edge.targetPortId] ??= []).push(value);
    }
  }
  const collectExecutor = workflowNodeRegistry.require(collectNode.type).executorId;
  await appendEvent(options, sequence, "node_started", { nodeKey: collectNode.nodeKey, executorId: collectExecutor });
  const output = await executeWithRetry(collectExecutor, collectNode.nodeKey, collectNode.config, collectInputsByPort, options);
  await appendEvent(options, sequence, "node_succeeded", { nodeKey: collectNode.nodeKey, executorId: collectExecutor });
  completed[collectNode.nodeKey] = output;
  return { output, consumedNodeKeys: [collectNode.nodeKey, ...bodyNodeKeys] };
}

function extractIterationItems(resolved: Record<string, unknown>, inputs: Record<string, unknown>, inputKind: "asset" | "image") {
  const candidates = [resolved[`${inputKind}s`], resolved[inputKind], resolved[`items.${inputKind}`], inputs[`items.${inputKind}`], inputs[`${inputKind}s`], inputs[inputKind]];
  return (candidates.find(Array.isArray) ?? []) as unknown[];
}

function findCollectNode(definition: WorkflowDefinitionEnvelope, foreachNodeKey: string, requested: string) {
  if (requested) return definition.nodes.find((node) => node.nodeKey === requested && node.type === "collect");
  const body = findForeachBody(definition, foreachNodeKey, "");
  return definition.nodes.find((node) => node.type === "collect" && body.has(node.nodeKey));
}

function findForeachBody(definition: WorkflowDefinitionEnvelope, foreachNodeKey: string, collectNodeKey: string) {
  const children = new Map<string, string[]>();
  for (const edge of definition.edges) children.set(edge.sourceNodeKey, [...(children.get(edge.sourceNodeKey) ?? []), edge.targetNodeKey]);
  const body = new Set<string>();
  const queue = [...(children.get(foreachNodeKey) ?? [])];
  while (queue.length) {
    const nodeKey = queue.shift()!;
    if (nodeKey === collectNodeKey || body.has(nodeKey)) continue;
    const node = definition.nodes.find((candidate) => candidate.nodeKey === nodeKey);
    if (!node || node.type === "collect") continue;
    body.add(nodeKey); queue.push(...(children.get(nodeKey) ?? []));
  }
  return body;
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, callback: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => { while (true) { const index = next++; if (index >= items.length) return; results[index] = await callback(items[index], index); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()));
  return results;
}

function collectInputs(definition: WorkflowDefinitionEnvelope, nodeKey: string, outputs: Record<string, Record<string, unknown>>) {
  const inputs: Record<string, unknown> = {};
  for (const edge of definition.edges.filter((candidate) => candidate.targetNodeKey === nodeKey)) {
    const value = outputs[edge.sourceNodeKey]?.[edge.sourcePortId];
    if (value === undefined) continue;
    if (inputs[edge.targetPortId] === undefined) inputs[edge.targetPortId] = value;
    else inputs[edge.targetPortId] = Array.isArray(inputs[edge.targetPortId]) ? [...(inputs[edge.targetPortId] as unknown[]), value] : [inputs[edge.targetPortId], value];
  }
  return inputs;
}

async function appendEvent(options: WorkflowExecutionOptions, sequence: { value: number }, type: string, payload: Record<string, unknown>) {
  sequence.value += 1;
  await options.ports.events?.append({ runId: options.runId, sequence: sequence.value, type, payload });
}

function throwIfCancelled(signal?: AbortSignal) { if (signal?.aborted) { const error = new Error("workflow_cancelled"); error.name = "AbortError"; throw error; } }
