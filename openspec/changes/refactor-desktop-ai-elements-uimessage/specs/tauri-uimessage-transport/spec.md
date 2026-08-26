# Specification: Tauri UI Message Transport

**Change ID:** `refactor-desktop-ai-elements-uimessage`
**Affects:** Desktop React transport, Tauri RPC, Node/OpenCode Host, run recovery

---

## ADDED Requirements

### Requirement: DesktopChatTransport SHALL bridge Tauri and AI SDK UI state

The desktop renderer SHALL use a `ChatTransport`-compatible implementation for send, stop, retry, branch and resume. The transport SHALL call existing Tauri RPC/Host operations and SHALL expose UI Message Stream-compatible updates to `useChat<DesktopUIMessage>`.

#### Scenario: Send a text prompt

- **GIVEN** the user submits text with a selected Provider and model
- **WHEN** DesktopChatTransport sends the request
- **THEN** the Host SHALL receive the existing config-driven execution request
- **AND** the renderer SHALL receive a user message followed by streamed assistant Parts
- **AND** the renderer SHALL not call a Provider API directly

### Requirement: Runtime events SHALL be converted once at the host boundary

OpenCode events, media task events and local workflow events SHALL be mapped to UI Message Stream Parts by one explicit adapter. The UI MUST NOT maintain route-specific event-to-message conversions.

#### Scenario: Stream text and process events

- **GIVEN** OpenCode emits text, reasoning, tool and completion events
- **WHEN** the Host adapter processes them
- **THEN** the renderer SHALL receive ordered text, reasoning and `tool-*`/`data-status` Parts
- **AND** the same event SHALL not appear as both a structured Part and a duplicate plain-text status row

### Requirement: Transport cancellation SHALL preserve partial output

The transport SHALL support stop/cancel and terminate the active Host operation through the existing callback. Already received message Parts SHALL remain in the UI and persistence layer.

#### Scenario: Stop a streaming response

- **GIVEN** an assistant response has emitted partial text
- **WHEN** the user clicks Stop
- **THEN** the Host operation SHALL be cancelled
- **AND** the partial `text` Part SHALL remain visible with a cancelled terminal status
- **AND** a new request SHALL not be created implicitly

### Requirement: Retry and branch SHALL preserve execution identity

Retry SHALL create a new response branch or attempt with the original prompt, Provider, model and relevant attachment references. It MUST NOT silently use the current global model selection.

#### Scenario: Retry after a Provider failure

- **GIVEN** a response failed using `provider-a/model-x`
- **WHEN** the user activates Retry after selecting `provider-b/model-y` for a future message
- **THEN** the retry SHALL still use `provider-a/model-x`
- **AND** the new future message MAY use `provider-b/model-y`

### Requirement: Provider and model selection SHALL remain config-driven

The transport SHALL obtain available Provider/model identities from the parsed `config.json` state. Empty model configuration SHALL remain empty; the transport MUST NOT add `ollama/qwen3:8b` or any other implicit default.

#### Scenario: Config has no selected model

- **GIVEN** the configured Provider has no model id
- **WHEN** the user opens the model selector or submits a prompt
- **THEN** the selector SHALL show an explicit unconfigured state
- **AND** submission SHALL show a clear model-required error without silently falling back

### Requirement: Media and artifact messages SHALL be emitted after registration

For generated image, video, audio and document results, the Host SHALL write and validate the output, register the Artifact, and then emit the corresponding `data-media` or `data-artifact` Part. Artifact callbacks SHALL use stable ids.

#### Scenario: Complete a video task

- **GIVEN** a remote video task reaches completion
- **WHEN** the output is downloaded and registered
- **THEN** the UI SHALL receive a playable `data-media` Part with an Artifact reference
- **AND** the same Artifact SHALL be visible in the Assets route
- **AND** a failed registration SHALL produce a failed state rather than a broken player

### Requirement: Transport recovery SHALL be deterministic

When the desktop app refreshes, restarts or reconnects, the transport SHALL restore the latest persisted `DesktopUIMessage` and active run status. It SHALL not create duplicate runs or reorder completed Parts.

#### Scenario: Reopen a running task

- **GIVEN** a run was active when the desktop window closed
- **WHEN** the user reopens the conversation
- **THEN** the UI SHALL show the last persisted state and a bounded recoverable action
- **AND** Host polling or stream resumption SHALL use the original run identity

### Requirement: Transport security SHALL preserve host boundaries

The renderer SHALL never receive Provider API keys or unrestricted filesystem paths. File, preview, download, device, navigation and execution operations SHALL remain typed Tauri callbacks or Artifact-id operations.

#### Scenario: Preview a local Artifact

- **GIVEN** a message references a local Artifact
- **WHEN** the user chooses Preview or Download
- **THEN** Tauri SHALL resolve the Artifact id through an allowlisted operation
- **AND** the renderer SHALL not construct an arbitrary local path

## REMOVED Requirements

- Page-level OpenCode event parsing for message rendering.
- Renderer-side Provider calls or model fallback behavior.
- Plain-text status rows that duplicate structured UI Message Parts.
