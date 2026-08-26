# Specification: Desktop UIMessage Contract

**Change ID:** `refactor-desktop-ai-elements-uimessage`
**Affects:** `@aimarketing/workbench-client`, desktop persistence, Tauri adapters

---

## ADDED Requirements

### Requirement: DesktopUIMessage SHALL be the frontend message source of truth

The desktop frontend SHALL use a typed `DesktopUIMessage` based on AI SDK `UIMessage<Metadata, DataParts, Tools>`. React state, message rendering and new message persistence MUST use this type. `WorkbenchMessagePart` MUST NOT remain a page-facing UI protocol.

#### Scenario: Render a rich assistant turn

- **GIVEN** a turn contains text, reasoning, a task, a tool call, a source and an artifact
- **WHEN** the runtime stream is converted
- **THEN** one `DesktopUIMessage` SHALL contain ordered Parts for all supported content
- **AND** the renderer SHALL not inspect raw OpenCode events

### Requirement: Native UIMessage Parts SHALL be preferred

The adapter SHALL use native Parts for text, reasoning, tools, files and sources where their semantics match. Custom capabilities SHALL use typed `data-*` Parts with explicit schemas.

#### Scenario: Convert a generated media result

- **GIVEN** a completed image, video or audio Artifact exists
- **WHEN** the result is added to the message
- **THEN** the adapter SHALL emit a typed `data-media` Part referencing the Artifact
- **AND** it SHALL not encode the media as an untyped JSON string or raw filesystem path

### Requirement: Parts SHALL be immutable, ordered and idempotent

Every persisted Part SHALL have a stable identity. Runtime sequence and creation time SHALL be preserved. Repeated events for the same text, tool call, task, media or artifact SHALL update the existing Part without duplication.

#### Scenario: Receive a duplicate tool result

- **GIVEN** the same tool result is delivered twice
- **WHEN** the adapter merges both events
- **THEN** `DesktopUIMessage.parts` SHALL contain one tool Part
- **AND** its output and terminal status SHALL remain unchanged by the duplicate

### Requirement: Message metadata SHALL preserve execution identity

Message metadata SHALL support at least `conversationId`, `runId`, `providerId`, `modelId`, `createdAt`, `updatedAt` and route/capability scope where applicable. The selected model SHALL be immutable for an active run and its retry branches.

#### Scenario: Switch models between messages

- **GIVEN** the user selects a new model in the PromptInput
- **WHEN** a new message is sent
- **THEN** only the new run SHALL use the new `providerId`/`modelId`
- **AND** previous messages and runs SHALL retain their original metadata

### Requirement: New message persistence SHALL store UIMessage Parts

The message store SHALL persist `DesktopUIMessage.parts` in `parts_json` and message-level metadata in `metadata_json`. `role`, text summary and timestamps MAY be denormalized for indexing. Old internal-test messages do not require migration or compatibility rendering.

#### Scenario: Restore a new conversation

- **GIVEN** a new conversation contains streaming-completed Parts
- **WHEN** the user reopens it
- **THEN** the store SHALL reconstruct the same `DesktopUIMessage` order, metadata and terminal statuses
- **AND** the renderer SHALL use the same AI Elements components as during the original run

### Requirement: Unknown custom Parts SHALL fail safely

The adapter SHALL preserve known Parts and render an explicit, non-crashing fallback for an unsupported custom Part. It MUST NOT drop the complete message or expose raw credentials.

#### Scenario: Receive an unsupported data Part

- **GIVEN** a future runtime emits an unknown `data-*` Part
- **WHEN** the message is rendered
- **THEN** known text and process Parts SHALL remain visible
- **AND** the unknown Part SHALL be represented as a safe unavailable-content state

## REMOVED Requirements

- Page-facing use of `WorkbenchMessagePart` as the canonical frontend message state.
- Old-message compatibility rendering and backfill requirements for internal-test data.
