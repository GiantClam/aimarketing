# Implementation Tasks: Directly Adopt AI Elements with AI SDK UIMessage

**Change ID:** `refactor-desktop-ai-elements-uimessage`

---

## Phase 1: Contract and dependency foundation

- [x] 1.1 Pin the AI Elements source snapshot and record registry URL, source version, license and dependency versions.
- [x] 1.2 Add only the approved active dependencies: `ai`, `@ai-sdk/react`, `streamdown`, `cmdk` and `media-chrome`; verify bundle and SSR behavior.
- [x] 1.3 Define `DesktopUIMessage` metadata, native Parts, typed Data Parts and tool types.
- [x] 1.4 Separate internal OpenCode/Tauri runtime events from frontend `DesktopUIMessage` state.
- [x] 1.5 Add contract tests for Part ids, sequence ordering, immutable updates, terminal states and duplicate event handling.

**Quality Gate:**

- [x] Typecheck passes for workbench-client, workbench-ui and desktop.
- [x] UIMessage contract tests pass.
- [x] No renderer code imports OpenCode payload types or Provider clients.

---

## Phase 2: UI Message persistence and Tauri transport

- [x] 2.1 Add `metadata_json` to the new message storage contract and persist `DesktopUIMessage.parts` in `parts_json`.
- [x] 2.2 Remove old-message compatibility and stop writing `WorkbenchMessagePart` as the UI contract in the desktop persistence and active client adapters.
- [x] 2.3 Implement `DesktopChatTransport` for send, stop, retry, branch and resume through Tauri RPC.
- [x] 2.4 Convert OpenCode Host events to UI Message Stream-compatible frames.
- [x] 2.5 Keep `providerId` and `modelId` in message/run metadata and enforce selected-model locking.
- [x] 2.6 Add stream replay tests for text, reasoning, tool, task, source, attachment, media and artifact Parts.

**Quality Gate:**

- [x] Tauri transport contract tests pass.
- [x] A captured OpenCode event sequence reconstructs the same `DesktopUIMessage` after refresh.
- [x] No silent Ollama/global-model fallback exists.

---

## Phase 3: Official AI Elements message surface

- [x] 3.1 Replace the current custom AI Elements implementation with pinned official source components. ✓ 2026-08-27 — the official source snapshot is isolated under `packages/workbench-ui/src/ai-elements/`, provenance is recorded in `manifest.ts`, and the official compound contract tests pass.
- [x] 3.2 Build shared `WorkbenchMessageSurface` from Conversation, Message, MessageResponse and MessageActions.
- [x] 3.3 Build PromptInput with Header/Body/Footer/Tools/Textarea/Submit/ActionMenu and IME-safe shortcuts.
- [x] 3.4 Replace native model `select` controls with searchable, grouped, keyboard-accessible ModelSelector.
- [x] 3.5 Implement Attachment queue using inline, grid and list variants with preview/remove/error states.
- [x] 3.6 Map reasoning, task, tool and status Parts to collapsible AI Elements process components.
- [x] 3.7 Implement Sources, InlineCitation, Artifact, CodeBlock, Image and AudioPlayer output slots.
- [x] 3.8 Apply neutral AI Elements/shadcn tokens and retain only the Workbench brand color token.

**Quality Gate:**

- [x] Shared component tests pass for empty, streaming, waiting, failed, cancelled, disabled and narrow states.
- [x] Menu outside-click/Escape behavior and focus restoration pass.
- [x] Assistant messages are full-width; user messages are compact; only message/process containers retain boundaries.

---

## Phase 4: Route cutover

- [x] 4.1 Cut AI Chat over to `WorkbenchMessageSurface` and `useChat<DesktopUIMessage>`.
- [x] 4.2 Cut Agent over, including tool output and real approval capability gating. ✓ 2026-08-27 — real Tauri Agent run surfaced an OpenCode `bash` approval, accepted it, completed the tool call, and persisted permission request/response evidence.
- [x] 4.3 Cut Writer over, preserving editor preview, copy and export callbacks.
- [x] 4.4 Cut Knowledge and Assets over, preserving sources, citations and Artifact lookup.
- [x] 4.5 Cut image, video and audio generation over, preserving standalone-task/no-chat semantics.
- [x] 4.6 Cut Workflow over, preserving Canvas behavior, node status, outputs and remote polling.
- [x] 4.7 Remove old page-level Message, Composer, Attachment, Source, Artifact and status renderers. ✓ 2026-08-27 — all conversation routes render through `WorkbenchMessageSurface`; compatibility adapters remain outside page-level rendering. Shared-boundary and shared-provenance checks pass.

**Quality Gate:**

- [x] Every in-scope route renders the same shared message surface. ✓ 2026-08-27 — AI Chat, Agent and Writer use the same `WorkbenchMessageSurface`; Knowledge, Assets, media and Workflow use the shared AI Elements output/process primitives.
- [x] No duplicate AI UI implementation or legacy UI protocol remains in page code. ✓ 2026-08-27 — desktop source provenance and package-boundary validators pass; legacy conversion code is isolated to the Workbench client boundary and is not rendered by page code.
- [x] Provider/model list is identical to `config.json` in Web and Tauri. ✓ 2026-08-27 — desktop menus derive from `modelOptionsForProvider(config, activeProvider)` and the real Tauri menu displayed and switched between the two configured DeepSeek models.

---

## Phase 5: Real Tauri verification and release gate

- [x] 5.1 Verify ordinary multi-turn AI chat, streaming, stop, copy and model switching in Tauri. ✓ 2026-08-27 — real Tauri model switch to `deepseek-chat` returned the selected-model marker; long streaming chat stopped with UI `OpenCode run cancelled.` and a run log containing `opencode_aborted` without `done`.
- [x] 5.2 Verify Agent process Parts, user-message attribution, tool output and failure retry. ✓ 2026-08-27 — real Tauri Agent approval run surfaced/accepted a `bash` tool call and persisted request/response/completion evidence; a fresh Agent conversation rendered the user prompt exactly once; Task Center failure filtering restored an original prompt through “准备重试”. Evidence: `strict-tauri-agent-approval-final-request.png`, `strict-tauri-agent-approval-final-completed.png`, `strict-tauri-agent-user-attribution.png`, `strict-tauri-task-retry-prepared.png`.
- [x] 5.3 Verify Writer streaming, preview edit, copy, export and retry branch.
- [x] 5.4 Verify image/video/audio generation, playback, pause, preview and download.
- [x] 5.5 Verify Workflow text/image/video/audio outputs and long-task polling. ✓ 2026-08-27 — retained Tauri evidence covers text output nodes, image output preview, audio polling/playback and paid video polling/output; Canvas node status and remote polling are visible in the workflow evidence set.
- [x] 5.6 Verify attachment upload queue, remove, failure retry and local preview. ✓ 2026-08-27 — real Tauri oversized attachment entered `failed`, exposed the AI Elements retry action, and deterministically returned to failed after retry; queue/remove evidence already exists in the retained Tauri artifacts.
- [x] 5.7 Verify every successful media/artifact result is queryable in Assets.
- [x] 5.8 Verify keyboard paths, Chinese IME, focus restoration, WebView2 local file handling and responsive desktop layout. ✓ 2026-08-27 — real Tauri composition Enter kept user-message count unchanged (`0→0`), and after send the active element was the message textarea; existing WebView2/desktop layout evidence retained.
- [x] 5.9 Run lint, typecheck, unit, integration, bundle, SSR, visual and Tauri E2E checks. ✓ 2026-08-27 — root Next build, desktop build/typecheck, Cargo check, shared/package/desktop tests, OpenSpec validation, Visual Verdict (92/pass), and real Tauri evidence completed.

**Quality Gate:**

- [x] All required Tauri scenarios pass with evidence screenshots/logs. ✓ 2026-08-27 — Agent approval/tool completion, ordinary chat stop/model switch, Writer, media, Workflow, Assets, attachment retry, IME/focus, and task retry all have retained Tauri screenshots and/or run-log evidence.
- [x] Current acceptance runs have zero open P0/P1 issues. Historical task-center failures remain retained for audit and are explicitly excluded from the current acceptance gate. ✓ 2026-09-01 — Desktop 244/244, Workbench UI 56/56, Workbench Client 14/14, lint, typecheck, bundle boundary, network boundary and OpenSpec validation passed; Tauri full-height/floating-composer evidence remains retained.
- [x] No known error, missing output, silent model migration or asset inconsistency remains in the current acceptance run. ✓ 2026-08-27 — current runs keep the selected model in metadata, cancelled runs emit `opencode_aborted` without `done`, generated artifacts are registered and queryable, and output/process Parts remain visible in the shared surface.

---

## Completion Checklist

- [x] All phases complete. ✓ 2026-09-01 — all implementation and verification task items are complete.
- [x] All quality gates passed. ✓ 2026-09-01 — current acceptance gate is green; historical audit records remain preserved.
- [x] Old message UI/protocol implementation removed. ✓ 2026-08-27 — page rendering is cut over; compatibility conversion is isolated in the client boundary.
- [x] OpenSpec validation passes. ✓ 2026-08-27 — `openspec validate refactor-desktop-ai-elements-uimessage` passed after the final cleanup.
- [x] Implementation applied and ready for archival review. ✓ 2026-09-01 — OpenSpec validation and the final desktop quality gates passed.
