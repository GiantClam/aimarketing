import test from "node:test";
import assert from "node:assert/strict";
import { questionConversationForRoute, questionSessionIdForRoute } from "../src/question-session-route";

const conversations = [
  { id: "conversation-1", opencode_session_id: "session-1", agent_id: "executive-presentation-ppt" },
  { id: "conversation-2", opencode_session_id: null, agent_id: "executive-brand" },
];

test("question UI never inherits the last active conversation on entry and home routes", () => {
  assert.equal(questionConversationForRoute("/dashboard", conversations), undefined);
  assert.equal(questionConversationForRoute("/dashboard/ai?agent=executive-brand", conversations), undefined);
  assert.equal(questionConversationForRoute("/dashboard/writer", conversations), undefined);
});

test("question UI mounts only after the routed OpenCode session is registered in the current host", () => {
  const path = "/dashboard/ai/conversation-1?agent=executive-presentation-ppt";
  assert.deepEqual(questionConversationForRoute(path, conversations), conversations[0]);
  assert.equal(questionSessionIdForRoute(path, conversations, new Set()), undefined);
  assert.equal(questionSessionIdForRoute(path, conversations, new Set(["session-1"])), "session-1");
});

test("question UI ignores new conversations until OpenCode assigns a session", () => {
  assert.equal(questionSessionIdForRoute("/dashboard/ai/conversation-2", conversations, new Set()), undefined);
});
