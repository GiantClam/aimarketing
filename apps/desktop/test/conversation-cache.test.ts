import test from "node:test";
import assert from "node:assert/strict";
import { ConversationMemoryCache } from "../src/conversation-cache";

type Message = { readonly id: string };

test("conversation cache restores messages, pagination state, and reading position", () => {
  const cache = new ConversationMemoryCache<Message>(2);
  cache.set("conversation-a", {
    messages: [{ id: "a-1" }, { id: "a-2" }],
    cursor: { createdAt: "2026-09-06T00:00:00.000Z", id: "a-1" },
    hasMore: true,
    scrollTop: 184,
  });

  assert.deepEqual(cache.get("conversation-a"), {
    messages: [{ id: "a-1" }, { id: "a-2" }],
    cursor: { createdAt: "2026-09-06T00:00:00.000Z", id: "a-1" },
    hasMore: true,
    scrollTop: 184,
  });
});

test("conversation cache keeps recently revisited sessions and evicts the least recently used one", () => {
  const cache = new ConversationMemoryCache<Message>(2);
  cache.set("conversation-a", { messages: [{ id: "a" }] });
  cache.set("conversation-b", { messages: [{ id: "b" }] });
  assert.ok(cache.get("conversation-a"));
  cache.set("conversation-c", { messages: [{ id: "c" }] });

  assert.ok(cache.get("conversation-a"));
  assert.equal(cache.get("conversation-b"), undefined);
  assert.ok(cache.get("conversation-c"));
});
