## Context

The desktop writing, `ppt-master`, and Obsidian capabilities all run inside the local OpenCode workbench. Canonical Skills live under `content/skills/`; Python/PPT assets and Vault indexes are local runtime responsibilities. The desktop must not import the cloud Writer worker, R2, enterprise search, Dify/RAGFlow or an Obsidian plugin API.

## Goals / Non-Goals

**Goals:**

- Preserve one Writer domain/Skill implementation for Web and Desktop while changing only host adapters.
- Run `ppt-master` through the private runtime and discover local PPTX/SVG/preview artifacts by path.
- Make Vault scan/search useful before embeddings finish, then add per-Vault hybrid retrieval with explicit citation metadata.
- Protect built-in Vault writes with path checks, base hashes and non-destructive conflicts.

**Non-Goals:**

- Reproduce the complete SaaS Writer workspace or cloud worker in the desktop app.
- Provide an Obsidian plugin, REST API, CLI automation, shared LanceDB or a sandbox around Full Access OpenCode tools.

## Decisions

1. **Canonical Skill source plus generated runtime bundle.** `content/skills/` is authoritative; sync scripts generate the desktop catalog/runtime and CI checks digest drift. Hand-maintained copies were rejected because they silently fork Web/Desktop behavior.
2. **Keep Writer context outside clipped chat history.** The active draft, revision and recovery snapshot are explicit structured fields passed to OpenCode. This permits complete-article revision without making normal history unbounded.
3. **Treat PPT output as ordinary local artifacts.** OpenCode invokes `ppt-master` with the configured private Python and project-relative paths; the host records file metadata and previews instead of sending binary content through IPC.
4. **Use a two-stage Vault index.** A manifest/hash reconciliation provides title/tag/link/keyword search immediately. Local embeddings and LanceDB are built per Vault/model/dimension; incompatible state is discarded and rebuilt from source Markdown rather than migrated heuristically.
5. **Make remote embedding opt-in and HTTPS-only.** Local embedding is the default; only explicit remote mode sends bounded Markdown chunks to the configured endpoint. This preserves the no-egress default for Vault content.
6. **Apply optimistic concurrency only to built-in writes.** Existing notes require an expected base hash; conflicts return a diff/state for user choice. Full Access file tools remain visible but outside this application-owned guarantee.

## Risks / Trade-offs

- [Python/fonts differ between machines] → capability probes, real Chinese/English PPT fixtures and runtime packaging checks gate readiness.
- [Watcher misses OneDrive rename/sleep events] → watchers are hints; startup/wake manifest reconciliation is authoritative.
- [Embedding model/dimension changes] → index metadata includes model, dimension and schema; mismatch forces rebuild.
- [Writer asset generation is partial] → persist each ready asset independently, retain URLs after later failure, and recover only unfinished intents.

## Migration Plan

1. Generate and validate the shared Skill catalog before building the desktop runtime.
2. Store Writer sessions/artifacts through existing local repositories; keep the SaaS adapter on its current persistence path.
3. Bind a Vault and create a manifest, then build/rebuild the per-Vault index without modifying Vault files.
4. Roll back by removing the local index generation; source Markdown and previously recorded artifacts remain intact.

## Open Questions

Production article-quality baseline and Railway cutover remain external Writer release gates; they do not change the local artifact/index design.
