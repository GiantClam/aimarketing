const MAX_LINE_BYTES = 2 * 1024 * 1024;
const MAX_DIAGNOSTIC_BYTES = 1024;
const MAX_TOOL_NAME_LENGTH = 80;

export type OpenCodeCommandInput = { readonly modelHint?: string | null };

export type OpenCodeRuntimeEvent =
  | { readonly event: "text_delta"; readonly delta: string; readonly runId: string }
  | { readonly event: "reasoning_delta"; readonly delta: string; readonly runId: string }
  | { readonly event: "tool_event"; readonly tool: string; readonly toolCallId?: string; readonly phase: "started" | "progress" | "completed" | "failed"; readonly message?: string; readonly runId: string }
  | { readonly event: "usage"; readonly provider?: string; readonly model?: string; readonly inputTokens?: number; readonly outputTokens?: number; readonly costUsd?: number; readonly runId: string }
  | { readonly event: "runtime_warning"; readonly code: string; readonly message: string; readonly runId: string }
  | { readonly event: "runtime_error"; readonly code: string; readonly message: string; readonly retryable: boolean; readonly runId: string }
  | { readonly event: "done"; readonly runId: string };

function safeDiagnostic(value: unknown, fallback: string) {
  const text = typeof value === "string"
    ? [...value].map((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? " " : character;
      }).join("").trim()
    : "";
  return (text || fallback).slice(0, MAX_DIAGNOSTIC_BYTES);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function readString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || null;
}

function readFiniteNumber(...values: unknown[]) {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? null;
}

function sanitizeToolName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return "tool";
  return name.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, MAX_TOOL_NAME_LENGTH) || "tool";
}

export interface OpenCodeServeModel {
  readonly providerID: string;
  readonly modelID: string;
}

export interface OpenCodeServeSessionPayloadInput {
  readonly title: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly agent?: string;
}

export interface OpenCodeServePromptPayloadInput {
  readonly prompt: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly variant?: string;
  readonly systemPrompt?: string;
  readonly agent?: string;
}

function openCodeServeModel(input: { readonly providerId?: string; readonly modelId?: string }): OpenCodeServeModel | undefined {
  const providerID = readString(input.providerId);
  const modelID = readString(input.modelId);
  return providerID && modelID ? { providerID, modelID } : undefined;
}

/** Build a directory-scoped OpenCode Serve session path without host URLs. */
export function openCodeServeSessionPath(sessionId: string, directory?: string, operation?: string) {
  const suffix = operation ? `/${encodeURIComponent(operation)}` : "";
  const query = directory === undefined ? "" : `?directory=${encodeURIComponent(directory)}`;
  return `/session/${encodeURIComponent(sessionId)}${suffix}${query}`;
}

/** Build the OpenCode Serve collection path for session creation/listing. */
export function openCodeServeSessionsPath(directory: string) {
  return `/session?directory=${encodeURIComponent(directory)}`;
}

export function createOpenCodeServeSessionPayload(input: OpenCodeServeSessionPayloadInput) {
  // OpenCode 1.17.x validates session creation strictly. Agent/model selection
  // belongs to the prompt payload; sending those fields (or platform metadata)
  // to POST /session makes the real server reject the request with HTTP 400.
  return { title: input.title };
}

export function createOpenCodeServePromptPayload(input: OpenCodeServePromptPayloadInput) {
  const model = openCodeServeModel(input);
  return {
    agent: input.agent || "build",
    ...(model ? { model } : {}),
    ...(readString(input.variant) ? { variant: readString(input.variant) } : {}),
    ...(input.systemPrompt === undefined ? {} : { system: input.systemPrompt }),
    parts: [{ type: "text" as const, text: input.prompt }],
  };
}

/** Read OpenCode's current and older `{ id }` / `{ data: { id } }` responses. */
export function readOpenCodeServeSessionId(payload: unknown) {
  const record = readRecord(payload);
  return readString(record?.id, readRecord(record?.data)?.id) ?? "";
}

export function buildOpenCodeCommand(input: OpenCodeCommandInput): { command: "opencode"; args: string[] } {
  const args = ["run", "--format", "json"];
  const modelHint = typeof input.modelHint === "string" ? input.modelHint.trim() : "";
  const normalizedModel = modelHint.includes("/")
    ? modelHint
    : /^deepseek(?:[-_.]|$)/iu.test(modelHint)
      ? `deepseek/${modelHint}`
      : modelHint === "gpt-5.4" || modelHint === "grok-4.5"
        ? `pptoken/${modelHint}`
        : /^minimax[-_]/iu.test(modelHint)
          ? `minimax/${modelHint}`
          : modelHint;
  if (normalizedModel) args.push("--model", normalizedModel.slice(0, 200));
  return { command: "opencode", args };
}

function parseEvent(runId: string, value: unknown): OpenCodeRuntimeEvent[] {
  const record = readRecord(value);
  if (!record) return [{ event: "runtime_warning", code: "unknown_event", message: "OpenCode emitted a non-object event.", runId }];

  const type = readString(record.type) || "unknown";
  const part = readRecord(record.part);
  const state = readRecord(part?.state);
  const error = readRecord(record.error);
  const partType = readString(part?.type)?.toLowerCase();

  if (type === "reasoning" || type === "thinking" || partType === "reasoning" || partType === "thinking") {
    const text = readString(part?.text, part?.reasoning, record.text, record.delta);
    return text ? [{ event: "reasoning_delta", delta: text, runId }] : [];
  }

  if (type === "text") {
    const text = readString(part?.text, record.text, record.delta);
    return text ? [{ event: "text_delta", delta: text, runId }] : [];
  }

  if (type === "tool_use") {
    const phaseValue = readString(state?.status, part?.status, record.status)?.toLowerCase();
    const phase = phaseValue === "error" || phaseValue === "failed"
      ? "failed"
      : phaseValue === "completed" || phaseValue === "success"
        ? "completed"
        : "started";
    const message = readString(state?.title, state?.message, part?.message, record.message);
    return [{
      event: "tool_event",
      tool: sanitizeToolName(readString(part?.tool, part?.name, record.tool, record.toolName)),
      phase,
      ...(message ? { message: safeDiagnostic(message, "") } : {}),
      runId,
    }];
  }

  if (type === "step_finish") {
    const tokens = readRecord(part?.tokens) || readRecord(record.tokens);
    const costUsd = readFiniteNumber(part?.cost, record.cost, part?.costUsd, record.costUsd);
    const inputTokens = readFiniteNumber(tokens?.input, tokens?.inputTokens, part?.inputTokens, record.inputTokens);
    const outputTokens = readFiniteNumber(tokens?.output, tokens?.outputTokens, part?.outputTokens, record.outputTokens);
    if (inputTokens === null && outputTokens === null && costUsd === null) return [];
    return [{
      event: "usage",
      ...(inputTokens === null ? {} : { inputTokens }),
      ...(outputTokens === null ? {} : { outputTokens }),
      ...(costUsd === null ? {} : { costUsd }),
      runId,
    }];
  }

  if (type === "error") {
    const errorData = readRecord(error?.data);
    const message = safeDiagnostic(readString(error?.message, errorData?.message, record.message, error?.name), "OpenCode runtime failed.");
    return [{ event: "runtime_error", code: "opencode_error", message, retryable: true, runId }];
  }

  if (type === "step_start") return [];
  return [{ event: "runtime_warning", code: "unknown_event", message: `Ignored OpenCode event type: ${safeDiagnostic(type, "unknown")}`, runId }];
}

export function createOpenCodeEventParser(runId: string) {
  let buffer = "";
  let malformedLines = 0;
  let finished = false;
  let fatal = false;

  const parseLine = (line: string): OpenCodeRuntimeEvent[] => {
    const normalized = line.trim();
    if (!normalized) return [];
    if (new TextEncoder().encode(normalized).byteLength > MAX_LINE_BYTES) {
      malformedLines += 1;
      const warning: OpenCodeRuntimeEvent = {
        event: "runtime_warning",
        code: malformedLines >= 3 ? "fatal_parse_error" : "oversized_line",
        message: "OpenCode emitted an oversized event line.",
        runId,
      };
      if (warning.code === "fatal_parse_error") fatal = true;
      return [warning];
    }

    try {
      const events = parseEvent(runId, JSON.parse(normalized));
      malformedLines = 0;
      return events;
    } catch {
      malformedLines += 1;
      const event: OpenCodeRuntimeEvent = malformedLines >= 3
        ? { event: "runtime_error", code: "fatal_parse_error", message: "OpenCode emitted too many malformed event lines.", retryable: false, runId }
        : { event: "runtime_warning", code: "malformed_json_line", message: "OpenCode emitted a malformed event line.", runId };
      if (event.event === "runtime_error") fatal = true;
      return [event];
    }
  };

  return {
    push(chunk: string) {
      if (finished || !chunk) return [] as OpenCodeRuntimeEvent[];
      buffer += chunk;
      if (new TextEncoder().encode(buffer).byteLength > MAX_LINE_BYTES * 2) {
        buffer = "";
        malformedLines += 1;
        const event: OpenCodeRuntimeEvent = malformedLines >= 3
          ? { event: "runtime_error", code: "fatal_parse_error", message: "OpenCode emitted too many malformed event lines.", retryable: false, runId }
          : { event: "runtime_warning", code: "oversized_line", message: "OpenCode emitted an oversized incomplete event line.", runId };
        if (event.event === "runtime_error") fatal = true;
        return [event];
      }

      const events: OpenCodeRuntimeEvent[] = [];
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        events.push(...parseLine(line));
        newlineIndex = buffer.indexOf("\n");
      }
      return events;
    },
    finish() {
      if (finished) return [] as OpenCodeRuntimeEvent[];
      finished = true;
      const events = buffer.trim() ? parseLine(buffer) : [];
      buffer = "";
      if (fatal || events.some((event) => event.event === "runtime_error" && event.code === "fatal_parse_error")) return events;
      events.push({ event: "done", runId });
      return events;
    },
  };
}

/** Mutable per-run state used while normalizing OpenCode's serve SSE schema. */
export interface OpenCodeServeEventState {
  readonly messageRoles: Map<string, string>;
  readonly textByPartId: Map<string, string>;
}

export interface OpenCodeServeEventResult {
  readonly sessionId: string;
  readonly messageId?: string;
  readonly messageRole?: string;
  readonly events: readonly OpenCodeRuntimeEvent[];
  readonly terminalError?: { readonly code: string; readonly message: string; readonly retryable: boolean };
}

export function createOpenCodeServeEventState(): OpenCodeServeEventState {
  return { messageRoles: new Map(), textByPartId: new Map() };
}

/**
 * Normalize one `opencode serve` SSE JSON payload. Hosts own transport and
 * run/session lookup; this shared code owns event shape, assistant deltas,
 * user-echo suppression, usage, tool lifecycle and terminal errors.
 */
export function normalizeOpenCodeServeEvent(
  runId: string,
  payload: unknown,
  state: OpenCodeServeEventState,
): OpenCodeServeEventResult {
  const envelope = readRecord(payload);
  const record = readRecord(envelope?.payload) ?? envelope;
  const properties = readRecord(record?.properties);
  const part = readRecord(properties?.part);
  const info = readRecord(properties?.info);
  // OpenCode has emitted both `sessionID` and `sessionId`, with the session
  // occasionally nested under the message metadata. Keep host routing tied to
  // this normalized value instead of duplicating a narrower parser per host.
  const sessionId = readString(properties?.sessionID, properties?.sessionId, part?.sessionID, part?.sessionId, info?.sessionID, info?.sessionId) ?? "";
  const messageId = readString(info?.id, part?.messageID, part?.messageId) ?? undefined;
  const messageRole = readString(info?.role) ?? undefined;
  const identity = { sessionId, ...(messageId ? { messageId } : {}), ...(messageRole ? { messageRole } : {}) };
  const type = readString(record?.type) ?? "";
  if (type === "message.updated") {
    const messageId = readString(info?.id);
    const role = readString(info?.role);
    if (messageId && role) state.messageRoles.set(messageId, role);
    return { ...identity, events: [] };
  }
  if (type === "session.error") {
    const error = readRecord(properties?.error);
    return {
      ...identity,
      events: [],
      terminalError: {
        code: "opencode_error",
        message: safeDiagnostic(readString(error?.message, properties?.error), "OpenCode session error."),
        retryable: true,
      },
    };
  }
  if (type === "message.part.delta") {
    // OpenCode streams visible text and model reasoning through the same event
    // type. Keep reasoning separate from the assistant response so the UI can
    // show it as process context without leaking it into the transcript.
    const field = readString(properties?.field)?.toLowerCase();
    const delta = readString(properties?.delta);
    const deltaMessageId = readString(properties?.messageID, properties?.messageId);
    const deltaPartId = readString(properties?.partID, properties?.partId) ?? deltaMessageId ?? "text";
    if (!delta || (deltaMessageId && state.messageRoles.get(deltaMessageId) === "user")) return { ...identity, events: [] };
    if (field === "reasoning" || field === "thinking" || field === "reasoning_content") {
      state.textByPartId.set(deltaPartId, `${state.textByPartId.get(deltaPartId) ?? ""}${delta}`);
      return { ...identity, ...(deltaMessageId ? { messageId: deltaMessageId } : {}), events: [{ event: "reasoning_delta", delta, runId }] };
    }
    if (field && field !== "text") return { ...identity, events: [] };
    const previous = state.textByPartId.get(deltaPartId) ?? "";
    state.textByPartId.set(deltaPartId, `${previous}${delta}`);
    return {
      ...identity,
      ...(deltaMessageId ? { messageId: deltaMessageId } : {}),
      events: [{ event: "text_delta", delta, runId }],
    };
  }
  if (type !== "message.part.updated" || !part) return { ...identity, events: [] };
  const partMessageId = readString(part.messageID, part.messageId);
  if (partMessageId && state.messageRoles.get(partMessageId) === "user") return { ...identity, events: [] };
  const partType = readString(part.type)?.toLowerCase();
  if (partType === "text") {
    const partId = readString(part.id, partMessageId) ?? "text";
    const text = typeof part.text === "string" ? part.text : "";
    const previous = state.textByPartId.get(partId) ?? "";
    const delta = text.startsWith(previous) ? text.slice(previous.length) : text;
    state.textByPartId.set(partId, text);
    return { ...identity, events: delta ? [{ event: "text_delta", delta, runId }] : [] };
  }
  if (partType === "reasoning" || partType === "thinking") {
    const partId = readString(part.id, partMessageId) ?? "reasoning";
    const text = typeof part.text === "string" ? part.text : typeof part.reasoning === "string" ? part.reasoning : "";
    const previous = state.textByPartId.get(partId) ?? "";
    const delta = text.startsWith(previous) ? text.slice(previous.length) : text;
    state.textByPartId.set(partId, text);
    return { ...identity, events: delta ? [{ event: "reasoning_delta", delta, runId }] : [] };
  }
  if (partType === "tool") {
    const partState = readRecord(part.state);
    const status = readString(partState?.status, part.status)?.toLowerCase();
    const phase = status === "error" || status === "failed"
      ? "failed"
      : status === "completed" || status === "success"
        ? "completed"
        : "started";
    const toolCallId = readString(part.id);
    const message = readString(partState?.title, partState?.message);
    return {
      ...identity,
      events: [{
        event: "tool_event",
        tool: sanitizeToolName(readString(part.tool, part.name)),
        ...(toolCallId ? { toolCallId } : {}),
        phase,
        ...(message ? { message: safeDiagnostic(message, "") } : {}),
        runId,
      }],
    };
  }
  if (partType === "step-finish" || partType === "step_finish") {
    const tokens = readRecord(part.tokens);
    const inputTokens = readFiniteNumber(tokens?.input, tokens?.inputTokens, part.inputTokens);
    const outputTokens = readFiniteNumber(tokens?.output, tokens?.outputTokens, part.outputTokens);
    const costUsd = readFiniteNumber(part.cost, part.costUsd);
    if (inputTokens === null && outputTokens === null && costUsd === null) return { ...identity, events: [] };
    return {
      ...identity,
      events: [{
        event: "usage",
        ...(inputTokens === null ? {} : { inputTokens }),
        ...(outputTokens === null ? {} : { outputTokens }),
        ...(costUsd === null ? {} : { costUsd }),
        runId,
      }],
    };
  }
  return { ...identity, events: [] };
}

export const opencodeRuntimeDefinition = {
  provider: "opencode" as const,
  executableNames: ["opencode-cli", "opencode"] as const,
  stdinMode: "text" as const,
  buildArgs(input: OpenCodeCommandInput) {
    return buildOpenCodeCommand(input).args;
  },
  capabilities: { streaming: true, cancellation: true, artifacts: true, nativeSessionResume: true },
};
