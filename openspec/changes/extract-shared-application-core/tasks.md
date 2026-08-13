## 1. Confirm the Architecture Decision and Scope

- [x] 1.0 Verify `validate-windows-desktop-feasibility` records an `approved` foundation decision before changing shared production paths.
- [x] 1.1 Confirm WebView2 bootstrap implementation belongs to foundation and clean-VM repair evidence belongs to release hardening.
- [x] 1.2 Accept the local OpenCode + `ppt-master` product direction while keeping their production integration tests in downstream capability changes.
- [x] 1.3 Keep LanceDB and embedding behind host ports so unfinished RAG/release validation cannot contaminate shared packages.
- [x] 1.4 Record that runtime diagnostics are references, not prerequisites for host-neutral TypeScript extraction.
- [x] 1.5 Stop extraction only when a discovery invalidates the shared boundary or SaaS parity strategy; revise the affected specification before continuing.

**Quality Gate:** PASSED — foundation decision is approved and downstream runtime/release owners are recorded.

## 2. Establish Workspace and Boundary Enforcement

- [x] 2.1 Add failing tests that detect host-specific imports under `packages/*/src`.
- [x] 2.2 Add `apps/*` and `packages/*` to the existing pnpm workspace without adding a second monorepo build system.
- [x] 2.3 Create package manifests, exports, typecheck, test, and build scripts for runtime contracts, workflow core, media runtime, writer core, skill catalog, workbench client, and workbench UI.
- [x] 2.4 Implement a boundary scanner that rejects Next routes, Postgres, identity, enterprise, billing, R2, Railway, and Cloudflare imports.
- [x] 2.5 Run the boundary suite and the unchanged SaaS lint/build baseline.

**Quality Gate:** PASSED — boundary tests, scanner, and all seven package typechecks pass. The full SaaS lint/build remains in phase 6.

## 3. Extract Runtime and Provider Contracts

- [x] 3.1 Move OpenCode protocol fixtures and tests into the shared runtime package before moving implementation.
- [x] 3.2 Define versioned command, response, event, structured error, artifact, usage, Provider, and cancellation contracts.
- [x] 3.3a 提供 host-neutral `OpenCodeSessionClient`、session mapping 与 prompt/abort/event transport ports；具体 Railway HTTP server 仍未共享。
- [x] 3.3 Extract host-neutral OpenCode session/event handling from the Railway runtime without sharing the Railway HTTP server. ✓ 2026-08-13 — desktop and Railway now share session/prompt payloads, directory-scoped paths, session-id parsing, synchronous completion semantics, and SSE normalization; process/HTTP supervision remains host-owned.
- [x] 3.4 Extract media request/response normalization and async job contracts with injected config, fetch, clock, and cancellation. ✓ 2026-08-13 — shared adapters now reject missing injected provider config before issuing network requests.
- [x] 3.5 Keep compatibility re-exports at existing `lib/ai-runtime/*` paths.
- [x] 3.6 Run shared OpenCode fixtures and existing runtime protocol tests against the extracted implementation.

**Quality Gate:** PASSED for the contract slice — shared OpenCode contract tests, Railway manager tests/typecheck, desktop typecheck/tests, package typechecks, root lint, and boundary scan pass. Host process/HTTP supervision remains intentionally outside the shared package.

## 4. Extract the Workflow Runtime

- [x] 4.2a 建立 host-neutral `workflow-core` 节点类型、内置节点 registry、schema helpers 和连接兼容性规则的首个共享切片。
- [x] 4.2b 为完整 v1 节点集合、默认标题和端口兼容性添加共享 contract tests。
- [x] 4.1a 添加 definition hash、legacy v1→v2 migration、结构校验和 cycle detection contract tests。
- [x] 4.2c 抽取 workflow definition envelope、canonicalization、hash、migration 和基本 graph validation。
- [x] 4.2d 添加无 host 依赖的 deterministic DAG plan compiler 基础实现。
- [x] 4.3a 定义 host-neutral capability、artifact、event、run repository 和 clock ports。
- [x] 4.4a 实现 host-neutral DAG execution 基础：port propagation、retry limit、cancel、resume completed outputs 和 ordered run events。
- [x] 4.1 Copy graph, migration, foreach/collect, cancellation, retry, and resume tests into `workflow-core` and verify they fail before implementation is exported. ✓ 2026-08-13 — shared tests now cover graph migration, collection order, bounded foreach concurrency, cancellation signal propagation, retry, completed-output resume, and async provider-task recovery.
- [x] 4.2 Extract schema, node definitions, connection validation, definition migrations, and plan compilation. ✓ 2026-08-13 — the host-neutral package owns normalized definition envelopes, v1→v2 migration, validation and deterministic compilation.
- [x] 4.3 Introduce capability, repository, artifact, event, clock, and cancellation ports. ✓ 2026-08-13 — a recovery-only capability port prevents an interrupted provider task from falling back to submission.
- [x] 4.4 Extract execution and iteration behavior without enterprise IDs, credit fields, Next responses, or database record types. ✓ 2026-08-13 — shared execution owns deterministic DAG/foreach lifecycle while desktop supplies local capability and provider-task recovery adapters.
- [ ] 4.5 Implement a SaaS adapter that preserves existing store, task, billing, artifact, and route behavior.
  - [x] 4.5a Ordinary non-iteration SaaS DAG runs now use the shared workflow scheduler through a host adapter; existing node executors, capability invoker, task persistence, billing and artifact finalization remain SaaS-owned.
  - [x] 4.5b Foreach/collect pre-scope, isolated iteration body and post-scope DAGs now also use the shared SaaS scheduler; persisted iteration attempts, idempotency keys, credit reservation/finalization and recovery continue to be host-owned.
- [ ] 4.6 Keep original `lib/workflows/*` paths as thin re-exports or SaaS composition modules.
  - [x] 4.6a `lib/workflows/node-definitions/*` now re-export the same `workflow-core` node types, built-ins, registry and port compatibility instances; SaaS-specific node execution remains host composition.
  - [x] 4.6b `lib/workflows/schema.ts` now re-exports the shared schema types and helpers; the shared core owns generic asset-to-media connection compatibility.
  - [x] 4.6c `lib/workflows/connect.ts` now re-exports shared edge input mapping and port resolution; SaaS retains only canvas feature gating and localized labels.
  - [x] 4.6d `workflow-core` legacy migration assigns deterministic semantic edge keys independent of payload order, matching the SaaS migration rule.
  - [x] 4.6e `lib/workflows/workflow-definition-v2.ts` and `workflow-definition-migrations.ts` now re-export the shared canonical hash, validation and migration contract; SaaS storage stays in `store.ts`.
  - [x] 4.6f `lib/workflows/plan-compiler.ts` now re-exports shared foreach/collect compilation, limits and deterministic iteration helpers; SaaS iteration persistence remains in host modules.

**Quality Gate:** PASSED for the shared workflow core — workflow-core contract tests/typecheck and desktop host integration tests pass. The SaaS adapter/re-export parity work remains open in 4.5–4.6.

## 5. Extract Writer, Skill, and Workbench Client Seams

- [x] 5.1a 建立 host-neutral Writer revision guard、title-only body preservation 和 optimistic message reconciliation 首个共享切片。
- [x] 5.1b 共享 Writer revision tests 与既有 SaaS revision regression tests 均通过。
- [x] 5.1 Extract Writer types, result validation, revision guard, message reconciliation, and session context without DB/R2 dependencies. ✓ 2026-08-13 — `writer-core` now owns result invariants, revision/message reconciliation and bounded portable context; SaaS retains only Zod transport validation, storage identity and context hashing.
- [x] 5.2a 将 `content/skills/` 作为唯一 canonical source，并新增可复现的 skill catalog 类型、校验器和生成脚本。
- [x] 5.2b 为 catalog 条目生成 SHA-256 digest，并通过包级测试验证排序、重复 ID 与非法条目拒绝。
- [x] 5.2 Make `content/skills/` the canonical Skill source and generate host-specific bundles plus verifiable catalog digests. ✓ 2026-08-13 — the deterministic canonical catalog carries a source digest, and desktop bundle builds validate every canonical entry while explicitly allowing the pinned `ppt-master` extension.
- [x] 5.3 Define `WorkbenchClient`, streaming subscription, file action, and `NavigationAdapter` interfaces.
- [ ] 5.4 Convert shared AI Entry message rendering and workflow UI slices to injected clients and navigation.
- [x] 5.4a Desktop Workbench navigation and chat/writer artifact actions now use the injected `WorkbenchClient`, preserving artifact MIME metadata through the Tauri adapter.
- [x] 5.4b SaaS AI Entry route replacement now accepts an injected `NavigationAdapter`; the Next router is retained only as its host-composition fallback.
- [x] 5.5 Implement the Web adapter with the current `/api/*` contracts and Next navigation. ✓ 2026-08-13 — SaaS composition now adapts the existing `/api/ai` conversation/message/chat SSE contracts behind `WorkbenchClient`, with injected navigation and browser-request cancellation.
- [x] 5.6 Verify shared UI packages contain no `next/*` imports or hard-coded `/api/` calls. ✓ 2026-08-13 — shared-boundary validation now rejects hard-coded host `/api/*` calls in `workbench-client`/`workbench-ui` while allowing legitimate third-party Provider endpoints.
- [x] 5.6a `workflow-core` definition migration/hash contract is browser-safe; desktop Vite production build no longer pulls Node-only `crypto`.

## 6. Prove SaaS Parity and Complete Cutover

- [ ] 6.1 Run existing AI runtime, Writer, workflow, media adapter, route, cancellation, retry, and recovery tests.
- [ ] 6.2 Add contract tests that run equivalent fixtures through the shared core and SaaS adapters.
- [x] 6.3 Run root TypeScript validation, ESLint, and Next production build. ✓ 2026-08-13 — root `tsc --noEmit`, ESLint and production `next build` now pass against current source rather than stale per-probe `.next-*` validator outputs.
- [ ] 6.4 Search production imports to prove there is one shared implementation rather than a copied desktop fork.
- [ ] 6.5 Record any intentionally SaaS-only behavior and ensure it remains outside shared package exports.
- [ ] 6.6 Mark this change ready only when all parity gates pass and downstream desktop changes can consume stable exports.
