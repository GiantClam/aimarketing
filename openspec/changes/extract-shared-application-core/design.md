## Context

The repository contains SaaS routes and UI that historically mixed domain logic with Next.js, Postgres, billing, enterprise, R2, Railway and Cloudflare concerns. The extraction now provides host-neutral packages for runtime contracts, workflow execution, media providers, Writer/Skills and WorkbenchClient, while legacy `lib/*` paths remain compatibility re-exports.

## Goals / Non-Goals

**Goals:**

- Make shared packages executable by both SaaS adapters and the Windows host without importing SaaS-only modules.
- Version runtime/provider/event/artifact/usage/IPC contracts and prove behavior with shared fixtures.
- Keep one workflow/media/Writer implementation and inject persistence, billing, cloud storage or local files through ports.

**Non-Goals:**

- Move SaaS persistence or billing into the desktop runtime.
- Turn the shared package into a new service or introduce a second UI framework.

## Decisions

1. **Package boundaries are enforced mechanically.** Boundary scans reject imports of Next routes/navigation, Postgres, enterprise, billing, R2, Railway, Cloudflare and other SaaS-only modules from shared packages. Documentation-only boundaries were rejected because drift is otherwise invisible.
2. **Compatibility re-exports preserve call sites.** Existing `lib/*` imports point to the shared implementation while new desktop code imports package contracts directly. This allows incremental migration and makes rollback low-risk.
3. **Ports, not environment checks, isolate hosts.** Workflow repositories, capability invokers, artifact stores, usage sinks and navigation are interfaces; SaaS and Desktop supply adapters. Runtime environment branching inside domain functions was rejected because it duplicates hidden behavior.
4. **Contracts are tested at the seam.** Shared request/response, stream, cancellation, retry/recovery and provider fixtures run independently of Next or Tauri, then SaaS parity tests verify adapter equivalence.
5. **WorkbenchClient owns transport normalization.** React workspaces consume a client/navigation seam for messages, tool events, artifacts and usage; hardcoded `/api/*` and `next/navigation` dependencies stay in host adapters.

## Risks / Trade-offs

- [Extraction leaves a thin legacy path] → re-export tests and boundary scans ensure it cannot become a second implementation.
- [Ports are too generic] → capability-specific typed contracts and fixture schemas fail early on missing fields.
- [SaaS adapter behavior changes] → run existing route/build/lint suites plus shared contract/parity tests on every change.

## Migration Plan

1. Extract pure code and contracts into workspace packages.
2. Replace legacy implementations with re-exports and migrate consumers incrementally.
3. Bind SaaS adapters first, then Desktop host adapters, while running the same contract suite.
4. Remove a compatibility re-export only after code search and downstream builds prove no consumer remains.

## Open Questions

Future package versioning can be addressed when an external consumer requires it; the current desktop and SaaS workspace share one repository/version.
