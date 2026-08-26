import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Attachments, Branch, BranchNext, BranchPrevious, Confirmation, Context, Conversation, ConversationContent, Message, MessageContent, ModelSelector, ModelSelectorContent, ModelSelectorItem, ModelSelectorTrigger, Plan, PromptInput, PromptInputAction, PromptInputActions, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools, Reasoning, Sources, Source, Tool } from "../src/ai-elements/index";

test("official PromptInput compound exposes the documented slots and submit semantics", () => {
  const markup = renderToStaticMarkup(<PromptInput value="hello" onValueChange={() => undefined} onSubmit={() => undefined} attachments={[{ id: "file-1", name: "brief.pdf", mediaType: "application/pdf" }]}><PromptInputBody><PromptInputTextarea placeholder="Ask anything" /></PromptInputBody><PromptInputFooter><PromptInputTools>Tools</PromptInputTools><PromptInputSubmit /></PromptInputFooter></PromptInput>);
  assert.match(markup, /data-slot="prompt-input"/);
  assert.match(markup, /data-slot="prompt-input-body"/);
  assert.match(markup, /data-slot="prompt-input-footer"/);
  assert.match(markup, /data-slot="prompt-input-tools"/);
  assert.match(markup, /aria-label="消息输入"/);
  assert.match(markup, /type="submit"/);
});

test("official ModelSelector renders grouped selectable models", () => {
  const markup = renderToStaticMarkup(<ModelSelector models={[{ id: "openai:gpt", label: "GPT", provider: "OpenAI" }, { id: "local:qwen", label: "Qwen", provider: "Local" }]} value="openai:gpt" onValueChange={() => undefined}><ModelSelectorTrigger /><ModelSelectorContent><ModelSelectorItem model={{ id: "openai:gpt", label: "GPT", provider: "OpenAI" }} selected onSelect={() => undefined} /></ModelSelectorContent></ModelSelector>);
  assert.match(markup, /aria-haspopup="listbox"/);
  assert.match(markup, /GPT/);
});

test("official conversation, reasoning, plan and tool preserve process semantics", () => {
  const markup = renderToStaticMarkup(<Conversation><ConversationContent><Message from="assistant"><MessageContent><Reasoning text="thinking" isStreaming /><Plan title="Plan" steps={[{ id: "step-1", title: "Research", status: "completed" }]} isStreaming /><Tool toolName="search" toolCallId="tool-1" input={{ query: "ai" }} status="waiting" /></MessageContent></Message></ConversationContent></Conversation>);
  assert.match(markup, /data-slot="conversation"/);
  assert.match(markup, /data-from="assistant"/);
  assert.match(markup, /推理过程|Reasoning/);
  assert.match(markup, /Plan/);
  assert.match(markup, /tool-1/);
  assert.match(markup, /data-status="waiting"/);
});

test("official sources, context, confirmation and attachments expose action semantics", () => {
  const markup = renderToStaticMarkup(<div><Attachments items={[{ id: "a", name: "image.png", mediaType: "image/png" }]} onRemove={() => undefined} /><Context maxTokens={1000} usedTokens={250} usage={{ inputTokens: 200, outputTokens: 50 }} /><Sources><Source title="Research" href="https://example.com" excerpt="Evidence" /></Sources><Confirmation status="approval-requested" onApprove={() => undefined} onReject={() => undefined} /></div>);
  assert.match(markup, /image\.png/);
  assert.match(markup, /25% used/);
  assert.match(markup, /Research/);
  assert.match(markup, /Approve/);
  assert.match(markup, /Reject/);
});

test("official prompt input exposes loading stop state and action slots", () => {
  const markup = renderToStaticMarkup(<PromptInput value="hello" onValueChange={() => undefined} onSubmit={() => undefined} isLoading onStop={() => undefined}><PromptInputBody><PromptInputTextarea /></PromptInputBody><PromptInputFooter><PromptInputActions><PromptInputAction tooltip="Add file">+</PromptInputAction></PromptInputActions><PromptInputSubmit /></PromptInputFooter></PromptInput>);
  assert.match(markup, /data-status="streaming"/);
  assert.match(markup, /停止生成/);
  assert.match(markup, /title="Add file"/);
});

test("official branch primitives preserve message navigation semantics", () => {
  const markup = renderToStaticMarkup(<Branch><BranchPrevious /><span>Page 1 of 2</span><BranchNext /></Branch>);
  assert.match(markup, /data-slot="branch"/);
  assert.match(markup, /上一页|Previous/);
  assert.match(markup, /下一页|Next/);
});
