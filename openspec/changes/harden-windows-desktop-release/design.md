## Context

The release hardening change packages three layers: the main normal/portable application ZIP, a separately importable runtime ZIP, and signed manifests. Startup already performs a native pre-window bootstrap; installers, package verifiers, size/license audits and portable-copy checks are implemented. The remaining release evidence is deliberately separate from development-host evidence: clean VMs and an operator Authenticode certificate are still required.

## Goals / Non-Goals

**Goals:**

- Fail closed before WebView creation when required runtime components, signatures, hashes, sizes or identities are invalid.
- Prefer compatible system components, install only missing/broken components into a private runtime, and preserve last-known-good state.
- Provide deterministic normal/portable/offline installation and auditable package/bundle/network boundaries.
- Keep installation and diagnostics credential-free while clearly warning that local portable config may contain readable API keys.

**Non-Goals:**

- Add application auto-update, MSI/WSL/Docker, telemetry, cloud sync, ARM64 support or a signed release without an operator certificate.
- Treat a development unsigned build as release-ready.

## Decisions

1. **Use a signed component manifest as the installation source of truth.** It records platform, architecture, compatibility, size, SHA-256, ordered mirrors and signature metadata. The installer validates schema, safe paths, target identity and signature before download/extraction/replacement.
2. **Stage then atomically activate.** Downloads use bounded retries, resume files, proxy support and free-space checks; extraction happens under a staging directory. Activation swaps the staged root and preserves a last-known-good root. In-place mutation was rejected because a failed repair could destroy the working runtime.
3. **Separate main package from runtime package.** Normal/portable ZIPs contain the app and installer, not a nested full Python/Node runtime; `AIMarketing-Runtime-x64.zip` is imported locally or downloaded through the manifest source order.
4. **Portable mode is a data-root decision, not a second binary.** `portable.flag` selects adjacent `data/`; all other runtime/config/path semantics remain shared. This makes copy verification and upgrades deterministic.
5. **Make release audits fail closed but report development state accurately.** Unsigned Tauri binaries/manifests are recorded as incomplete; bundled Node/OpenCode signatures, dependency audit, licenses, package contracts, size budgets and network/bundle scans are checked independently.

## Risks / Trade-offs

- [WebView2 is missing before React exists] → native localized progress window runs detection/download/install/reprobe first.
- [Mirror or ZIP is malicious/corrupt] → manifest signature, source allow-list, SHA-256/size checks and safe-path extraction reject it before activation.
- [System component changes after probing] → persist canonical absolute paths and re-probe on repair; do not silently upgrade a healthy runtime.
- [Portable copy leaks credentials] → README/UI warning and diagnostic redaction; the approved plan intentionally keeps local config readable.

## Migration Plan

1. Generate the runtime manifest and optional offline signature with an operator-held key.
2. Build and audit normal, portable and runtime ZIPs; run package, boundary, size and copy verifiers.
3. On a target machine, bootstrap from system paths or offline/mirror runtime, then activate atomically.
4. For rollback, restore the last-known-good runtime and leave the candidate staged for cleanup.

## Open Questions

The exact Authenticode certificate and clean Win10 22H2/Win11 VM fleet are external release prerequisites; they do not change the installer protocol.
