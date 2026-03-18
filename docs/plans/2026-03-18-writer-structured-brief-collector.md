# Writer Structured Brief Collector Implementation Plan

> Use this plan to execute the work task-by-task with tight verification after each step.

**Goal:** Replace regex-heavy multi-turn brief collection with a structured-output collector while keeping deterministic conversation control in code.

**Architecture:** Introduce a dedicated brief extraction pass that asks the model for typed JSON describing the user’s latest contribution and brief sufficiency. Keep turn limits, readiness checks, defaults, and persistence in TypeScript so the workflow remains deterministic and testable. Reuse the existing skill documents for collection policy and platform writing guidance instead of hardcoding wording in one place.

**Tech Stack:** Next.js, TypeScript, existing writer Aiberm integration, Zod for schema validation, ESLint verification

---

### Task 1: Add the structured brief extraction types and schema

**Files:**
- Modify: `lib/writer/skills.ts`

**Step 1: Add typed result shapes for brief extraction**

Create a `WriterBriefExtractionResult` type that captures:
- `briefDelta`
- `answeredFields`
- `suggestedFollowUpFields`
- `suggestedFollowUpQuestion`
- `userWantsDirectOutput`
- `briefSufficient`
- `confidence`

**Step 2: Add a Zod schema for runtime validation**

Use `z.object(...)` so the extractor result is validated before it affects workflow logic.

**Step 3: Run lint on the file**

Run: `npx eslint lib/writer/skills.ts`
Expected: PASS or only pre-existing warnings

### Task 2: Implement the model-backed brief extraction pass

**Files:**
- Modify: `lib/writer/skills.ts`

**Step 1: Add a prompt builder for brief extraction**

Build a prompt that includes:
- current platform and mode
- recent conversation turns
- current merged brief
- required fields from the briefing skill
- explicit JSON-only output instructions

**Step 2: Add a helper that calls the writer model for JSON**

Implement a helper that calls the model and parses the result against the new schema.

**Step 3: Add a deterministic fallback**

If the model call fails or returns invalid JSON, fall back to the existing heuristic extraction so the feature degrades safely.

**Step 4: Run lint**

Run: `npx eslint lib/writer/skills.ts`
Expected: PASS

### Task 3: Refactor the brief collection workflow to use the extractor

**Files:**
- Modify: `lib/writer/skills.ts`

**Step 1: Merge extractor output into the existing brief state**

Update the brief merge path so the new structured extractor updates `topic`, `audience`, `objective`, `tone`, and `constraints`.

**Step 2: Keep readiness logic in code**

Retain deterministic checks for:
- max turns
- direct-output overrides
- tone fallback
- ready-for-generation gating

**Step 3: Use skill-guided follow-up generation**

Prefer the extractor’s suggested follow-up when valid, but keep code-level guardrails on how many fields can be asked and when clarification must stop.

**Step 4: Run lint**

Run: `npx eslint lib/writer/skills.ts`
Expected: PASS

### Task 4: Add regression coverage for the collector

**Files:**
- Create or modify: `tests` or `scripts` coverage closest to existing writer validation patterns
- Modify: `lib/writer/skills.ts` only if test hooks are needed

**Step 1: Add at least three regression cases**

Cover:
- short user reply that should fill `objective`
- specific request that should skip clarification
- turn-limit case that should fall back to platform tone and proceed

**Step 2: Run the narrow verification command**

Use the lightest available validation path for the added regression coverage.

**Step 3: Re-run lint**

Run: `npx eslint lib/writer/skills.ts`
Expected: PASS

### Task 5: Verify end-to-end behavior stays coherent

**Files:**
- Modify: `lib/writer/skills.ts` if small fixes are needed

**Step 1: Manually verify the key control flow**

Check that `runWriterSkillsTurn` still returns:
- `needs_clarification` when the brief is still unusable
- `draft_ready` once the brief is sufficient or the turn limit is reached

**Step 2: Confirm no UI contract changes are required**

Make sure the response shape consumed by `lib/assistant-async.ts` is unchanged.

**Step 3: Final verification**

Run: `npx eslint lib/writer/skills.ts`
Expected: PASS
