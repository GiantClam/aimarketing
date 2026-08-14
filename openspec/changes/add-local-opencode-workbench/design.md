## Context

Desktop conversations use a Rust/Tauri shell, a supervised Node host, and a local OpenCode server. The shared WorkbenchClient already normalizes messages, tool events, usage, artifacts and navigation. Local configuration selects providers and models; credentials must never be persisted in SQLite or emitted in diagnostics.

## Goals / Non-Goals

**Goals:**

- Give every desktop chat and Agent turn one observable OpenCode session path.
- Map a conversation to a stable, isolated, recoverable session while keeping run state durable in SQLite.
- Stream tool/text/usage events, support emergency abort, and mark interrupted work without replaying side effects.
- Let the UI switch among configured models/Skills and prefer a configured model when a stored selection is stale.

**Non-Goals:**

- Add a desktop AI SDK fallback, account login, billing, enterprise policy, cloud sync or Agent publishing.
- Sandboxing Full Access OpenCode tools; the product explicitly exposes the boundary and emergency stop.

## Decisions

1. **Run one supervised `opencode serve` per application lifecycle.** A random loopback port and random Basic Auth token prevent accidental cross-process access. A per-conversation session ID is passed to the server, while the Rust/SQLite run record remains the source of truth.
2. **Use typed host RPC and event normalization.** The UI never calls OpenCode or provider HTTP directly; the WorkbenchClient sends typed commands through Tauri/host RPC and receives bounded events. Direct browser fetches were rejected because they would bypass process supervision and credential redaction.
3. **Persist before rendering.** User messages, run transitions, usage and artifact metadata are written through repositories before or alongside UI updates. On restart, a missing OpenCode session is recreated from the bounded durable snapshot and retried once; a completed side effect is not automatically submitted twice.
4. **Keep Full Access explicit.** The UI shows tool steps and an emergency stop, but does not present a misleading permission-mode selector. A restrictive wrapper was rejected because it would change the approved OpenCode behavior rather than make it observable.
5. **Resolve model choices through configured profile catalogs.** The selected provider and model are sent on session creation and every prompt; profile-local model options are canonicalized and stale values fall back to the first configured value.

## Risks / Trade-offs

- [OpenCode protocol drift] → pin the bundled/runtime version and run health/session/stream/tool/abort probes during bootstrap and release verification.
- [Full Access modifies user files] → show the warning, stream tool events, retain bounded diagnostics and expose an immediate stop action.
- [Session and SQLite state diverge] → treat SQLite as durable truth and recover a lost session from the complete bounded transcript snapshot.
- [Verbose event logs leak secrets] → redact API-key/token/password/authorization shapes before JSONL and diagnostic export.

## Migration Plan

1. Start the host only after runtime bootstrap passes and shut it down through the supervisor/Job Object.
2. Route existing desktop navigation through WorkbenchClient composition; keep SaaS routes unchanged.
3. Reopen existing local conversations from SQLite and lazily recreate missing OpenCode sessions.
4. Roll back by restoring the previous desktop bundle; local SQLite remains compatible because the change is additive.

## Open Questions

Production Writer/OpenCode cutover evidence is tracked by the Writer change and is not a prerequisite for the local workbench protocol.
