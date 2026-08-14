## Context

The proposal and capability specs define a host-neutral media protocol and a desktop workflow runtime. The current implementation already has `packages/media-runtime`, `packages/workflow-core`, a Rust-owned SQLite adapter, and a Node workflow host. Provider credentials stay in local configuration; workflow definitions and results must not acquire SaaS storage, billing, or cloud-task dependencies.

## Goals / Non-Goals

**Goals:**

- Keep submit/poll/cancel, response normalization, local artifact download, and idempotency in one shared runtime.
- Inject persistence and capability execution through desktop ports so workflow-core remains host-neutral.
- Preserve bounded event/checkpoint data across restart without sending media bytes through IPC.
- Keep the real-provider smoke scope explicit: configured providers are exercised, Seedance is excluded, and image smoke targets only the configured `gpt-image-2` profile at low resolution first.

**Non-Goals:**

- Recreate SaaS task, billing, R2, enterprise, or cloud-worker infrastructure in the desktop bundle.
- Add multi-machine workflow locking or remote collaboration.

## Decisions

1. **Use a shared submit/poll state machine with injected ports.** `media-runtime` owns request shapes, terminal-state classification, cancellation and recovery; desktop adapters own HTTP transport, filesystem writes and SQLite metadata. This avoids duplicating provider behavior in the UI. A provider-specific desktop implementation was rejected because it would diverge from the SaaS contract.
2. **Persist idempotency before submit and provider task identity immediately after submit.** Recovery therefore resumes polling and local download instead of repeating a billable submission. The trade-off is that an interrupted submit with no task identity requires an explicit diagnostic/retry decision.
3. **Transfer paths and bounded metadata over IPC.** Large images, audio and video are written into a project-owned temporary/final path, while RPC carries canonical paths, MIME type, size and artifact ID. Base64 IPC was rejected because it increases memory pressure and complicates cancellation.
4. **Compile workflows into deterministic DAG layers.** Parallel branches, foreach/collect, retries and checkpoints are handled by workflow-core; the host only implements capability/repository/artifact ports. This keeps cancellation and resume semantics identical across Web and Desktop.
5. **Make provider/model selection data-driven.** Capability defaults resolve to configured profiles and their model lists, with stale selections falling back to the first configured model. This supports multiple providers of one capability without embedding a model catalog in node code.

## Risks / Trade-offs

- [Provider schemas drift] → fixture contracts, bounded raw-response diagnostics and schema-valid success checks fail closed.
- [Temporary URLs expire] → download successful results before marking the run complete; recovery prioritizes unfinished downloads.
- [A provider remains in `Processing`] → bounded polling returns a visible non-terminal failure instead of waiting indefinitely.
- [Workflow checkpoint grows without bound] → event/checkpoint payloads are size bounded and persisted after each completed node.

## Migration Plan

1. Keep SaaS adapters on their existing storage/billing boundaries while routing shared request construction through the common packages.
2. Use the desktop adapter to persist runs, node attempts, artifacts and usage in SQLite and local files.
3. Export/import only portable workflow JSON; strip provider credentials and database bindings during export.
4. Roll back by selecting the previous runtime/host bundle; no shared SaaS schema migration is required.

## Open Questions

The remaining clean-VM and signed-release gates are release evidence, not changes to this runtime design.
