# Specification: Shared AI Elements Message Surface

**Change ID:** `refactor-desktop-ai-elements-uimessage`
**Affects:** `@aimarketing/workbench-ui`, AI Chat, Agent, Writer, Knowledge, Assets, media and Workflow routes

---

## ADDED Requirements

### Requirement: All in-scope AI surfaces SHALL share one message surface

AI Chat, Agent, Writer, Knowledge, Assets, image/video/audio generation and Workflow SHALL use one `WorkbenchMessageSurface` composed from AI Elements source components. Route-specific behavior SHALL be injected through typed capability slots and callbacks.

#### Scenario: Open equivalent output on two routes

- **GIVEN** Chat and Writer receive the same assistant text and artifact Parts
- **WHEN** both routes render the response
- **THEN** they SHALL use the same Conversation, Message, MessageResponse and Artifact primitives
- **AND** only the route-specific editor or preview slot MAY differ

### Requirement: Conversation SHALL use full-screen floating-composer geometry

The message viewport SHALL occupy the available desktop window. PromptInput SHALL float at the bottom without covering the last message. ConversationScrollButton SHALL appear above the PromptInput and close menus/overlays without moving the conversation unexpectedly.

#### Scenario: Scroll while the composer is visible

- **GIVEN** the conversation contains enough messages to overflow the viewport
- **WHEN** the user scrolls upward
- **THEN** the viewport SHALL remain full-screen
- **AND** a scroll-to-latest control SHALL appear above the composer
- **AND** the last message SHALL remain reachable without being obscured

### Requirement: Message styling SHALL preserve AI Elements hierarchy

Assistant messages SHALL be full-width and visually light. User messages SHALL be compact and right-aligned. Only the message group and execution-process group MAY retain outer boundaries. Component surfaces, spacing, typography and status treatments SHALL use AI Elements/shadcn tokens, with only the Workbench brand color overridden.

#### Scenario: Render an active assistant response

- **GIVEN** an assistant response is streaming
- **WHEN** the message is displayed
- **THEN** text SHALL be visible immediately with the active brand state
- **AND** the response SHALL not be wrapped in a heavy custom card

### Requirement: PromptInput SHALL expose the complete AI Elements interaction

PromptInput SHALL compose Header, Body, Footer, Tools, Textarea, Submit, ActionMenu, Attachments and ModelSelector as needed. It SHALL support IME-safe Enter submission, Shift+Enter newline, drag/drop files, stop generation, disabled/error states and automatic height adjustment.

#### Scenario: Submit with Chinese IME

- **GIVEN** the textarea is composing Chinese input
- **WHEN** Enter is pressed before composition ends
- **THEN** the message SHALL not be submitted
- **AND** after composition, Enter SHALL submit while Shift+Enter inserts a newline

### Requirement: Attachments SHALL use the official variants

Prompt attachments SHALL use `inline`, message attachments SHALL use `grid`, and detailed file/source lists SHALL use `list`. Each item SHALL expose preview, name, media type, lifecycle status, remove and safe download behavior as supported by its capability.

#### Scenario: Upload an image and a document

- **GIVEN** the user drops an image and a PDF into PromptInput
- **WHEN** upload begins, succeeds or fails
- **THEN** the header SHALL show both items and their status
- **AND** the user SHALL be able to remove or retry each item
- **AND** the message SHALL render the successful image with a thumbnail and the document with file metadata

### Requirement: Process details SHALL be compact and stateful

Reasoning, Task, Tool and workflow process Parts SHALL render as collapsible AI Elements sections. Active, waiting and failed sections SHALL be expanded; completed and cancelled sections SHALL be collapsed. No approval action SHALL appear unless a real runtime callback exists.

#### Scenario: Complete a multi-step run

- **GIVEN** a run has three completed steps
- **WHEN** the assistant response finishes
- **THEN** the execution process SHALL collapse to a summary such as `3/3 completed`
- **AND** the response text and outputs SHALL remain directly visible

### Requirement: Outputs SHALL be actionable by media type

Text SHALL use MessageResponse, images SHALL use previewable image content, video SHALL provide play/pause, audio SHALL use AudioPlayer, and documents/code SHALL use Artifact or CodeBlock actions. Successful outputs SHALL expose typed preview, copy, download and asset-library callbacks where applicable.

#### Scenario: Render a completed media output

- **GIVEN** a registered image, video or audio Artifact is referenced by `data-media`
- **WHEN** the Part is rendered
- **THEN** the user SHALL see the appropriate inline preview or player
- **AND** preview, playback and download SHALL use the Artifact callback rather than a raw local path

### Requirement: Sources and artifacts SHALL be visually quiet but discoverable

Sources SHALL use a compact grouped disclosure such as `Used N sources`. Artifact headers SHALL expose title and available actions. Sources, artifacts and media MUST NOT create nested heavy cards inside a message.

#### Scenario: Copy a generated report

- **GIVEN** a report Artifact is attached to an assistant response
- **WHEN** the user chooses copy or download
- **THEN** the shared surface SHALL invoke the typed callback
- **AND** it SHALL show completion or failure feedback without navigating away unexpectedly

### Requirement: Message actions SHALL support focus and branching

MessageAction controls SHALL provide copy, retry, feedback and branch navigation where supported. Buttons MAY be visually quiet until hover, but SHALL become visible on keyboard focus and remain available for failed messages.

#### Scenario: Retry a failed response

- **GIVEN** an assistant response failed
- **WHEN** the user activates Retry
- **THEN** a new response branch SHALL be created with the same prompt, Provider and model
- **AND** the failed response SHALL remain inspectable

### Requirement: ModelSelector SHALL be config-driven and keyboard-accessible

The model selector SHALL read only configured Provider/model entries from `config.json`, group entries by Provider, support search and keyboard navigation, close on outside click/Escape and restore focus to its trigger. No implicit Ollama or global model fallback is allowed.

#### Scenario: Select a configured model

- **GIVEN** `config.json` contains two Providers and four models
- **WHEN** the user searches and selects one model
- **THEN** the trigger SHALL show the selected Provider/model identity
- **AND** the next run SHALL use that exact identity

### Requirement: Shared surfaces SHALL remain host-neutral

Shared UI MUST NOT read local files, call Provider APIs, invoke Tauri directly or navigate through a host-specific router. Such behavior SHALL be injected as typed callbacks.

#### Scenario: Render the same message on Web and Tauri

- **GIVEN** Web and Tauri provide equivalent `DesktopUIMessage` data
- **WHEN** the shared surface renders
- **THEN** visual structure and interaction semantics SHALL be identical
- **AND** only file, device, navigation and execution callbacks MAY differ

## REMOVED Requirements

- Page-level custom Message, Composer, Attachment, Source, Artifact and status-card implementations.
- Repeated `.wb-*` AI interaction styling that duplicates AI Elements behavior.
- Model selectors implemented as page-owned native `select` controls.
