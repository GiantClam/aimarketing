## Context

This change is a decision record rather than a feature implementation. Existing spikes cover WebView2/bootstrap, OpenCode sessions, `ppt-master`, LanceDB and process/storage boundaries. The approved foundation decision separates implementation feasibility from final release readiness so later changes can proceed without treating a diagnostic host as a clean VM.

## Goals / Non-Goals

**Goals:**

- Preserve factual spike outputs and make the approved Tauri/Rust/Node/OpenCode/SQLite/LanceDB topology unambiguous.
- Assign every diagnostic risk to one downstream change with a concrete production-quality gate.
- Prevent a feasibility pass from being cited as proof of signing, clean-VM, provider or release readiness.

**Non-Goals:**

- Implement desktop features, alter SaaS behavior, or close the final Windows release matrix in this decision record.

## Decisions

1. **Foundation is approved; release remains pending.** Shared extraction may proceed after the architecture decision, while clean VM, runtime distribution, signing and full recovery remain owned by release hardening. Combining these states was rejected because it would block implementation or overclaim readiness.
2. **Use Tauri/React with Rust-owned local state, a private workflow host, OpenCode and per-Vault LanceDB.** This topology keeps browser UI, process supervision and local persistence responsibilities explicit; a browser-only desktop shell was rejected because it cannot enforce runtime/process boundaries.
3. **Treat spikes as protocol references.** OpenCode/PPT/RAG spikes inform adapters and probes but do not replace their owning capability change's fixtures and real integration checks.
4. **Keep evidence immutable and sanitized.** Existing spike artifacts remain auditable; downstream changes may add stronger evidence but must not rewrite a diagnostic `changes-required` into a production pass without the owning test.

## Risks / Trade-offs

- [Stakeholders confuse approved architecture with shippable product] → every release checklist carries separate `foundation decision=approved` and `release readiness=pending` fields.
- [A downstream change skips its own integration test] → dependency ordering and OpenSpec tasks name the unique owner of each gate.
- [A spike becomes stale] → implementation changes rerun capability-specific tests and update only their own evidence.

## Migration Plan

1. Record the decision and downstream ownership.
2. Let shared-core and foundation changes consume the decision without importing spike-only code.
3. Let capability changes produce their own real-provider/runtime evidence.
4. Let release hardening make the final clean-VM/signature decision; archive this change only after its decision record remains consistent with downstream evidence.

## Open Questions

None for the foundation decision. Release prerequisites are intentionally tracked in the hardening change.
