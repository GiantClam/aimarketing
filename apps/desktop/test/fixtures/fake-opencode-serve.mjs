import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const port = Number(option("--port"));
const hostname = option("--hostname") || "127.0.0.1";
const expectedAuthorization = `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME}:${process.env.OPENCODE_SERVER_PASSWORD}`, "utf8").toString("base64")}`;
let events;
const pendingEvents = [];

function sendEvent(payload) {
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
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
  if (request.method === "GET" && url.pathname === "/session/retained-session/message") return json(response, 200, { id: "retained-session" });
  if (request.method === "GET" && url.pathname === "/session/lost-session/message") return json(response, 404, { message: "missing" });
  if (request.method === "POST" && url.pathname === "/session") return json(response, 200, { id: "recovered-session" });
  if (request.method === "POST" && url.pathname === "/session/recovered-session/message") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    if (payload.model?.providerID !== "configured" || payload.model?.modelID !== "model") return json(response, 400, { message: "model not forwarded" });
    if (payload.parts?.[0]?.text === "Trigger crash") {
      setTimeout(() => process.exit(23), 25);
      return;
    }
    if (payload.parts?.[0]?.text === "Long running") {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      response.writeHead(204); response.end();
      return;
    }
    const prompt = payload.parts?.[0]?.text;
    const answer = prompt === "First turn" ? "First answer" : prompt === "Second turn" ? "Second answer" : prompt === "Create artifact" ? "Artifact created" : "Recovered answer";
    const tool = prompt === "Create artifact" ? "artifact:result" : "write";
    setTimeout(() => {
      if (payload.parts?.[0]?.text === "Trigger error") {
        sendEvent({ payload: { type: "session.error", properties: { sessionID: "recovered-session", error: { message: "provider unavailable" } } } });
        return;
      }
      sendEvent({ payload: { type: "message.updated", properties: { sessionID: "recovered-session", info: { id: "assistant-1", role: "assistant" } } } });
      sendEvent({ payload: { type: "message.part.updated", properties: { sessionID: "recovered-session", part: { id: "text-1", messageID: "assistant-1", type: "text", text: answer } } } });
      sendEvent({ payload: { type: "message.part.updated", properties: { sessionID: "recovered-session", part: { id: "tool-1", messageID: "assistant-1", type: "tool", tool, state: { status: "completed", title: "saved" } } } } });
      sendEvent({ payload: { type: "message.part.updated", properties: { sessionID: "recovered-session", part: { id: "usage-1", messageID: "assistant-1", type: "step-finish", tokens: { input: 11, output: 7 }, cost: 0.02 } } } });
    }, 25);
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
