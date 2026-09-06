import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopWorkbenchClient } from "../src/workbench-client";
import { QuestionSession } from "../src/question-session";
import { createQuestionBridge } from "../src/question-bridge";
import { replayPersistedRunToConversationMessage } from "../src/conversation-run-replay";
import { questionAnswers, questionKey, parseWorkbenchQuestionEvent, type WorkbenchQuestionClient, type WorkbenchQuestionEvent, type WorkbenchQuestionRequest } from "@coworkany/workbench-client";
import { applyWorkbenchRunEventToUIMessage, createDesktopUIMessage, workbenchEventToUIMessageChunks } from "@coworkany/workbench-client";

const request: WorkbenchQuestionRequest & { runId: string } = {
  requestId: "q1", sessionId: "s1", runId: "r1",
  questions: [
    { header: "渠道", question: "选择渠道", options: [{ label: "网站", description: "主页" }, { label: "邮件", description: "通讯" }], multiple: true },
    { header: "风格", question: "选择风格", options: [{ label: "正式", description: "商务" }], custom: false },
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  let handler: (event: WorkbenchQuestionEvent) => void = () => undefined;
  const lists: ReturnType<typeof deferred<readonly WorkbenchQuestionRequest[]>>[] = [];
  const replies: unknown[] = [];
  const ack = deferred<void>();
  let disposed = false;
  const client: WorkbenchQuestionClient = {
    list: async () => { const item = deferred<readonly WorkbenchQuestionRequest[]>(); lists.push(item); return item.promise; },
    subscribe: async (_sessionId, listener) => { handler = listener; return () => { disposed = true; }; },
    reply: async (payload) => { replies.push(payload); return ack.promise; },
    reject: async (payload) => { replies.push(payload); return ack.promise; },
  };
  return { client, lists, replies, ack, emit: (event: WorkbenchQuestionEvent) => handler(event), disposed: () => disposed };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("answers preserve question order, multiple selections and custom text; enforce custom=false", () => {
  assert.deepEqual(questionAnswers(request.questions, [{ selected: ["邮件", "网站"], custom: "  海报  " }, { selected: ["正式"], custom: "" }]), [["网站", "邮件", "海报"], ["正式"]]);
  assert.equal(questionAnswers(request.questions, [{ selected: [], custom: "" }, { selected: ["正式"], custom: "" }]), null);
  assert.equal(questionAnswers(request.questions, [{ selected: ["网站"], custom: "" }, { selected: [], custom: "invalid" }]), null);
  assert.equal(questionAnswers([{ ...request.questions[0]!, multiple: false }], [{ selected: ["网站"], custom: "冲突" }]), null);
  assert.equal(questionAnswers(request.questions, [{ selected: ["unknown"], custom: "" }, { selected: ["正式"], custom: "" }]), null);
});

test("question events validate ownership and never become assistant message content", () => {
  const event = parseWorkbenchQuestionEvent({ event: "question_request", ...request });
  assert.ok(event);
  assert.equal(parseWorkbenchQuestionEvent({ event: "question_request", ...request, sessionId: "" }), undefined);
  assert.equal(parseWorkbenchQuestionEvent({ event: "question_request", ...request, questions: [{ question: "x" }] }), undefined);
  assert.equal(parseWorkbenchQuestionEvent({ event: "question_response", ...request, rejected: "false" }), undefined);
  const message = createDesktopUIMessage({ id: "m1", conversationId: "c1", role: "assistant", content: "正文" });
  assert.equal(applyWorkbenchRunEventToUIMessage(message, event), message);
  assert.deepEqual(workbenchEventToUIMessageChunks(event), []);
});

test("restore merges live requests and response tombstones while filtering other sessions", async () => {
  const f = fixture();
  const store = new QuestionSession(f.client, "s1");
  void store.start();
  await tick();
  const live = { ...request, requestId: "q2", runId: "r2" };
  f.emit({ type: "question_request", ...live });
  f.emit({ type: "question_response", requestId: "q1", sessionId: "s1", runId: "r1", rejected: false });
  f.lists[0]!.resolve([request, { ...request, sessionId: "s2" }]);
  await tick();
  assert.deepEqual(store.getSnapshot().requests, [live]);
  f.emit({ type: "question_response", ...live, runId: "wrong-run", rejected: true });
  assert.deepEqual(store.getSnapshot().requests, [live]);
  store.dispose();
  assert.equal(f.disposed(), true);
});

test("reply stays with its request, rejects duplicates, and waits for host acknowledgement", async () => {
  const f = fixture();
  const store = new QuestionSession(f.client, "s1");
  void store.start();
  await tick();
  f.lists[0]!.resolve([request]);
  await tick();
  const key = questionKey(request);
  const submitted = store.respond(key, [["网站"], ["正式"]]);
  await store.respond(key, [["邮件"], ["正式"]]);
  assert.deepEqual(f.replies, [{ sessionId: "s1", requestId: "q1", answers: [["网站"], ["正式"]] }]);
  assert.equal(store.getSnapshot().requests.length, 1);
  f.ack.reject(new Error("host unavailable"));
  await submitted;
  assert.equal(store.getSnapshot().requests.length, 1);
  assert.match(store.getSnapshot().errors[key]!, /host unavailable/);
  store.dispose();
});

test("reject closes only the acknowledged request; reopening retrieves pending requests", async () => {
  const f = fixture();
  const store = new QuestionSession(f.client, "s1");
  void store.start();
  await tick();
  f.lists[0]!.resolve([request, { ...request, requestId: "q2", runId: "r2" }]);
  await tick();
  const pending = store.respond(questionKey(request), null);
  assert.deepEqual(f.replies, [{ sessionId: "s1", requestId: "q1" }]);
  f.ack.resolve();
  await pending;
  assert.deepEqual(store.getSnapshot().requests.map((item) => item.requestId), ["q2"]);
  store.dispose();
  const reopened = new QuestionSession(f.client, "s1");
  void reopened.start();
  await tick();
  f.lists[1]!.resolve([request]);
  await tick();
  assert.deepEqual(reopened.getSnapshot().requests, [request]);
  reopened.dispose();
});

test("Tauri question commands await correlated ack, keep payloads native, and filter subscription ownership", async () => {
  const listeners = new Set<(payload: { raw: string }) => void>();
  const commands: Record<string, unknown>[] = [];
  const emit = (frame: unknown) => { const raw = JSON.stringify(frame); for (const listener of [...listeners]) listener({ raw: `${raw.length}:${raw}` }); };
  const bridge = {
    async invoke<T>(command: string, args?: Record<string, unknown>) {
      if (command === "host_send") {
        const frame = args!.message as Record<string, unknown>;
        commands.push(frame);
        emit({ requestId: "unrelated", ok: true, data: [] });
        emit({ requestId: frame.requestId, ok: true, data: frame.type === "question.list" ? { questions: [{ id: request.requestId, sessionID: request.sessionId, questions: request.questions }] } : {} });
      }
      return undefined as T;
    },
    async listen<T>(_event: string, handler: (payload: T) => void) { const listener = handler as (payload: { raw: string }) => void; listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const client = createDesktopWorkbenchClient(bridge, { go() {}, replace() {}, current: () => "/" });
  assert.deepEqual(await client.questions.list("s1"), [{ requestId: request.requestId, sessionId: request.sessionId, questions: request.questions }]);
  await client.questions.reply({ sessionId: "s1", requestId: "q1", answers: [["网站"], ["正式"]] });
  await client.questions.reject({ sessionId: "s1", requestId: "q1" });
  assert.deepEqual(commands.map((frame) => frame.type), ["question.list", "question.reply", "question.reject"]);
  assert.deepEqual(commands[1]!.payload, { sessionId: "s1", requestId: "q1", answers: [["网站"], ["正式"]] });
  assert.equal(commands[1]!.sessionId, "s1");
  assert.equal(listeners.size, 0);
  const events: WorkbenchQuestionEvent[] = [];
  const unsubscribe = await client.questions.subscribe("s1", (event) => events.push(event));
  emit({ data: { event: { event: "question_request", ...request, sessionId: "s2" } } });
  emit({ data: { event: { event: "question_request", ...request } } });
  assert.equal(events.length, 1);
  unsubscribe();
  assert.equal(listeners.size, 0);
});

test("pending rows without runId acquire live ownership without duplicating the form", async () => {
  const f = fixture();
  const store = new QuestionSession(f.client, "s1");
  void store.start();
  await tick();
  const restored = { requestId: request.requestId, sessionId: request.sessionId, questions: request.questions };
  f.lists[0]!.resolve([restored]);
  await tick();
  const key = questionKey(restored);
  f.emit({ type: "question_request", ...request });
  assert.equal(store.getSnapshot().requests.length, 1);
  assert.equal(questionKey(store.getSnapshot().requests[0]!), key);
  assert.equal(store.getSnapshot().requests[0]!.runId, "r1");
  const refresh = store.refresh();
  f.lists[1]!.resolve([restored]);
  await refresh;
  assert.equal(store.getSnapshot().requests[0]!.runId, "r1");
  store.dispose();
});

test("workflow questions filter runs and restore known node session ownership", async () => {
  const f = fixture();
  const store = new QuestionSession(f.client, "s1", "r1");
  void store.start();
  await tick();
  const restored = { requestId: request.requestId, sessionId: request.sessionId, questions: request.questions };
  f.lists[0]!.resolve([restored, { ...request, requestId: "other", runId: "r2" }]);
  await tick();
  f.emit({ type: "question_request", ...request, requestId: "live-other", runId: "r2" });
  assert.deepEqual(store.getSnapshot().requests, [request]);
  store.dispose();
});

test("restored request without a runId can be replied to and stays closed on delayed replay", async () => {
  const f = fixture();
  const store = new QuestionSession(f.client, "s1");
  void store.start();
  await tick();
  const restored = { requestId: request.requestId, sessionId: request.sessionId, questions: request.questions };
  f.lists[0]!.resolve([restored]);
  await tick();
  const pending = store.respond(questionKey(restored), [["网站"], ["正式"]]);
  f.ack.resolve();
  await pending;
  f.emit({ type: "question_request", ...request });
  assert.equal(store.getSnapshot().requests.length, 0);
  store.dispose();
});

test("late list results and delayed listener registration cannot resurrect a disposed session", async () => {
  const registration = deferred<() => void>();
  let released = false;
  let lists = 0;
  const store = new QuestionSession({
    subscribe: async () => registration.promise,
    list: async () => { lists++; return [request]; },
    reply: async () => undefined,
    reject: async () => undefined,
  }, "s1");
  const started = store.start();
  store.dispose();
  registration.resolve(() => { released = true; });
  await started;
  assert.equal(released, true);
  assert.equal(lists, 0);
  assert.equal(store.getSnapshot().requests.length, 0);
});

test("question bridge follows host lifecycle and propagates rejected acknowledgements without fixed timeouts", async () => {
  const listeners = new Map<string, Set<(payload: { raw: string; generation?: number }) => void>>();
  let rejectCommand = false;
  const client = createQuestionBridge({
    async invoke<T>(command: string, args?: Record<string, unknown>) {
      if (command === "host_start") return 1 as T;
      if (command === "host_send") {
        const frame = args!.message as { requestId: string };
        if (rejectCommand) {
          const raw = JSON.stringify({ requestId: frame.requestId, ok: false, error: { message: "opencode_question_not_found" } });
          for (const listener of listeners.get("desktop://runtime-response") ?? []) listener({ raw: `${raw.length}:${raw}`, generation: 1 });
        } else {
          const raw = JSON.stringify({ type: "workflow_host_exit" });
          for (const listener of listeners.get("desktop://runtime-log") ?? []) listener({ raw, generation: 1 });
        }
      }
      return undefined as T;
    },
    async listen<T>(event: string, handler: (payload: T) => void) {
      const listener = handler as (payload: { raw: string; generation?: number }) => void;
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return () => { eventListeners.delete(listener); };
    },
  });
  await assert.rejects(client.list("s1"), /workflow_host_exit/);
  assert.equal([...listeners.values()].some((items) => items.size > 0), false);
  rejectCommand = true;
  await assert.rejects(client.reject({ sessionId: "s1", requestId: "q1" }), /opencode_question_not_found/);
  assert.equal([...listeners.values()].some((items) => items.size > 0), false);
});

test("conversation replay excludes generic question tool progress and answers", () => {
  const result = replayPersistedRunToConversationMessage({ id: "r1", status: "succeeded", started_at: "2026-09-06T00:00:00Z" }, [
    { sequence: 1, event_type: "tool_event", created_at: "2026-09-06T00:00:00Z", payload_json: JSON.stringify({ tool: "question", message: JSON.stringify({ output: "private answer" }), phase: "completed" }) },
    { sequence: 2, event_type: "question_request", created_at: "2026-09-06T00:00:00Z", payload_json: JSON.stringify(request) },
    { sequence: 3, event_type: "text_delta", created_at: "2026-09-06T00:00:00Z", payload_json: JSON.stringify({ delta: "正文" }) },
  ], "c1");
  assert.equal(result?.content, "正文");
  assert.equal(JSON.stringify(result).includes("private answer"), false);
  assert.equal(result?.parts.some((part) => part.type === "dynamic-tool"), false);
});
