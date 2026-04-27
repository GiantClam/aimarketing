# AI Chat Speed Quality Upgrade Implementation Plan

> Use this plan to execute the work task-by-task with tight verification after each step.

**Goal:** Improve AI chat perceived speed and answer quality so normal chat, agent chat, web search, and consulting advisor behave predictably and can compete against DeepSeek and Doubao in daily usage.

**Architecture:** Fix the streaming/tool-result SDK field mismatch first, then split runtime policy by conversation mode: normal chat without an agent must be lightweight and must not query enterprise knowledge; agent and consulting modes may use knowledge/tools when intent requires them. Choose defaults from the live Aiberm model list with a measured speed/quality policy instead of alphabetical ordering or stale provider defaults.

**Tech Stack:** Next.js App Router, React 19, Vercel AI SDK `ai`, Aiberm/CrazyRoute/OpenRouter-compatible OpenAI clients, TypeScript, existing AI entry runtime, existing Playwright/Node smoke scripts.

---

## 1. Current Evidence

Real local probe on April 27, 2026:

- `/api/ai/models` returned provider `aiberm`.
- Current default selected model: `claude-haiku-4.5`.
- Aiberm visible candidate sample:
  - `claude-haiku-4.5`
  - `claude-haiku-4.5-thinking`
  - `claude-opus-4.5`
  - `claude-opus-4.5-thinking`
  - `claude-opus-4.6`
  - `claude-opus-4.6-thinking`
  - `claude-sonnet-4.5`
  - `claude-sonnet-4.5-thinking`
  - `claude-sonnet-4.6`
  - `claude-sonnet-4.6-thinking`
  - `gpt-5.3-codex`
  - `gpt-5.3-codex-xhigh`
- Normal chat with current default:
  - first SSE event: about 1s.
  - first visible token: about 7-24s, depending on prompt and tool path.
  - model: `claude-haiku-4-5-20251001`.
- Consulting advisor locked to Sonnet 4.6:
  - first visible token: about 55s.
  - answer quality is stronger, but speed is not suitable for speed-first default use.
- Web search was available and sometimes called, but streamed `tool_result` exposed `result: null`.
- Normal no-agent chat currently queries enterprise knowledge before generation, which adds latency and can steer the answer away from a general chat task.

## 2. Root Causes

1. **Streaming field mismatch**
   - File: `lib/skills/runtime/ai-entry-executor.ts`
   - Current code reads `streamPart.textDelta`.
   - Current `ai` SDK stream part uses `text`.
   - Result: user sees little or no true incremental streaming until fallback/full result.

2. **Tool result field mismatch**
   - File: `lib/skills/runtime/ai-entry-executor.ts`
   - Current code reads `streamPart.result`.
   - Current `ai` SDK tool result uses `output`.
   - Result: web search source events reach frontend as `null`, so sources/progress are incomplete.

3. **Normal chat does too much before model output**
   - File: `app/api/ai/chat/route.ts`
   - `loadEnterpriseKnowledge()` runs for any active enterprise user with a prompt.
   - User requirement: normal chat defaults to no agent. If no agent is selected, it must not query knowledge base.

4. **Default model selection is not product-policy based**
   - File: `lib/ai-entry/model-catalog.ts`
   - Current order is primarily provider family + alphabetical model name.
   - This makes `haiku` appear before `sonnet`, and provider default can win even when product quality needs a different default.

5. **Consulting advisor uses quality-first model even when speed is the complaint**
   - File: `lib/ai-entry/model-policy.ts`
   - Current consulting mode locks to Sonnet 4.6.
   - Sonnet 4.6 is not reasonable as the default in a speed-first context based on current probe data. It should be reserved for quality/deep mode or explicit complex tasks.

6. **Prompt posture is too terse for competitive quality**
   - File: `app/api/ai/chat/route.ts`
   - System prompt says: `Provide concise but actionable answers...`
   - For users comparing against DeepSeek/Doubao, this often reads as shallow. Keep concise structure, but require enough reasoning, examples, and next actions.

## 3. Target Behavior

### Normal Chat, No Agent Selected

- No enterprise knowledge query.
- Tools available, but model calls web search only from intent.
- Default model is a measured speed-first Aiberm model that still passes a minimum answer-quality rubric.
- Expected UX:
  - conversation initialized under 1s.
  - first visible token p50 <= 3s after warm-up.
  - no `knowledge_query_*` events.

### Normal Chat, Agent Selected

- Agent instruction may load.
- Enterprise knowledge may be queried if the selected agent is intended to use enterprise context.
- Web search remains intent-based.

### Fresh/Latest Questions

- Web search tool should be available and sources should render in the progress timeline.
- Tool result payload must include source URLs.
- Final answer should cite URLs that shaped the response.

### Consulting Advisor

- Speed-first default should not be Sonnet 4.6.
- Recommended policy:
  - consulting speed default: `claude-sonnet-4.5` if Aiberm benchmark passes latency target.
  - consulting quality/deep mode: `claude-sonnet-4.6`.
  - fallback fast mode: `claude-haiku-4.5` only for lightweight triage or when latency budget is strict.
- Sonnet 4.6 is reasonable for deep analysis, high-stakes strategy, or explicit "quality first" mode; it is not reasonable as the speed-first default.

## 4. Model Policy Decision

Implement this model choice order after benchmarking Aiberm candidates:

1. Exclude `*-thinking` models from default speed paths.
2. Benchmark these Aiberm candidates first:
   - `claude-haiku-4.5`
   - `claude-sonnet-4.5`
   - `claude-sonnet-4.6`
   - optionally `gpt-5.3-codex` only if it is intended for general business chat.
3. Pick normal-chat default with this rule:
   - Prefer `claude-sonnet-4.5` if first-token p50 <= 5s and answer quality score >= 4/5.
   - Else use `claude-haiku-4.5` for normal no-agent chat, but add visible "speed mode" semantics and route complex tasks to an agent or stronger model.
4. Pick consulting speed default:
   - Prefer `claude-sonnet-4.5`.
   - Do not use `claude-sonnet-4.6` unless quality mode or complexity routing selects it.
5. Pick consulting quality default:
   - `claude-sonnet-4.6`.

## 5. Feature Flags And Env Contract

Add or document these env variables, with safe defaults:

```env
AI_ENTRY_NORMAL_DEFAULT_MODEL=claude-sonnet-4.5
AI_ENTRY_NORMAL_FAST_MODEL=claude-haiku-4.5
AI_ENTRY_CONSULTING_SPEED_MODEL=claude-sonnet-4.5
AI_ENTRY_CONSULTING_QUALITY_MODEL=claude-sonnet-4.6
AI_ENTRY_CONSULTING_MODEL_MODE=speed
AI_ENTRY_DISABLE_KB_FOR_NO_AGENT=true
AI_ENTRY_ENABLE_WEB_SEARCH=true
```

Rules:

- `AI_ENTRY_NORMAL_DEFAULT_MODEL` is used only for normal chat defaults.
- `AI_ENTRY_CONSULTING_SPEED_MODEL` is used when `entry=consulting-advisor` and mode is `speed`.
- `AI_ENTRY_CONSULTING_QUALITY_MODEL` is used for explicit quality/deep mode.
- If a configured model is not in provider catalog, fall back to measured candidates in the same tier.

---

### Task 1: Lock Failing Regression Tests For Streaming And Tool Results

**Files:**
- Create: `d:/github/aimarketing/lib/skills/runtime/ai-entry-executor.regression.test.ts`
- Modify: `d:/github/aimarketing/package.json` if a targeted script is useful

**Step 1: Add a fake stream test for text field**

Test requirement:

```ts
test("streaming executor emits deltas from SDK text field", async () => {
  // Simulate fullStream yielding:
  // { type: "text-delta", text: "hello" }
  // Expected onTextDelta receives "hello".
})
```

**Step 2: Add a fake tool result test for output field**

Test requirement:

```ts
test("streaming executor exposes tool output in onToolResult", async () => {
  // Simulate fullStream yielding:
  // { type: "tool-result", toolName: "web_search", toolCallId: "t1", output: { results: [...] } }
  // Expected onToolResult payload.result equals output.
})
```

**Step 3: Run test and confirm failure**

Run:

```bash
pnpm exec tsx --test lib/skills/runtime/ai-entry-executor.regression.test.ts
```

Expected before implementation:

- text delta test fails because executor reads `textDelta`.
- tool result test fails because executor reads `result`.

### Task 2: Fix Streaming And Tool Result Compatibility

**Files:**
- Modify: `d:/github/aimarketing/lib/skills/runtime/ai-entry-executor.ts`
- Test: `d:/github/aimarketing/lib/skills/runtime/ai-entry-executor.regression.test.ts`

**Step 1: Update stream part compatibility type**

Implementation shape:

```ts
type FullStreamPart = {
  type?: string
  text?: string
  textDelta?: string
  toolName?: string
  toolCallId?: string
  args?: unknown
  input?: unknown
  result?: unknown
  output?: unknown
  error?: unknown
}
```

**Step 2: Read both old and new text fields**

Implementation shape:

```ts
const delta = streamPart.textDelta || streamPart.text || ""
```

**Step 3: Read both old and new tool result fields**

Implementation shape:

```ts
result: streamPart.result ?? streamPart.output ?? null
```

**Step 4: Verify targeted tests**

Run:

```bash
pnpm exec tsx --test lib/skills/runtime/ai-entry-executor.regression.test.ts
```

Expected: PASS.

### Task 3: Stop Knowledge Query For Normal No-Agent Chat

**Files:**
- Modify: `d:/github/aimarketing/app/api/ai/chat/route.ts`
- Test: `d:/github/aimarketing/lib/ai-entry/chat-interaction.integration.test.ts`

**Step 1: Add a route-level behavior test**

Test requirement:

```ts
test("normal chat without selected agent does not query enterprise knowledge", async () => {
  // POST /api/ai/chat with conversationScope="chat" and no agentConfig.
  // Mock/spy loadEnterpriseKnowledgeContext.
  // Expected: no knowledge_query_start event and no loadEnterpriseKnowledgeContext call.
})
```

**Step 2: Add selected-agent behavior test**

Test requirement:

```ts
test("normal chat with selected agent may query enterprise knowledge", async () => {
  // POST /api/ai/chat with agentConfig.agentId.
  // Expected: knowledge query can run.
})
```

**Step 3: Change query gate**

Implementation rule:

```ts
const shouldUseEnterpriseKnowledge =
  canQueryEnterpriseKnowledge &&
  Boolean(effectiveAgentId)
```

Important:

- `effectiveAgentId` must be known before computing final knowledge eligibility.
- For normal no-agent chat, `effectiveAgentId` is `null`.
- For consulting advisor, auto-routing sets `effectiveAgentId`, so knowledge remains available.

**Step 4: Verify**

Run:

```bash
pnpm exec tsx --test lib/ai-entry/chat-interaction.integration.test.ts
```

Expected: new tests pass; existing provider fallback tests still pass.

### Task 4: Repair Chinese Prompt Literals And Quality Posture

**Files:**
- Modify: `d:/github/aimarketing/app/api/ai/chat/route.ts`
- Modify: `d:/github/aimarketing/components/ai-entry/ai-entry-workspace.tsx` only if visible progress labels are still mojibake
- Test: `d:/github/aimarketing/lib/ai-entry/language-policy.regression.test.ts` or new focused test

**Step 1: Replace mojibake Chinese strings**

Known areas to inspect:

- `buildAiEntryKnowledgeQueryVariants`
- Chinese language lock directive
- Chinese web-search progress labels in AI entry workspace

Expected clean literals:

```ts
variants.push(`${enterpriseName} 企业介绍`)
variants.push(`${enterpriseName} 核心业务与产品`)
variants.push(`${enterpriseName} 目标客户与典型场景`)
```

**Step 2: Improve answer posture**

Replace terse-only instruction:

```ts
"Provide concise but actionable answers with structured bullets when useful."
```

With:

```ts
"Start with a clear conclusion, then provide enough reasoning, concrete examples, and next actions to be useful. Keep structure easy to scan, but do not under-answer complex business questions."
```

**Step 3: Add Chinese smoke test**

Test prompt:

```txt
请给一家B2B跨境营销服务公司，制定AI对话助手提速和质量提升方案。
```

Expected:

- answer is Chinese.
- answer does not say the input contains garbled text.
- answer includes diagnosis, changes, and verification.

### Task 5: Add Aiberm Model Benchmark And Default Selection Policy

**Files:**
- Create: `d:/github/aimarketing/scripts/ai_entry_aiberm_model_benchmark.js`
- Modify: `d:/github/aimarketing/lib/ai-entry/model-catalog.ts`
- Modify: `d:/github/aimarketing/lib/ai-entry/provider-routing.ts`
- Test: `d:/github/aimarketing/lib/ai-entry/model-catalog.regression.test.ts`

**Step 1: Add benchmark script**

Script behavior:

```bash
node scripts/ai_entry_aiberm_model_benchmark.js --models claude-haiku-4.5,claude-sonnet-4.5,claude-sonnet-4.6 --runs 3
```

Record for each model:

- first event latency
- first token latency
- total latency
- answer character count
- rough quality rubric score from deterministic checks

Output:

```json
{
  "provider": "aiberm",
  "candidates": [
    {
      "model": "claude-sonnet-4.5",
      "firstTokenP50Ms": 4200,
      "totalP50Ms": 12000,
      "qualityScore": 4
    }
  ],
  "recommendedNormalDefault": "claude-sonnet-4.5",
  "recommendedConsultingSpeedDefault": "claude-sonnet-4.5"
}
```

**Step 2: Add model scoring helpers**

Implementation shape:

```ts
function isThinkingModel(id: string) {
  return /\bthinking\b/i.test(id)
}

function scoreNormalDefaultModel(id: string) {
  if (isThinkingModel(id)) return -1000
  if (/sonnet[-.]?4[-.]?5/i.test(id)) return 300
  if (/haiku[-.]?4[-.]?5/i.test(id)) return 250
  if (/sonnet[-.]?4[-.]?6/i.test(id)) return 220
  if (/opus/i.test(id)) return 100
  return 0
}
```

**Step 3: Do not rely on alphabetical compare for default**

Keep alphabetical ordering for display if needed, but default selection must use product policy:

- normal default: `AI_ENTRY_NORMAL_DEFAULT_MODEL` if available, else highest `scoreNormalDefaultModel`.
- normal fast fallback: `AI_ENTRY_NORMAL_FAST_MODEL`.
- exclude `thinking` models from default.

**Step 4: Add regression tests**

Test model list:

```ts
[
  "claude-haiku-4.5",
  "claude-opus-4.6",
  "claude-sonnet-4.5",
  "claude-sonnet-4.6-thinking"
]
```

Expected:

- selected normal default is `claude-sonnet-4.5` when configured or score policy chooses it.
- thinking variants are never default.
- Haiku remains available in dropdown.

### Task 6: Split Consulting Speed And Quality Model Policy

**Files:**
- Modify: `d:/github/aimarketing/lib/ai-entry/model-policy.ts`
- Modify: `d:/github/aimarketing/app/api/ai/chat/route.ts`
- Modify: `d:/github/aimarketing/components/ai-entry/ai-entry-workspace.tsx`
- Test: `d:/github/aimarketing/lib/ai-entry/chat-interaction.integration.test.ts`

**Step 1: Replace hard-coded Sonnet 4.6 hint**

Current constant:

```ts
export const AI_ENTRY_SONNET_46_MODEL_HINT = "sonnet-4.6"
```

New policy:

```ts
export const AI_ENTRY_CONSULTING_SPEED_MODEL_HINT = "claude-sonnet-4.5"
export const AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT = "claude-sonnet-4.6"
```

**Step 2: Add mode resolver**

Implementation shape:

```ts
export function resolveConsultingModelMode(input: {
  requestedMode?: unknown
  prompt?: string
}) {
  const explicit = typeof input.requestedMode === "string" ? input.requestedMode.trim() : ""
  if (explicit === "quality" || explicit === "speed") return explicit
  return process.env.AI_ENTRY_CONSULTING_MODEL_MODE === "quality" ? "quality" : "speed"
}
```

**Step 3: Use mode in chat route**

- `speed` mode uses `AI_ENTRY_CONSULTING_SPEED_MODEL`.
- `quality` mode uses `AI_ENTRY_CONSULTING_QUALITY_MODEL`.
- Preserve provider failover.

**Step 4: Add UI affordance**

In consulting advisor page:

- show a compact segmented control:
  - `快速`
  - `深度`
- Default: `快速`.
- Tooltip:
  - 快速: lower latency, good quality.
  - 深度: higher quality, slower first response.

**Step 5: Tests**

Expected:

- consulting default no longer locks to Sonnet 4.6 in speed mode.
- quality mode still locks to Sonnet 4.6.
- provider fallback keeps requested model family.

### Task 7: Web Search Tool Event And Source Rendering

**Files:**
- Modify: `d:/github/aimarketing/lib/skills/runtime/ai-entry-executor.ts`
- Modify: `d:/github/aimarketing/components/ai-entry/ai-entry-workspace.tsx`
- Test: `d:/github/aimarketing/lib/ai-entry/chat-interaction.integration.test.ts`

**Step 1: Ensure backend sends output sources**

After Task 2, event payload should contain:

```json
{
  "event": "tool_result",
  "data": {
    "toolName": "web_search",
    "result": {
      "query": "...",
      "results": [
        { "title": "...", "url": "...", "snippet": "..." }
      ]
    }
  }
}
```

**Step 2: Frontend timeline shows source count and first sources**

Expected UI behavior:

- On `tool_call`: show "正在搜索网页" plus query.
- On `tool_result`: show source count and 1-2 source titles.
- If result is empty, show "未检索到可用来源" instead of silently completing.

**Step 3: Final answer citations**

System prompt already says cite URLs after using web search. Verify the final answer includes source URLs or at least source names and links.

### Task 8: Runtime Performance Probe And Acceptance Script

**Files:**
- Create: `d:/github/aimarketing/scripts/ai_entry_chat_quality_speed_probe.js`
- Test artifact: `d:/github/aimarketing/.gstack/qa-reports/ai-chat-quality-speed-after-fix-YYYY-MM-DD.json`

**Step 1: Add probe scenarios**

Scenarios:

1. Normal no-agent Chinese business prompt.
2. Normal no-agent English business prompt.
3. Latest/current question requiring web search.
4. Normal selected agent prompt.
5. Consulting advisor speed mode.
6. Consulting advisor quality mode.

**Step 2: Record metrics**

For each scenario:

- selected provider/model
- first SSE event
- first visible token
- total latency
- answer length
- whether knowledge query ran
- whether web search ran
- source count

**Step 3: Acceptance thresholds**

Normal no-agent:

- no knowledge query events.
- first visible token p50 <= 3s after warm-up.
- full response p50 <= 15s for normal business prompts.
- answer contains concrete steps, not only generic statements.

Fresh/latest:

- web search tool called when intent requires fresh info.
- tool result sources visible in timeline.
- final answer cites source URLs.

Consulting speed:

- not Sonnet 4.6 by default.
- first visible token p50 <= 10s after warm-up.
- answer quality remains business-useful.

Consulting quality:

- may use Sonnet 4.6.
- UI clearly signals slower/deeper mode.

### Task 9: End-To-End Browser Verification

**Files:**
- Create or extend: `d:/github/aimarketing/scripts/ai_entry_chat_quality_speed_e2e.py`
- Artifacts: `d:/github/aimarketing/.gstack/qa-reports/screenshots/`

**Step 1: Run local dev server**

Run:

```bash
pnpm exec next dev -p 3018
```

**Step 2: Login as VBUY admin**

Use existing VBUY admin account from local QA context.

**Step 3: Verify normal no-agent UI**

Navigate:

```txt
/dashboard/ai
```

Expected:

- no agent selected by default.
- model displayed is the selected normal default.
- sending a normal prompt does not show enterprise knowledge query event.
- response streams visibly before completion.

**Step 4: Verify fresh question**

Prompt:

```txt
今天AI营销自动化领域最近有什么值得关注的变化？请给来源。
```

Expected:

- web search progress visible.
- sources visible.
- final answer cites sources.

**Step 5: Verify consulting speed/deep mode**

Navigate:

```txt
/dashboard/ai?entry=consulting-advisor
```

Expected:

- default mode is speed.
- speed mode model is not Sonnet 4.6.
- deep mode can use Sonnet 4.6 and clearly warns slower response.

### Task 10: Release Gate

**Files:**
- No code file required unless release notes are maintained.

**Verification commands:**

```bash
pnpm exec eslint app/api/ai/chat/route.ts components/ai-entry/ai-entry-workspace.tsx lib/ai-entry/model-catalog.ts lib/ai-entry/model-policy.ts lib/skills/runtime/ai-entry-executor.ts --max-warnings=0
pnpm exec tsx --test lib/skills/runtime/ai-entry-executor.regression.test.ts
pnpm exec tsx --test lib/ai-entry/model-catalog.regression.test.ts
pnpm exec tsx --test lib/ai-entry/chat-interaction.integration.test.ts
node scripts/ai_entry_chat_quality_speed_probe.js
python scripts/ai_entry_chat_quality_speed_e2e.py
```

Release can pass only when:

- streaming field fix is verified.
- tool source payload fix is verified.
- normal no-agent chat has no KB query.
- Aiberm model benchmark result is attached.
- normal default model decision is recorded.
- consulting speed mode does not default to Sonnet 4.6.
- staging smoke test passes.

## 6. Rollout Plan

1. Ship Tasks 1-3 first behind `AI_ENTRY_DISABLE_KB_FOR_NO_AGENT=true`.
2. Ship Task 4 prompt/language cleanup.
3. Run benchmark from Task 5 and choose the normal default.
4. Ship model policy split from Task 6 behind env flags.
5. Ship web source UI verification from Task 7.
6. Run full probes and staging browser test.
7. Roll out to production.

## 7. Rollback Plan

Fast rollback switches:

```env
AI_ENTRY_DISABLE_KB_FOR_NO_AGENT=false
AI_ENTRY_NORMAL_DEFAULT_MODEL=claude-haiku-4.5
AI_ENTRY_CONSULTING_MODEL_MODE=quality
```

Code rollback order:

1. Revert model policy split if provider compatibility fails.
2. Keep streaming/tool-result compatibility fix unless it causes a regression; it is forward-compatible with both old and new field names.
3. Keep no-agent KB gating unless product explicitly wants enterprise knowledge in plain chat.

## 8. Open Decisions

1. Final normal default model must be chosen after Aiberm benchmark, not by assumption.
2. Decide whether users see a "speed/deep" mode globally or only in consulting advisor.
3. Decide whether normal chat can auto-upgrade from Haiku to Sonnet for complex prompts without selecting an agent.
4. Decide whether web search should be force-enabled for explicit latest/current/today prompts, or remain fully model-intent driven with stronger system guidance.

## 9. Recommended Initial Product Decision

Based on current evidence:

- Normal no-agent chat: do not query KB; use `claude-sonnet-4.5` as the target default if benchmark confirms acceptable latency. If not, keep `claude-haiku-4.5` as explicit speed mode, not as the only default.
- Consulting advisor speed mode: use `claude-sonnet-4.5`.
- Consulting advisor deep/quality mode: use `claude-sonnet-4.6`.
- Sonnet 4.6 is not reasonable for speed-first consulting by default because current first visible token was about 55s in the real probe.
