## Context

The foundation is a Tauri 2/React shell with a Rust-owned SQLite store, a supervised Node workflow host, local project/artifact files and a pre-window runtime bootstrap. Normal mode uses `%LOCALAPPDATA%\\AIMarketing`; the presence of `portable.flag` switches all app data to an adjacent `data/` root.

## Goals / Non-Goals

**Goals:**

- Make runtime readiness, path selection, process ownership and local state deterministic before rendering the main WebView.
- Keep SQLite and file ownership in Rust/repositories, with typed RPC as the host boundary.
- Support atomic config/asset writes, bounded logs, artifact metadata, usage and recovery snapshots.

**Non-Goals:**

- Deliver feature-specific AI behavior, cloud sync, accounts, billing, enterprise services or release signing.
- Allow the workflow host to open SQLite directly or pass large binary payloads through IPC.

## Decisions

1. **Pre-window native bootstrap.** Rust acquires the instance lock, probes WebView2 and every required runtime component, runs migrations, and only then creates the Tauri WebView. A React repair screen was rejected because it cannot render when WebView2 itself is missing.
2. **Persist canonical runtime paths.** Probe results are normalized to absolute paths and stored atomically; subsequent startup prefers these paths over a changing system PATH. Windows command shims are resolved to their dispatched executable before persistence.
3. **Rust owns SQLite; host owns no database.** Repository RPCs expose narrow operations for sessions, runs, nodes, artifacts, usage, workflows and Vault mappings. This avoids Node native SQLite ABI drift and keeps one writer/instance lock.
4. **Atomic filesystem boundaries.** Project/artifact writes use validated relative paths, temp files and rename; IPC sends metadata/path references. Config writes use a backup and recovery strategy, with keys explicitly warned as readable local data and redacted from logs.
5. **Separate normal and portable data roots.** The executable bundle is replaceable; user data is outside it in normal mode and adjacent in portable mode. This keeps upgrades from overwriting state while allowing directory copies.

## Risks / Trade-offs

- [Bootstrap blocks UI on repair] → show a native localized progress window and keep all stages bounded/recoverable.
- [A second instance corrupts SQLite/LanceDB] → acquire a data-root lock and report owner PID/actionable recovery text.
- [Large artifacts exhaust IPC memory] → stream to local files and record only canonical path/size/hash metadata.
- [Readable API keys are copied with portable data] → explicit UI/README warning and diagnostic redaction; no false claim of encryption.

## Migration Plan

1. Bootstrap the runtime and initialize the local schema before enabling feature routes.
2. Keep existing SaaS database/schema untouched; desktop repositories use a separate local database.
3. Add feature adapters on top of the typed host/Rust ports.
4. Restore a prior bundle or last-known-good runtime without deleting normal-mode LocalAppData.

## Open Questions

Clean Windows VM behavior and signed distribution are intentionally deferred to `harden-windows-desktop-release`.
