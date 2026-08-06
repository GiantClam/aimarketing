## Context

See [proposal.md](./proposal.md) for motivation and scope. The current Writer path reads a bounded message history, persists an empty pending assistant message, changes the conversation to `drafting`, runs a separate brief-extraction turn, and conditionally injects the prior draft into a second generation turn. `runWriterOpenCodeText()` currently supplies no stable session key, so continuity depends on reconstructed and clipped application prompts.

The repository already provides the required infrastructure: asynchronous assistant tasks, Writer conversation/message persistence, billing reservations, a shared Railway OpenCode runtime, runtime Skill selection, R2-backed assets, Writer memory/soul, `writer_webfetch`, and platform Skill files. The design reuses these components and introduces no new third-party dependency or per-platform runtime configuration.

The source implementation plan is [Writer Assistant OpenCode + Skill First 重构实施方案](../../../docs/plans/2026-08-06-writer-assistant-opencode-skill-first-refactor.zh-CN.md). The behavioral contracts are defined in the four capability specs under this change.

## Goals / Non-Goals

**Goals:**

- Make one OpenCode turn and one primary platform Skill authoritative for every Writer text request.
- Preserve complete active article context across normal continuation, manual edits, runtime restarts, and Skill replacement.
- Separate task progress, turn outcome, document revision, and asset status.
- Make platform Skills replaceable through a validated registry and release digest.
- Keep authentication, billing, persistence, network safety, tenant isolation, and image generation under application governance.
- Produce sufficient diagnostics to prove which session, draft revision, platform Skill, operation, research path, and asset progress were used.

**Non-Goals:**

- Direct publishing to social platforms.
- Dynamic installation of user-supplied or unknown Skills.
- Running old and new Writer implementations in parallel.
- Per-platform OpenCode services or environment variables.
- Moving database, billing, R2, credential, or unrestricted network access into Skills.
- Using OpenCode session state as the only durable copy of an article.
- Adding a legacy fallback path after production cutover.

## Decisions

### Decision 1: Use a stable conversation-scoped OpenCode session plus a durable canonical draft

Each Writer conversation receives a deterministic session key derived from environment, enterprise or personal scope, user ID, conversation ID, and agent ID. The raw tuple is hashed before runtime/log usage.

OpenCode session state preserves workflow and tool continuity, but the database remains authoritative for the active draft and revision. Whenever an active draft exists, its complete Markdown and current revision are supplied as a separate runtime context field. Chat history may be summarized; active draft, current user instruction, authored title, and source URLs may not be silently clipped.

If the runtime reports a missing/inconsistent session, the service retries once with a recovery snapshot. The snapshot contains the complete active draft, current platform binding, revision, recent turns, and memory context. A second failure terminates the task without changing the active revision or finalizing duplicate charges.

**Alternative considered:** Depend only on a persistent OpenCode session. Rejected because runtime restart, container sleep, or checkpoint loss would make the article unrecoverable.

**Alternative considered:** Start a new OpenCode run and concatenate all history each turn. Rejected because large drafts are clipped and Skill workflow state is reconstructed inconsistently.

### Decision 2: Run one OpenCode execution per Writer text turn

The application no longer performs a model-backed briefing pass followed by a drafting pass. It prepares governed context, resolves the allowed Skill registry, and executes one OpenCode turn. `writer-orchestrator` interprets the current request, selects the target platform when explicitly changed, activates one platform primary Skill, and allows that Skill to ask a question or produce a result.

Application code does not infer `create`, `revise`, `translate`, `research`, or `adapt_platform` from regular expressions or conversation status. It validates the Skill's structured operation after execution.

**Alternative considered:** Keep the structured brief extractor as a guardrail. Rejected because it duplicates platform Skill judgment, consumes a second model call, and was the source of state/prompt divergence.

### Decision 3: Require a governed structured result tool

The runtime exposes `writer_submit_result`. A successful turn must call it exactly once with a schema-versioned result containing:

- outcome and operation;
- platform ID and user-visible message;
- optional complete draft, title, and base revision;
- research requested/completed state and final source URLs;
- normalized cover/inline asset intents.

The tool validates shape and bounded values but does not access the database or network. The application validates the result again against the current conversation revision and platform registry before persistence. OpenCode final prose is not parsed as an implicit fallback.

**Alternative considered:** Return JSON as the model's final assistant text. Rejected because free-form/fenced output is less reliable and mixes protocol metadata with publishable content.

**Alternative considered:** Detect outcome and operation from generated text. Rejected because it recreates heuristic application routing.

### Decision 4: Separate platform availability from platform activation

The runtime makes only registry-approved Writer Skills discoverable. The application supplies the UI-selected/active platform as the default plus allowed platform bindings. `writer-orchestrator` may choose a different binding only when the current turn explicitly requests a supported platform switch. Exactly one primary platform Skill must be observed in runtime activation events and must match the submitted result platform.

Optional style Skills are allowed only when user-selected and listed as compatible by the active platform binding. They cannot replace the primary Skill or its safety/output contract.

For WeChat, `khazix-writer` becomes the primary Skill. `writer-wechat` is not activated in WeChat turns.

**Alternative considered:** Install/activate all platform Skills and let them compete. Rejected because multiple editorial authorities produce conflicting format and quality rules.

**Alternative considered:** Parse platform aliases in the application before OpenCode. Rejected because natural-language routing would remain duplicated outside the Skill workflow.

### Decision 5: Use a schema-versioned platform Skill registry

`content/skills/writer-catalog.json` becomes a schema v2 registry. Each listed platform declares:

- stable platform ID and aliases;
- one primary Skill reference with interface version, release, and digest;
- supported modes and Writer operations;
- research capability;
- cover/inline image policy;
- title/output/length contract;
- compatible optional style Skills.

`content/skills/` is the canonical source. A synchronization command generates the Railway runtime Skill tree, references, catalog, and digests. CI regenerates and checks for drift. Runtime loading fails closed on digest mismatch.

A Skill replacement changes only source files and the platform binding, then regenerates the runtime bundle. Existing conversations use the current binding and pass prior Skill metadata for context; the old Skill is not executed.

**Alternative considered:** Keep TypeScript platform unions and hard-coded WeChat defaults as the source of truth. Rejected because every platform addition or replacement would require main workflow code changes.

### Decision 6: Model articles as immutable revisions with an active pointer

Writer conversation state gains:

- monotonic document revision;
- active draft message/version ID;
- turn outcome;
- independent asset status;
- active platform ID;
- runtime context hash;
- resolved Skill release/digest diagnostics.

AI transformations and manual editor saves both submit `expectedRevision`. A successful save creates revision N+1 and atomically advances the active pointer. Old revisions remain readable. A stale expected revision returns a conflict and never overwrites the active draft.

Pending/running task messages are progress records, not article replacements. The UI keeps the active draft visible until a validated new revision commits.

**Alternative considered:** Update the latest assistant message in place. Rejected because it destroys history, cannot resolve concurrent edits, and makes recovery context ambiguous.

### Decision 7: Keep research decisions in Skills and safety enforcement in tools

Raw user requests reach OpenCode without application-side URL intent extraction. The selected Skill decides whether a supplied URL or fresh information requires retrieval. `writer_webfetch` enforces protocol, DNS/IP SSRF rules, redirect count, content type/size, timeout, and audit metadata. A separate read-only enterprise search capability binds enterprise scope from authentication, never from model input.

The result records whether research was requested and completed. Failed retrieval must not be represented as verified research.

**Alternative considered:** Pre-extract and fetch every URL in application code. Rejected because URL occurrence does not imply source intent and regex enumeration cannot model the conversation.

### Decision 8: Keep image intent in Skills and image execution in the application

Platform Skills submit normalized asset intents. The application validates platform limits and owns generation, billing, storage, URLs, and progress. WeChat/Khazix must support a cover intent; other platform policies come from the registry.

Image execution is sequential and resumable. Each image gets its own timeout. There is no encompassing timeout shorter than the cumulative permitted per-image duration. Progress is persisted after every image; ready images survive later failures and worker recovery. Final asset status may be partial.

**Alternative considered:** Let OpenCode directly call image providers and embed URLs. Rejected because it bypasses billing, storage, retry, and tenant governance.

### Decision 9: Split the current Writer orchestration by responsibility

The large Writer implementation is decomposed into focused modules:

- runtime contracts, context, session key, invocation, and result validation;
- turn service for task/billing/persistence orchestration;
- Skill registry and contract validation;
- repository operations for revision and recovery state;
- existing asset runtime for governed image execution.

`app/api/writer/chat/route.ts` remains a thin authenticated enqueue boundary. `lib/assistant-async.ts` delegates Writer tasks to the turn service. `lib/writer/skills.ts` loses application prompt construction, intent regexes, URL extraction, and two-stage model orchestration.

This is a responsibility split, not a new abstraction hierarchy; no new package dependency is introduced.

## Data and Runtime Flow

```text
POST writer chat
  -> authenticate / rate limit
  -> load active revision and platform default
  -> persist user turn + pending task record
  -> reserve billing
  -> derive stable session key
  -> build full Writer runtime context
  -> invoke shared OpenCode once
       -> writer-orchestrator
       -> exactly one primary platform Skill
       -> optional governed research tools
       -> writer_submit_result
  -> validate result + expected revision + Skill activation
  -> atomically persist new revision/outcome/diagnostics
  -> finalize billing
  -> enqueue validated asset intents if requested
```

## Failure and Idempotency Rules

- Task retry uses the existing task ID/idempotency key and MUST NOT reserve/finalize billing twice.
- Session recovery is limited to one retry per turn.
- Result persistence checks expected revision inside the same transaction that advances the active pointer.
- Invalid structured results, unknown platform bindings, Skill digest mismatch, multiple primary activations, or stale revisions fail without replacing the active draft.
- Asset generation persists each item independently and skips already-ready assets during recovery.
- Logs record hashes, IDs, lengths, operations, outcomes, Skill release/digest, tool counts, and timing; they do not record complete article bodies, credentials, or enterprise source text.

## Risks / Trade-offs

- **[Risk] Full active drafts increase input tokens and latency** → Keep old conversation history bounded, send only one canonical active draft, enforce a documented article hard limit, and measure p50/p95 plus quality.
- **[Risk] Persistent runtime session may drift from the database** → Include revision/context hash on every turn; database wins; recover once from a complete snapshot on mismatch.
- **[Risk] Structured tool submission may fail after good prose was generated** → Treat the turn as failed and preserve the old draft; improve Skill fixtures rather than parsing ungoverned fallback text.
- **[Risk] Orchestrator may activate the wrong platform** → Validate activation events and result platform against the registry; no explicit switch means active/default platform remains authoritative.
- **[Risk] Registry/runtime Skill drift can break a whole platform** → Generate from one source, pin digests, validate in CI, and fail publication/runtime loading before execution.
- **[Risk] Atomic cutover has a larger release surface** → Land changes in dependency order, require complete local and production test matrices, and release application/runtime/Skill bundle as one compatibility unit.
- **[Risk] Additive revision storage increases database usage** → Retain immutable text revisions because they are required for correctness; exclude generated binary assets from revision rows and keep assets in R2.
- **[Risk] Multi-image tasks are longer** → Expose per-image progress, allow partial results, and rely on task recovery rather than a short global timeout.

## Migration Plan

1. Add failing contract tests for stable sessions, complete active draft injection, result submission, registry uniqueness, revision conflicts, and per-image timeout behavior.
2. Add the new conversation state/revision fields and indexes with an additive migration. Backfill each existing conversation's latest non-empty assistant article as revision 1 and active draft where possible.
3. Add runtime contracts, stable session derivation, recovery snapshot, result tool, and registry validation while the old path remains unused in production.
4. Convert `khazix-writer` and every listed platform Skill to the contract; generate and validate the runtime bundle from the canonical source.
5. Switch API/task/UI/asset consumers together to the new state and single Writer turn service.
6. Delete the old brief extractor, intent/URL regexes, status-gated draft injection, WeChat dual-Skill binding, and manual runtime Skill copies in the same release branch.
7. Run local unit, integration, Skill fixture, runtime, billing, recovery, UI, full-platform E2E, and same-prompt quality comparisons.
8. Publish the database migration first, then the compatible application and Railway OpenCode image/Skill bundle as one cutover. Execute production smoke tests for every platform, complete-article revision, URL research, cover image, multi-image recovery, and actual Skill activation evidence.

There is no production fallback to the legacy Writer generation path. Before traffic cutover, a failed gate stops release. After cutover, defects are fixed forward while preserving database revisions and task idempotency.
