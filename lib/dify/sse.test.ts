import test from "node:test";
import assert from "node:assert/strict";

import { consumeSSEBuffer, flushSSEBuffer } from "./sse.js";

test("consumeSSEBuffer parses complete event blocks", () => {
  const input = 'data: {"event":"message","answer":"hello"}\n\n';
  const { events, rest } = consumeSSEBuffer(input);

  assert.equal(rest, "");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { event: "message", answer: "hello" });
});

test("consumeSSEBuffer keeps partial blocks in rest", () => {
  const input = 'data: {"event":"message","answer":"hel';
  const { events, rest } = consumeSSEBuffer(input);

  assert.equal(events.length, 0);
  assert.equal(rest, input);
});

test("consumeSSEBuffer parses multiple events from one buffer", () => {
  const input =
    'data: {"event":"message","answer":"one"}\n\n' +
    'data: {"event":"message","answer":"two"}\n\n';

  const { events, rest } = consumeSSEBuffer(input);

  assert.equal(rest, "");
  assert.equal(events.length, 2);
  assert.equal(events[0].answer, "one");
  assert.equal(events[1].answer, "two");
});

test("consumeSSEBuffer merges multiline data payloads", () => {
  const input =
    'data: {"event":"message",\n' +
    'data: "answer":"line"}\n\n';

  const { events } = consumeSSEBuffer(input);
  assert.equal(events.length, 1);
  assert.equal(events[0].answer, "line");
});

test("consumeSSEBuffer ignores invalid json and [DONE] sentinels", () => {
  const input =
    "data: [DONE]\n\n" +
    "data: not-json\n\n" +
    'data: {"event":"message","answer":"ok"}\n\n';

  const { events, rest } = consumeSSEBuffer(input);

  assert.equal(rest, "");
  assert.equal(events.length, 1);
  assert.equal(events[0].answer, "ok");
});

test("flushSSEBuffer parses final trailing block without delimiter", () => {
  const input = 'data: {"event":"message","answer":"tail"}';
  const events = flushSSEBuffer(input);

  assert.equal(events.length, 1);
  assert.equal(events[0].answer, "tail");
});
