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
- [ ] 2.2 Remove old-message compatibility and stop writing `WorkbenchMessagePart` as the UI contract.
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

- [ ] 3.1 Replace the current custom AI Elements implementation with pinned official source components.
- [x] 3.2 Build shared `WorkbenchMessageSurface` from Conversation, Message, MessageResponse and MessageActions.
- [x] 3.3 Build PromptInput with Header/Body/Footer/Tools/Textarea/Submit/ActionMenu and IME-safe shortcuts.
- [x] 3.4 Replace native model `select` controls with searchable, grouped, keyboard-accessible ModelSelector.
- [x] 3.5 Implement Attachment queue using inline, grid and list variants with preview/remove/error states.
- [x] 3.6 Map reasoning, task, tool and status Parts to collapsible AI Elements process components.
- [x] 3.7 Implement Sources, InlineCitation, Artifact, CodeBlock, Image and AudioPlayer output slots.
- [x] 3.8 Apply neutral AI Elements/shadcn tokens and retain only the Workbench brand color token.

**Quality Gate:**

- [ ] Shared component tests pass for empty, streaming, waiting, failed, cancelled, disabled and narrow states.
- [ ] Menu outside-click/Escape behavior and focus restoration pass.
- [ ] Assistant messages are full-width; user messages are compact; only message/process containers retain boundaries.

---

## Phase 4: Route cutover

- [ ] 4.1 Cut AI Chat over to `WorkbenchMessageSurface` and `useChat<DesktopUIMessage>`.
- [ ] 4.2 Cut Agent over, including tool output and real approval capability gating.
- [ ] 4.3 Cut Writer over, preserving editor preview, copy and export callbacks.
- [ ] 4.4 Cut Knowledge and Assets over, preserving sources, citations and Artifact lookup.
- [ ] 4.5 Cut image, video and audio generation over, preserving standalone-task/no-chat semantics.
- [ ] 4.6 Cut Workflow over, preserving Canvas behavior, node status, outputs and remote polling.
- [ ] 4.7 Remove old page-level Message, Composer, Attachment, Source, Artifact and status renderers.

**Quality Gate:**

- [ ] Every in-scope route renders the same shared message surface.
- [ ] No duplicate AI UI implementation or legacy UI protocol remains in page code.
- [ ] Provider/model list is identical to `config.json` in Web and Tauri.

---

## Phase 5: Real Tauri verification and release gate

- [ ] 5.1 Verify ordinary multi-turn AI chat, streaming, stop, copy and model switching in Tauri.
- [ ] 5.2 Verify Agent process Parts, user-message attribution, tool output and failure retry.
- [ ] 5.3 Verify Writer streaming, preview edit, copy, export and retry branch.
- [ ] 5.4 Verify image/video/audio generation, playback, pause, preview and download.
- [ ] 5.5 Verify Workflow text/image/video/audio outputs and long-task polling.
- [ ] 5.6 Verify attachment upload queue, remove, failure retry and local preview.
- [ ] 5.7 Verify every successful media/artifact result is queryable in Assets.
- [ ] 5.8 Verify keyboard paths, Chinese IME, focus restoration, WebView2 local file handling and responsive desktop layout.
- [ ] 5.9 Run lint, typecheck, unit, integration, bundle, SSR, visual and Tauri E2E checks.

**Quality Gate:**

- [ ] All required Tauri scenarios pass with evidence screenshots/logs.
- [ ] P0/P1 issues are zero.
- [ ] No known error, missing output, silent model migration or asset inconsistency remains.

---

## Completion Checklist

- [ ] All phases complete.
- [ ] All quality gates passed.
- [ ] Old message UI/protocol implementation removed.
- [ ] OpenSpec validation passes.
- [ ] Ready for `/openspec-apply refactor-desktop-ai-elements-uimessage`.
