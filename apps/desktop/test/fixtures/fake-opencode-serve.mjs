import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const port = Number(option("--port"));
const hostname = option("--hostname") || "127.0.0.1";
const expectedAuthorization = `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME}:${process.env.OPENCODE_SERVER_PASSWORD}`, "utf8").toString("base64")}`;
let events;
const pendingEvents = [];
const stabilityMode = process.env.FAKE_OPENCODE_CONCURRENCY_MODE === "1";
const stabilitySessions = new Set();
let stabilitySessionCounter = 0;
const multiContinuationCounts = new Map();

function stabilityLog(value) {
  const path = process.env.FAKE_OPENCODE_ACTIVITY_LOG;
  if (path) appendFileSync(path, `${value}\n`, "utf8");
}

function sendEvent(payload) {
  const separator = process.env.FAKE_OPENCODE_CRLF === "1" ? "\r\n\r\n" : "\n\n";
  const frame = `data: ${JSON.stringify(payload)}${separator}`;
  if (events) events.write(frame);
  else pendingEvents.push(frame);
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  if (request.headers.authorization !== expectedAuthorization) return json(response, 401, { message: "unauthorized" });
  const url = new URL(request.url || "/", `http://${hostname}:${port}`);
  if (request.method === "GET" && url.pathname === "/global/health") return json(response, 200, { status: "ok" });
  if (request.method === "GET" && url.pathname === "/event") {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    response.flushHeaders();
    events = response;
    for (const frame of pendingEvents.splice(0)) response.write(frame);
    request.once("close", () => { if (events === response) events = undefined; });
    return;
  }
  if (stabilityMode && request.method === "POST" && url.pathname === "/session") {
    const sessionId = `stability-session-${process.pid}-${++stabilitySessionCounter}`;
    stabilitySessions.add(sessionId);
    return json(response, 200, { id: sessionId });
  }
  if (stabilityMode) {
    const stabilityMatch = url.pathname.match(/^\/session\/([^/]+)\/(message|prompt_async|abort)$/u);
    if (stabilityMatch) {
      const [, sessionId, action] = stabilityMatch;
      if (request.method === "GET" && action === "message") return json(response, stabilitySessions.has(sessionId) ? 200 : 404, { id: sessionId });
      if (request.method === "POST" && action === "abort") return json(response, 200, { ok: true });
      if (request.method === "POST" && (action === "message" || action === "prompt_async") && stabilitySessions.has(sessionId)) {
        let body = "";
        for await (const chunk of request) body += chunk;
        const payload = JSON.parse(body);
        const prompt = String(payload.parts?.[0]?.text ?? "");
        const messageId = `stability-assistant-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const delay = prompt.startsWith("slow-") ? 250 : 40;
        stabilityLog(`${process.pid}:${sessionId}:${prompt}`);
        sendEvent({ payload: { type: "session.status", properties: { sessionID: sessionId, status: { type: "busy" } } } });
        setTimeout(() => {
          sendEvent({ payload: { type: "session.updated", properties: { sessionID: sessionId, info: { id: sessionId, title: "fixture" } } } });
          sendEvent({ payload: { type: "message.updated", properties: { sessionID: sessionId, info: { id: messageId, role: "assistant", time: { completed: Date.now() } } } } });
          sendEvent({ payload: { type: "message.part.updated", properties: { sessionID: sessionId, part: { id: `${messageId}-text`, messageID: messageId, type: "text", text: `Stability answer for ${prompt}` } } } });
          sendEvent({ payload: { type: "message.part.updated", properties: { sessionID: sessionId, part: { id: `${messageId}-usage`, messageID: messageId, type: "step-finish", tokens: { input: 3, output: 2 }, cost: 0.001 } } } });
          sendEvent({ payload: { type: "session.status", properties: { sessionID: sessionId, status: { type: "idle" } } } });
        }, Math.floor(delay / 2));
        await new Promise((resolve) => setTimeout(resolve, delay));
        response.writeHead(204);
        response.end();
        return;
      }
    }
  }
  if (request.method === "GET" && url.pathname === "/session/retained-session/message") return json(response, 200, { id: "retained-session" });
  if (request.method === "GET" && url.pathname === "/session/lost-session/message") return json(response, 404, { message: "missing" });
  if (request.method === "POST" && url.pathname === "/session") return json(response, 200, { id: "recovered-session" });
  if (request.method === "POST" && ["/session/recovered-session/message", "/session/recovered-session/prompt_async"].includes(url.pathname)) {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    if (process.env.FAKE_OPENCODE_CONFIG_MODEL_LOG) {
      appendFileSync(process.env.FAKE_OPENCODE_CONFIG_MODEL_LOG, `${process.env.FAKE_OPENCODE_CONFIG_MODEL || "unknown"}:${payload.model?.modelID || "missing"}\n`, "utf8");
    }
    if (process.env.FAKE_OPENCODE_AGENT_LOG) writeFileSync(process.env.FAKE_OPENCODE_AGENT_LOG, String(payload.agent ?? ""), "utf8");
    if (process.env.FAKE_OPENCODE_SYSTEM_LOG) writeFileSync(process.env.FAKE_OPENCODE_SYSTEM_LOG, String(payload.system ?? ""), "utf8");
    if (!process.env.FAKE_OPENCODE_CONFIG_MODEL && (payload.model?.providerID !== "configured" || payload.model?.modelID !== "model")) return json(response, 400, { message: "model not forwarded" });
    if (process.env.FAKE_OPENCODE_PROMPT_HANG === "1") {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      response.writeHead(204); response.end();
      return;
    }
    if (payload.parts?.[0]?.text === "Trigger crash") {
      setTimeout(() => process.exit(23), 25);
      return;
    }
    if (payload.parts?.[0]?.text === "Long running") {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5_000);
        request.once("close", () => { clearTimeout(timer); resolve(); });
      });
      if (!response.writableEnded) { response.writeHead(204); response.end(); }
      return;
    }
    const prompt = payload.parts?.[0]?.text;
    if (prompt === "Create ppt artifact then fail") {
      writeFileSync("failed-workflow.pptx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]));
      sendEvent({ payload: { type: "session.status", properties: { sessionID: "recovered-session", status: { type: "busy" } } } });
      sendEvent({ payload: { type: "message.updated", properties: { sessionID: "recovered-session", info: { id: "late-assistant", role: "assistant" } } } });
      sendEvent({ payload: { type: "message.part.updated", properties: { sessionID: "recovered-session", part: { id: "late-tool", messageID: "late-assistant", type: "tool", tool: "write", state: { status: "completed", input: { filePath: "failed-workflow.pptx" }, output: { path: "failed-workflow.pptx" } } } } } });
      setTimeout(() => sendEvent({ payload: { type: "session.error", properties: { sessionID: "recovered-session", error: { message: "late validation failure" } } } }), 25);
      response.writeHead(204);
      response.end();
      return;
    }
    if (process.env.FAKE_OPENCODE_MULTI_CONTINUATION === "1" && typeof prompt === "string" && (prompt === "Multi-turn tool task" || prompt.startsWith("Continue the current task"))) {
      const turn = (multiContinuationCounts.get("recovered-session") ?? 0) + 1;
      multiContinuationCounts.set("recovered-session", turn);
      const messageId = `multi-assistant-${turn}`;
      const finish = turn < 3 ? "tool-calls" : "stop";
      sendEvent({ payload: { type: "session.status", properties: { sessionID: "recovered-session", status: { type: "busy" } } } });
      setTimeout(() => {
        sendEvent({ payload: { type: "message.updated", properties: { sessionID: "recovered-session", info: { id: messageId, role: "assistant", finish, time: { completed: Date.now() } } } } });
        sendEvent({ payload: { type: "message.part.updated", properties: { sessionID: "recovered-session", part: { id: `${messageId}-text`, messageID: messageId, type: "text", text: finish === "stop" ? "Multi-turn task completed" : `Tool turn ${turn} completed` } } } });
        sendEvent({ payload: { type: "message.part.updated", properties: { sessionID: "recovered-session", part: { id: `${messageId}-usage`, messageID: messageId, type: "step-finish", reason: finish, tokens: { input: 11, output: 7 }, cost: 0.02 } } } });
        sendEvent({ payload: { type: "session.status", properties: { sessionID: "recovered-session", status: { type: "idle" } } } });
        if (finish === "tool-calls") setTimeout(() => sendEvent({ payload: { type: "session.status", properties: { sessionID: "recovered-session", status: { type: "idle" } } } }), 50);
      }, 25);
      response.writeHead(204);
      response.end();
      return;
    }
    if (typeof prompt === "string" && prompt.includes("ppt-master")) {
      writeFileSync("workflow-deck.pptx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]));
    }
    if (prompt === "Create chat artifact") writeFileSync("chat-final.md", "final chat artifact\n", "utf8");
    const answer = prompt === "First turn" ? "First answer" : prompt === "Second turn" ? "Second answer" : prompt === "Create artifact" ? "Artifact created" : "Recovered answer";
    const tool = prompt === "Create artifact" ? "artifact:result" : "write";
    const sessionProperty = prompt === "Camel case stream" ? { sessionId: "recovered-session" } : { sessionID: "recovered-session" };
    sendEvent({ payload: { type: "session.status", properties: { ...sessionProperty, status: { type: "busy" } } } });
    setTimeout(() => {
      if (payload.parts?.[0]?.text === "Trigger error") {
        sendEvent({ payload: { type: "session.error", properties: { ...sessionProperty, error: { message: "provider unavailable" } } } });
        return;
      }
      sendEvent({ payload: { type: "message.updated", properties: { ...sessionProperty, info: { id: "assistant-1", role: "assistant", time: { completed: Date.now() } } } } });
      sendEvent({ payload: { type: "message.part.updated", properties: { ...sessionProperty, part: { id: "text-1", messageID: "assistant-1", type: "text", text: answer } } } });
      sendEvent({ payload: { type: "message.part.updated", properties: { ...sessionProperty, part: { id: "tool-1", messageID: "assistant-1", type: "tool", tool, state: { status: "completed", title: "saved", ...(prompt === "Create chat artifact" ? { input: { filePath: "chat-final.md", content: "final chat artifact\\n" }, output: { path: "chat-final.md" } } : {}) } } } } });
      sendEvent({ payload: { type: "message.part.updated", properties: { ...sessionProperty, part: { id: "usage-1", messageID: "assistant-1", type: "step-finish", tokens: { input: 11, output: 7 }, cost: 0.02 } } } });
      sendEvent({ payload: { type: "session.status", properties: { ...sessionProperty, status: { type: "idle" } } } });
    }, 25);
    if (url.pathname.endsWith("/prompt_async")) { response.writeHead(204); response.end(); return; }
    await new Promise((resolve) => setTimeout(resolve, 75));
    response.writeHead(204); response.end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/session/recovered-session/abort") {
    if (process.env.FAKE_OPENCODE_ABORT_LOG) writeFileSync(process.env.FAKE_OPENCODE_ABORT_LOG, "aborted", "utf8");
    return json(response, 200, { ok: true });
  }
  return json(response, 404, { message: "not found" });
});

const shutdown = () => process.exit(0);
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
server.listen(port, hostname);
