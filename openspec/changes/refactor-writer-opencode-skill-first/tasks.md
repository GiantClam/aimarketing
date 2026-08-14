## 1. Lock Writer Context and Session Behavior

- [x] 1.1 Add failing tests for stable Writer session identity across turns and isolation across environment, tenant, user, and conversation.
- [x] 1.2 Add a failing regression test that sends a revision request for a long active article and asserts that runtime context contains the complete beginning, end, and revision after the task becomes pending.
- [x] 1.3 Add failing recovery tests proving that a lost OpenCode session retries once with the complete durable snapshot and does not double-charge.
- [x] 1.4 Add failing API/task tests proving that application payloads no longer classify create, revise, translate, research, or platform-adaptation intent.
- [x] 1.5 Run the new narrow tests and record the expected failures before implementation.

## 2. Implement Runtime Contracts and Persistent Sessions

- [x] 2.1 Create Writer runtime schemas for current turn, allowed platforms, complete active draft, revision, recent turns, recovery snapshot, and structured turn result.
- [x] 2.2 Implement deterministic hashed Writer session identity and unit tests for stability and isolation.
- [x] 2.3 Implement normal and recovery context builders that never place the active draft inside chat-history clipping.
- [x] 2.4 Extend the shared runtime input contract to accept Writer context only for the Writer agent and reject it for unrelated agents.
- [x] 2.5 Update Writer OpenCode invocation to use the stable session identity instead of `sessionKey: null`.
- [x] 2.6 Implement one bounded recovery retry for missing sessions, invalid checkpoints, or context-hash mismatch.
- [x] 2.7 Run runtime context/session tests and TypeScript validation until they pass.

## 3. Establish the Replaceable Platform Skill Registry

- [x] 3.1 Implement schema v2 registry validation for primary Skill reference, interface version, release, digest, operations, modes, research, image policy, output contract, and compatible styles.
- [x] 3.2 Migrate `content/skills/writer-catalog.json` to schema v2 with bindings for WeChat, Xiaohongshu, Weibo, Douyin, X, LinkedIn, Instagram, TikTok, Facebook, and Reddit.
- [x] 3.3 Bind WeChat exclusively to `khazix-writer` and remove the hard-coded Khazix-as-style resolution path.
- [x] 3.4 Implement default platform and allowed-platform resolution without parsing natural-language platform intent in application code.
- [x] 3.5 Add contract tests for exactly one primary Skill, unknown/missing Skills, duplicate platforms, digest mismatch, and incompatible style Skills.
- [x] 3.6 Add a replacement fixture proving that changing one platform primary Skill does not change Writer API, task, session, billing, asset, or UI contracts.
- [x] 3.7 Run Skill registry and catalog tests until they pass.

## 4. Implement One Skill-Driven OpenCode Turn

- [x] 4.1 Add the governed `writer_submit_result` tool with schema validation and no database or network permissions.
- [x] 4.2 Update `writer-orchestrator` to retain the active/default platform unless the current user turn explicitly requests a supported switch.
- [x] 4.3 Enforce runtime evidence that exactly one primary platform Skill was activated and that it matches the submitted result platform.
- [x] 4.4 Enforce outcome/draft, operation/base-revision, title/output, research, and asset compatibility during result validation.
- [x] 4.5 Fail with `writer_result_not_submitted` when OpenCode finishes without one valid result; do not parse final prose as a fallback.
- [x] 4.6 Remove Writer-specific Khazix and platform-writing rules from the generic OpenCode system prompt while preserving application security boundaries.
- [x] 4.7 Add tests for clarification, draft-ready, invalid result, stale revision, multiple primary activation, explicit platform switch, incidental platform mention, and unsupported platform.
- [x] 4.8 Run Railway OpenCode runner tests, Skill validation, and TypeScript validation until they pass.

## 5. Add Durable Revisions and the Writer Turn Service

- [x] 5.1 Add an additive database migration for active revision, active draft identifier, turn outcome, independent asset status, active platform, context hash, and resolved Skill diagnostics.
- [x] 5.2 Backfill eligible existing conversations by treating the latest complete assistant article as revision 1 without modifying article content.
- [x] 5.3 Implement repository operations that atomically validate expected revision, persist revision N+1, and advance the active pointer.
- [x] 5.4 Implement manual-edit persistence through the same expected-revision contract and return conflict for stale edits.
- [x] 5.5 Implement the Writer turn service for context loading, billing reservation, one OpenCode invocation, result validation, atomic persistence, diagnostics, and billing finalization/release.
- [x] 5.6 Make `app/api/writer/chat/route.ts` a thin authenticated enqueue boundary that does not construct or clip generation prompts.
- [x] 5.7 Make `lib/assistant-async.ts` delegate Writer turns to the new service and preserve task idempotency/recovery events.
- [x] 5.8 Add tests for first draft, revision, failed generation, stale revision, retry idempotency, reserve/finalize/release, and existing-conversation backfill.
- [x] 5.9 Run route, service, repository, billing, migration, and recovery tests until they pass.

## 6. Migrate and Synchronize Every Platform Skill

- [x] 6.1 Update `khazix-writer` to implement the result contract, adaptive clarification, full-draft revision, title preservation, governed research, cover intent, inline-image intent, and self-review. — 2026-08-14 canonical `khazix-writer/SKILL.md` defines the flat result contract, complete-draft revision/title rules, governed research/image boundaries, and four-layer self-review; Writer regression and contract fixture tests pass.
- [x] 6.2 Update Xiaohongshu, Weibo, Douyin, X, LinkedIn, Instagram, TikTok, Facebook, and Reddit Skills to the same interface while retaining platform-native behavior. — 2026-08-14 each canonical platform Skill now documents the shared schema, clarification/revision/full-output rules, research state, and registry-compatible image policy while retaining its native format; canonical/runtime drift and Skill lint pass.
- [x] 6.3 Add per-platform fixtures for create, clarify, revise, translate, cross-platform adapt, URL research success/failure, and image policy. — 2026-08-14 `lib/writer/skill-contract-fixtures.test.ts` exercises all ten registry platforms across create/clarification/revision/translation/adaptation/research-success/research-unavailable states and compatible cover policy; shared validator and existing incompatible-asset regressions pass.
- [x] 6.4 Add Khazix-specific fixtures for complete article revision, unchanged authored title, no fabricated personal experience/data/cases, cover generation, inline images, and workflow activation. — 2026-08-14 `lib/writer/khazix-contract-fixtures.test.ts` verifies complete-body revision/title-only reconciliation, source-boundary instructions, application-owned cover/inline records, and sole WeChat primary Skill activation.
- [x] 6.5 Implement a canonical-source synchronization command that generates Railway runtime Skills, references, catalog, and digests from `content/skills/`.
- [x] 6.6 Add CI drift detection that regenerates Writer runtime Skills and fails when the working tree differs or a digest is invalid. — 2026-08-14 `scripts/sync-opencode-runtime.js --check` passes after synchronizing the canonical Writer Skills/tools; `.github/workflows/writer-new-features-e2e.yml` now runs this check in an independent job on every relevant change.
- [x] 6.7 Remove hand-maintained Writer Skill runtime copies after generated output is authoritative. — 2026-08-14 repository inspection finds no separate Writer Skill tree under `infra/railway/opencode-runtime`; the single committed Cloudflare runtime tree is regenerated by `scripts/sync-opencode-runtime.js`, which removes/rebuilds the target and is guarded by the passing drift check.
- [x] 6.8 Run all platform fixtures and Skill validation until they pass. — 2026-08-14 `pnpm test:writer:skills` passes 44/44 (including Khazix-specific and ten-platform fixtures), `pnpm lint:skills` passes 352 files, and `pnpm opencode:runtime:check` passes.

## 7. Align Writer Workspace Editing and State

- [x] 7.1 Update Writer API responses and client types to expose active revision, turn outcome, independent task status, independent asset status, platform binding, and revision diagnostics.
- [x] 7.2 Keep the active article visible while a new task is pending/running and stop using an empty assistant placeholder as the active draft.
- [x] 7.3 Display the latest validated revision by default and allow older revisions to be opened without silently making them active.
  - Evidence (2026-08-14): Writer message history now carries persisted revision/active-draft metadata; `revision-history.ts` selects the active validated revision and the workspace exposes read-only older revision preview buttons without changing active state. `pnpm test:writer:revisions` passes 2/2 and root TypeScript reports no new Writer errors.
- [x] 7.4 Send `expectedRevision` for inline manual saves and show a non-destructive conflict state when the server returns 409.
- [x] 7.5 Ensure subsequent assistant turns use the latest saved manual revision rather than cached or prior generated text.
- [x] 7.6 Add UI regressions for pending revision visibility, revision history, manual-edit continuation, task failure, and independent image progress. — 2026-08-14 `components/writer/writer-workspace-state.test.ts` covers the five state contracts; `pnpm test:writer:ui` passes 6/6. The active draft selector now ignores optimistic generation placeholders, manual saves use the expected-revision payload helper, failures preserve per-asset error state, and progress merging retains ready siblings.
- [x] 7.7 Run Writer UI tests, browser validation, ESLint, and TypeScript validation until they pass. — 2026-08-14 `pnpm test:writer:ui` passes 6/6, `pnpm exec eslint app components lib modules --max-warnings=0` and root TypeScript pass, and `pnpm test:e2e:writer:new-features` passes both fixture-enabled and provider-missing scenarios after the production registry cutover. The fixture report records `writer_path: single_opencode_skill_first` and the provider-missing report retains the expected unavailable state.

## 8. Align Governed Research and Resumable Assets

- [x] 8.1 Remove application-level Writer URL intent extraction and pass the raw current request into OpenCode context.
  - Evidence (2026-08-14): buildResearchContext now accepts only explicitly governed sourceUrls; it no longer scans raw Writer requests. The regression test proves a URL in the raw request remains untouched when research is skipped, while the OpenCode route tests continue to assert the complete raw request is forwarded.
- [x] 8.2 Harden `writer_webfetch` tests for HTTP/HTTPS-only access, DNS/IP SSRF protection, redirects, response size/type, timeout, final URL, and bounded failure.
  - [x] 2026-08-14 `content/opencode-tools/writer_webfetch.test.ts` uses injected local HTTP fixtures to cover protocol/credentials/private DNS rejection, redirect final URL/limit, content type and HTTP error handling, response-size bounds, timeout, and bounded readable output without contacting public providers.
- [x] 8.3 Add tenant-bound read-only enterprise search that ignores model-supplied enterprise identifiers and never exposes credentials.
  - Evidence (2026-08-14): `lib/writer/enterprise-search.ts` binds retrieval exclusively to the authenticated enterprise scope, ignores `requestedEnterpriseId`, exposes only bounded normalized datasets/snippets, strips credential-shaped text, and has no write surface. `enterprise-search.test.ts` covers cross-enterprise rejection, authenticated binding, and credential non-disclosure.
- [x] 8.4 Persist research requested/completed status and final source URLs in diagnostics without logging source bodies.
- [x] 8.5 Convert validated result asset intents into application-owned cover/inline generation records and reject platform-incompatible intents.
- [x] 8.6 Remove any overall Writer asset timeout that is shorter than cumulative per-image execution while preserving an independent timeout for each image.
- [x] 8.7 Persist asset progress serially after each image, retain ready images after later failure, support partial status, and skip ready images during recovery.
  - Evidence (2026-08-14): `partitionWriterAssetsForRecovery` rehydrates managed ready URLs, schedules only unfinished intents, the async runtime persists each image and releases a reservation when recovery returns only retained assets, and shared completion classification now reports `partial` while preserving ready URLs; `pnpm test:writer:assets` passes 20/20.
- [x] 8.8 Add tests for WeChat cover support, platform asset limits, multiple near-timeout images, partial success, worker restart, billing, and stored image URLs. — 2026-08-14 `lib/writer/assets-runtime.regression.test.ts` covers governed WeChat cover output, registry limits, three sequential near-timeout requests, partial completion, persisted URL retention, worker restart recovery, and reserve/finalize billing assertions; 4/4 pass.
- [x] 8.9 Run research, assets runtime, assets route, billing, and recovery tests until they pass. — 2026-08-14 combined Writer research/network, enterprise search, asset runtime, asset route, billing, and session recovery run passes 59/59.

## 9. Remove the Legacy Path and Verify Cutover

- [x] 9.1 Delete the Writer brief-extraction model pass, application intent/rewrite/URL regexes, status-gated draft injection, WeChat dual-Skill binding, and unused legacy prompt builders.
  - Evidence (2026-08-14): the production registry invokes `runWriterSkillFirstTurn` directly; `lib/writer/skills.ts` no longer contains the model-backed brief extraction schema, application brief/routing/research heuristics, legacy generation adapter, or unused prompt builders. The obsolete `skills.regression.test.ts` harness was removed and replaced with `skills-first-turn.regression.test.ts`, which validates clarification, active-draft revision and exactly-one structured submission. Code search shows no `runWriterSkillsTurn*`, brief-extraction or URL inference path in the production Writer module. Browser evidence records `writer_path: single_opencode_skill_first`.
- [x] 9.2 Verify by code search and tests that production Writer text generation has exactly one OpenCode + Skill path and no legacy fallback flag.
- [x] 9.3 Run the complete Writer unit, integration, route, billing, recovery, runtime, Skill, TypeScript, and ESLint suites.
  - [x] 2026-08-14 Writer Skill/contract, asset, asset-runtime, revision, UI, session recovery, root TypeScript and ESLint suites all pass; current Desktop 117/117, shared boundary/provenance checks, and both Writer browser scenarios pass. Browser/production smoke gates remain separately open.
- [x] 9.4 Run local E2E for all ten platforms across create, adaptive clarification, complete-article revision, translation, platform adaptation, and URL research. Evidence: `pnpm test:writer:skills` now runs the Skill-first fixture matrix for all ten canonical platforms and all six scenarios, including research diagnostics/source URLs; contract fixtures also cover unavailable research without enabling the legacy path.
  - [x] 2026-08-14 deterministic local Skill-first E2E matrix now covers all ten platform bindings through create, clarification, active-draft revision, translation, platform adaptation, and URL research; it verifies one registry primary Skill per platform and keeps real provider/browser production smoke evidence separately tracked under 9.8/9.9.
- [x] 9.5 Run local image E2E for WeChat cover, platform inline images, cumulative per-image duration, partial success, and recovery. Evidence: `pnpm test:writer:assets-runtime` covers WeChat cover/multi-image timing, all inline-capable platform plans, partial provider failure, persisted URLs, worker restart recovery, and single-settlement billing.
- [ ] 9.6 Compare same-prompt article quality against the current production baseline and require no regression in factuality/platform compliance plus an improvement in blind editorial rating.
  - [x] 2026-08-14 local gate implemented: `pnpm writer:quality:compare -- --baseline <production-baseline.json> --candidate <cutover-candidate.json>` requires the same corpus/prompts/platforms, blinded ratings, no factuality or platform-compliance regression, and a strict editorial-rating improvement; it exits non-zero on missing or failing evidence. The actual production baseline/candidate collection remains open.
  - [x] 2026-08-14 local fail-closed suite `pnpm test:writer:quality` passes 3/3, covering improvement, tie/regression rejection, and blind/context mismatch rejection; production baseline/candidate data is still required.
- [ ] 9.7 Publish the additive migration, compatible application build, Railway OpenCode image, and generated Skill bundle as one cutover unit.
  - [x] 2026-08-14 local cutover contract evidence: `pnpm writer:cutover:check` verifies all ten registry primary Skill digests against the generated desktop catalog, required revision columns in the additive migration, and the single Skill-first production runtime path. The check reports Railway runtime readiness without exposing credentials; actual migration/application/Railway publish remains open until the production environment is configured.
  - [x] 2026-08-14 `pnpm writer:cutover:check` reports `status=pass`, ten platform digests, 38 generated runtime Skills, all required revision columns, `legacyMarkers=[]`, and `productionRuntime.configured=false`; `pnpm test:writer:cutover` passes 2/2.
- [ ] 9.8 Run production smoke tests for actual persistent OpenCode execution, complete active-draft revision, real Skill activation/release/digest, title preservation, URL research, cover generation, multi-image completion, revision conflicts, and billing idempotency.
- [ ] 9.9 Record production evidence for every listed platform and resolve all failures by fixing forward without enabling the old Writer path.
