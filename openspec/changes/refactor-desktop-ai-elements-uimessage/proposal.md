# Proposal: Directly Adopt AI Elements with AI SDK UIMessage for the Desktop Workbench

**Change ID:** `refactor-desktop-ai-elements-uimessage`
**Created:** 2026-08-26
**Status:** Draft
**Supersedes:** `upgrade-ai-elements-component-system` for the message UI, compatibility-layer and message-protocol decisions

---

## Problem Statement

The desktop workbench currently exposes an internal imitation of AI Elements. Its message timeline, prompt input, attachments, process cards, model selector, media output and artifact presentation are implemented through Workbench-specific props and CSS. The result is a parallel UI vocabulary that is close to AI Elements but does not share its recommended `UIMessage` state model or UI Message Stream semantics.

This is especially visible in the desktop client:

- assistant output, reasoning, tasks, tools, sources and artifacts are rendered by page-aware conditionals;
- provider/model selection and message actions can drift between AI Chat, Agent, Writer, media and Workflow pages;
- attachments and generated media do not have one consistent preview, playback, download and asset-registration lifecycle;
- custom borders, cards and status styles overpower the AI Elements interaction model;
- OpenCode/Tauri events are not represented by one typed UI message contract.

The product is still in internal testing, so old persisted messages do not need to remain readable. This permits a direct cutover without a long-lived compatibility UI.

## Proposed Solution

Adopt the community-recommended composition:

```text
AI Elements source components + shadcn/ui styling
                     ↓
AI SDK DesktopUIMessage and UI Message Parts
                     ↓
Custom DesktopChatTransport
                     ↓
Tauri RPC / Node Host / OpenCode
                     ↓
config.json Provider and model routing
```

1. Replace the current custom AI Elements imitation with pinned official AI Elements source components under `packages/workbench-ui/src/ai-elements/`.
2. Use `DesktopUIMessage = UIMessage<Metadata, DataParts, Tools>` as the only frontend message state and persistence contract.
3. Keep OpenCode, Tauri Rust, Provider routing and `config.json` as the execution layer; do not make the renderer call Providers directly.
4. Implement a Tauri-compatible `ChatTransport` and convert OpenCode runtime events into UI Message Stream Parts.
5. Make Chat, Agent, Writer, Knowledge, Assets, image/video/audio generation and Workflow share one `WorkbenchMessageSurface` with typed capability slots.
6. Use AI Elements' native parts first (`text`, `reasoning`, `tool-*`, `file`, `source-url`, `source-document`) and typed `data-*` parts for tasks, workflow nodes, media and artifacts.
7. Directly cut over all pages. Remove old page-level message, composer, attachment, source and artifact implementations after the new surface is wired.
8. Keep only the existing brand color token; use AI Elements/shadcn neutral surfaces, spacing, borders, typography and interaction states everywhere else.

## Scope

### In Scope

- Official AI Elements source snapshot and pinned dependency manifest.
- `DesktopUIMessage` type, metadata, native Parts and typed custom Data Parts.
- UI Message Stream conversion for Tauri/OpenCode events.
- `DesktopChatTransport` and `useChat<DesktopUIMessage>` integration in the desktop React client.
- Database message persistence for `parts_json` and `metadata_json`; no old-message backfill.
- Shared `WorkbenchMessageSurface` for conversation, message actions, process, attachments, sources, artifacts and media.
- PromptInput with IME-safe keyboard behavior, drag/drop attachments, upload queue, model selector, stop and error states.
- Provider-grouped searchable model selector driven only by `config.json`.
- Message branching retry, copy, feedback, preview, playback, download and asset-library callbacks.
- Real Tauri UI verification for AI Chat, Agent, Writer, Knowledge, Assets, media and Workflow.
- Removal of superseded Workbench UI protocol and duplicate visual implementations.

### Out of Scope

- Replacing OpenCode with a different agent runtime.
- Direct renderer-to-Provider requests.
- AI Gateway adoption or Provider SDK routing changes.
- New tool approval or Checkpoint capabilities; render them only if a real runtime capability is later added.
- Preserving old internal-test conversations or migrating old `WorkbenchMessagePart` records.
- Rebuilding non-AI business pages as AI Elements.

## Impact Analysis

| Component | Change Required | Details |
|---|---:|---|
| `packages/workbench-ui` | Yes | Official source components, shared message surface, theme tokens and typed callbacks |
| `packages/workbench-client` | Yes | Replace page-facing `WorkbenchMessagePart` with `DesktopUIMessage`/runtime event boundaries |
| Desktop React app | Yes | `useChat`, custom Tauri transport, shared surface and route slots |
| Tauri Rust/Node Host | Yes | Emit UI Message Stream-compatible frames and retain existing execution callbacks |
| Database | Yes | Persist UIMessage Parts and metadata; no old-message migration |
| `config.json` | No | Remains the source of Provider and model list configuration |
| Provider routing | No | Existing config-driven routing is preserved |
| Dependencies | Yes | Add `ai`, `@ai-sdk/react`, `streamdown`, `cmdk`, and `media-chrome` only for active components |
| Web app | Conditional | Reuse shared surface where the route is in scope; no separate desktop behavior |

## Architecture Considerations

### Message contract

`DesktopUIMessage` is the frontend source of truth. Runtime-specific OpenCode events may remain internal to the Host, but they must be converted once at the Tauri boundary. The UI must not inspect raw OpenCode event payloads or maintain a second message-part state machine.

### AI SDK usage

AI SDK UI is used for `UIMessage`, `useChat`, transport semantics and UI Message Stream parts. AI SDK Provider packages are not used unless a future runtime explicitly requires them. Existing Provider selection remains config-driven.

### Local desktop transport

The renderer uses a `ChatTransport` implementation backed by Tauri RPC. The transport must support send, stop, retry, branch and resume without exposing filesystem paths, API keys or Provider clients to the renderer.

### Persistence

New messages store `UIMessage.parts` in `parts_json` and message-level metadata in `metadata_json`. `role`, `content` and timestamps may remain denormalized for indexing and list display. Existing internal-test data is disposable; no compatibility renderer or old-message migration is required.

### Media and artifact lifecycle

Generated media is written and validated, registered as an Artifact, and only then emitted as a UI Message Part. Message preview, playback and download resolve through typed Artifact callbacks. The asset library reads the same Artifact record.

### Theme

AI Elements/shadcn neutral tokens are canonical. The Workbench brand color is the only product-specific color override and is applied through shared CSS variables for primary, active, focus and progress states.

## Success Criteria

- [x] All in-scope desktop pages use one AI Elements-based `WorkbenchMessageSurface`.
- [x] Frontend message state and new persistence use `DesktopUIMessage` only.
- [x] OpenCode/Tauri output is visible as text/process/media Parts while streaming, without a second renderer protocol.
- [x] Selected Provider/model remains locked for the entire run, retry branch and recovery path.
- [x] Attachments support inline queue state, grid/list rendering, preview, remove, failure retry and safe download.
- [x] Text, image, video, audio and document outputs are actionable and registered in the asset library.
- [x] Completed process details collapse; active, waiting and failed details remain visible and actionable.
- [x] Menus close on outside click/Escape; all primary paths work with keyboard and Chinese IME.
- [x] No old page-level AI message, composer, attachment, source or artifact visual implementation remains.
- [x] Tauri real UI acceptance passes for all listed routes; the current acceptance batch has no open P0/P1 issue. Historical task-center failures remain available for audit and are not counted in the current batch gate.

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---:|---:|---|
| AI Elements source differs from the current internal imitation | High | High | Import a pinned source snapshot, compile it in isolation and add component contract tests |
| Custom Tauri transport does not exactly match AI SDK stream semantics | High | High | Build a frame-level contract test before page migration and replay captured OpenCode events |
| Removing old protocol breaks internal runtime callers | Medium | High | Separate runtime event types from UI types, then compile and test all callers before deletion |
| Local file URLs fail in WebView2 | Medium | High | Expose only Artifact callbacks and test preview/playback/download in the real Tauri client |
| Dependency bundle grows unexpectedly | Medium | Medium | Keep dependency gates, inspect bundle output and load media/voice components only on active routes |
| Streaming rerender cost affects long conversations | Medium | Medium | Batch only adjacent UI updates, virtualize only after measurement, and keep Parts immutable |
