# Specification: Official AI Elements Component System for Workbench

**Change ID:** `upgrade-ai-elements-component-system`
**Affects:** `@coworkany/workbench-ui`, AI Entry, Shell, Agent, Capability, Task, Workflow, Media, Image Assistant, Writer, Knowledge, Assets and Dify Chat

---

## ADDED Requirements

### Requirement: Official AI Elements source SHALL be the shared component contract

The workbench SHALL integrate the selected official AI Elements source components under `packages/workbench-ui/src/ai-elements/`, preserving their compound component names and interaction semantics. The project MUST NOT create a parallel page-facing `Ai*` component API for behavior already covered by official components.

#### Scenario: Add a new chatbot primitive

- **GIVEN** a page needs prompt input, message, model selection, attachment or process UI
- **WHEN** the component is implemented
- **THEN** it SHALL use the corresponding official AI Elements source component or a Workbench compatibility composition around it
- **AND** the page SHALL NOT introduce a second custom implementation of the same interaction

#### Scenario: Audit an official component import

- **GIVEN** a component is selected from the official directory
- **WHEN** it is added to the repository
- **THEN** the generated source, dependencies, Tailwind classes, Radix primitives, client boundary and license SHALL be reviewed before migration
- **AND** the stable source SHALL be exported from `@coworkany/workbench-ui`

### Requirement: The shared layer SHALL preserve the Workbench brand system

All official AI Elements components used by Workbench SHALL consume Workbench tokens for brand yellow, ink, surface, border, muted text, semantic status, focus ring, radius, shadow and grid line. Page-level AI UI MUST NOT add hard-coded brand colors or unrelated gradients, fonts or SaaS visual language.

#### Scenario: Render a selected and active control

- **GIVEN** an official ModelSelector, PromptInput action or Task action is selected or active
- **WHEN** it is rendered in Web or Tauri
- **THEN** it SHALL use the same Workbench canonical brand token and focus treatment
- **AND** the component SHALL retain the CoworkAny black/white/yellow visual hierarchy

#### Scenario: Change the canonical brand yellow

- **GIVEN** product design changes the canonical brand yellow
- **WHEN** the token value is updated
- **THEN** all migrated official components SHALL update through the shared token
- **AND** page files SHALL not require a search-and-replace of literal colors

### Requirement: Prompt Input SHALL provide the official compound interaction

The shared composer SHALL compose official PromptInput Header, Body, Footer, Tools, Textarea, Submit, Button, Select and Action Menu parts as needed. It SHALL support Enter submit, Shift+Enter newline, IME-safe input, streaming stop, disabled/error states and attachment integration through `usePromptInputAttachments` and `Attachments`.

#### Scenario: Submit while composing Chinese text

- **GIVEN** the textarea is in an active IME composition
- **WHEN** the user presses Enter
- **THEN** the composer SHALL not submit until the composition is committed
- **AND** after composition, Enter SHALL submit while Shift+Enter SHALL create a newline

#### Scenario: Upload and remove an attachment

- **GIVEN** the user drags a supported file into the composer
- **WHEN** upload succeeds or fails
- **THEN** the official Attachments composition SHALL show preview, progress/error and remove action
- **AND** the submit callback SHALL receive structured attachment references rather than page-owned DOM state

### Requirement: Conversation and Message SHALL preserve streaming conversation behavior

AI conversation surfaces SHALL use Conversation for message scrolling, empty state, download and scroll controls, and Message for user/assistant structure, streaming Markdown, branches and message actions. Business renderers MAY remain as explicit slots for PPT, image, report and other specialized artifacts.

#### Scenario: Stream an assistant response

- **GIVEN** an assistant message receives incremental text and process parts
- **WHEN** the parts are appended
- **THEN** Conversation SHALL maintain the expected scroll behavior
- **AND** Message SHALL render the response without dropping, duplicating or reordering parts

#### Scenario: Recover a conversation after refresh

- **GIVEN** a conversation contains completed, running and failed parts
- **WHEN** the page is refreshed or the session is restored
- **THEN** the adapter SHALL reconstruct the same message order and terminal states
- **AND** the UI SHALL keep copy, retry, branch, artifact and source actions available where applicable

### Requirement: Process components SHALL expose consistent lifecycle states

Reasoning, ChainOfThought, Plan, Task and Tool SHALL express queued, running, waiting/approval, completed, failed, cancelled and denied states where supported by the official component. Reasoning parts from the same assistant turn SHOULD be consolidated, Reasoning SHALL open during streaming and close after completion, and Plan SHALL expose streaming progress without replacing business status data.

#### Scenario: Consolidate multiple reasoning parts

- **GIVEN** one assistant turn emits multiple reasoning fragments
- **WHEN** the message-parts adapter prepares the UI model
- **THEN** fragments from the same turn SHALL be combined into one reasoning presentation unless a detailed ChainOfThought view is explicitly required
- **AND** the timeline SHALL not show repeated duplicate Thinking cards

#### Scenario: Display an approved tool call

- **GIVEN** a tool call moves from input to approval to output
- **WHEN** the runtime emits each transition
- **THEN** Tool and Confirmation SHALL expose the current status, input, output or error and the available action
- **AND** duplicate runtime events SHALL update the existing tool presentation idempotently

### Requirement: Model and context controls SHALL be searchable and accessible

ModelSelector SHALL provide provider grouping, fuzzy search, keyboard navigation, empty state, selection callbacks and trigger focus restoration. Context SHALL be able to present context-window usage and available input/output/reasoning/cache breakdown from adapter-provided usage data.

#### Scenario: Select a model from a provider group

- **GIVEN** the current scope exposes multiple providers and models
- **WHEN** the user searches and selects a model
- **THEN** ModelSelector SHALL return a stable provider/model identity
- **AND** the host SHALL persist it only to the current route, capability or session scope

#### Scenario: View context usage

- **GIVEN** usage data contains token counts and an optional model identifier
- **WHEN** the user opens Context
- **THEN** Context SHALL show the available usage breakdown and remaining window in an accessible popover/hover card
- **AND** cost SHALL be omitted or marked unavailable when tokenlens or equivalent model pricing data is not enabled

### Requirement: Sources and artifacts SHALL remain actionable

Sources, InlineCitation, Artifact, CodeBlock, Image and OpenInChat SHALL be used for source references, inline citations, generated outputs, code, images and external AI handoff where those capabilities are present. Specialized business previews MAY provide slots around these primitives.

#### Scenario: Open an inline citation

- **GIVEN** a response contains a citation with source metadata or a quote
- **WHEN** the user activates the citation
- **THEN** InlineCitation SHALL show the source context using the official interaction
- **AND** the source callback SHALL preserve the existing source URL, document identity or local artifact action

#### Scenario: Copy or open a generated artifact

- **GIVEN** a message produces an image, report, code block or local artifact
- **WHEN** the user selects copy, download, open or external chat action
- **THEN** the shared component SHALL call a typed callback
- **AND** the host adapter SHALL decide how to access the underlying resource without shared UI reading the filesystem or invoking a provider

### Requirement: Queue, Checkpoint and Confirmation SHALL represent durable AI actions

Queue SHALL represent pending messages or tasks, Checkpoint SHALL represent restore/branch actions, and Confirmation SHALL represent tool approval and rejection. Pages MUST NOT use generic alerts or dialogs as the only representation of these AI lifecycle states.

#### Scenario: Restore a checkpoint

- **GIVEN** a conversation has a saved checkpoint with a branchable state
- **WHEN** the user activates restore or branch
- **THEN** Checkpoint SHALL expose the action and the host SHALL perform the existing session operation
- **AND** the message history SHALL remain scoped to the selected conversation

#### Scenario: Reject a dangerous tool

- **GIVEN** a tool requires user approval before execution
- **WHEN** the user rejects it
- **THEN** Confirmation SHALL show the rejected state and reason/action result
- **AND** no provider or runtime execution SHALL be initiated by the shared component itself

### Requirement: Agent, Code and runtime surfaces SHALL use official specialized structures

Agent configuration SHALL use Agent, AgentHeader, AgentInstructions, AgentTools, AgentTool and AgentOutput where applicable. Code and runtime outputs SHALL use CodeBlock, FileTree, Terminal, TestResults, SchemaDisplay, StackTrace, WebPreview, Sandbox or JSXPreview only when their capability is required; otherwise a lightweight fallback SHALL be used.

#### Scenario: Inspect an Agent configuration

- **GIVEN** an Agent has instructions, tools and output schema
- **WHEN** the user opens the Agent detail surface
- **THEN** the shared UI SHALL expose those sections with the official Agent composition
- **AND** the directory may retain business-specific search, category and availability layout

#### Scenario: Render a code result without the optional runtime

- **GIVEN** a code result is available but the runtime preview dependency is not installed
- **WHEN** the result is rendered
- **THEN** CodeBlock or a safe text fallback SHALL remain available
- **AND** the UI SHALL explain that interactive preview is unavailable without failing the base Chatbot bundle

### Requirement: Voice and media components SHALL be capability-gated

AudioPlayer, MicSelector, SpeechInput, Transcription, VoiceSelector and Persona SHALL be adopted only by media or voice surfaces that need them. Device permissions, device changes, unsupported browsers, loading and failure states SHALL be represented explicitly, and the shared layer SHALL provide a non-voice fallback.

#### Scenario: Microphone permission is denied

- **GIVEN** the user opens SpeechInput and denies microphone permission
- **WHEN** the browser reports the denial
- **THEN** the media surface SHALL show an actionable permission/error state
- **AND** it SHALL not block text PromptInput or unrelated AI surfaces

#### Scenario: Seek from a transcription line

- **GIVEN** a transcription contains timestamps and an audio source
- **WHEN** the user clicks a transcript line
- **THEN** AudioPlayer SHALL seek to the corresponding position
- **AND** unavailable media SHALL degrade to readable transcript content

### Requirement: Workflow components SHALL preserve React Flow behavior

Workflow surfaces SHALL use Canvas, Node, Edge, Connection, Controls, Panel and Toolbar as the interaction contract when the installed React Flow version is compatible. Existing node data, ports, parameter metadata, run/save behavior and business layout SHALL remain host-owned.

#### Scenario: Edit and run a workflow node

- **GIVEN** a workflow contains selectable nodes and connected edges
- **WHEN** the user pans, zooms, selects, edits parameters and runs the workflow
- **THEN** Canvas and its official primitives SHALL preserve pan/zoom/select/fit/delete and toolbar behavior
- **AND** the workflow adapter SHALL emit the existing node/run payload without duplicating a second canvas runtime

### Requirement: Shared components SHALL remain host-neutral and accessible

Shared components SHALL receive data and actions through typed props, callbacks and adapters. They SHALL provide visible focus, accessible names, keyboard operation, focus restoration, responsive layout and non-color status cues. They MUST NOT directly read local files, call network APIs or depend on host navigation/runtime.

#### Scenario: Navigate the composer with a keyboard

- **GIVEN** the user does not use a mouse
- **WHEN** the user moves among textarea, attachment menu, model selector, stop and submit controls
- **THEN** every control SHALL be focusable, operable and have an understandable accessible name
- **AND** closing a popover or dialog SHALL restore focus to its trigger

#### Scenario: Render the same component on Web and Tauri

- **GIVEN** Web and Tauri receive equivalent adapter data
- **WHEN** the same AI surface is rendered
- **THEN** both hosts SHALL use the same component source, token and state semantics
- **AND** only navigation, file, device and execution callbacks MAY differ

### Requirement: Migration SHALL preserve existing business behavior

The migration SHALL not change provider routing, model policy, reasoning policy, SSE protocol, task polling, database/API contracts, route behavior or session ownership. Existing `Workbench*` exports MAY remain for one migration release, but SHALL delegate to official compositions and SHALL be removable after page migration.

#### Scenario: Stop a long-running generation

- **GIVEN** an existing host has an active generation and polling session
- **WHEN** the user activates the official PromptInput stop action
- **THEN** the host `onStop` callback SHALL invoke the existing cancellation path
- **AND** the component migration SHALL not create a second polling or provider request

#### Scenario: Unknown message part is received

- **GIVEN** the backend emits a part not yet recognized by the adapter
- **WHEN** the message is rendered
- **THEN** the adapter SHALL preserve ordering and expose a safe fallback representation
- **AND** the unknown part SHALL not crash the conversation or discard known parts

### Requirement: Component and dependency changes SHALL be verified before phase promotion

Each phase SHALL pass the relevant type, SSR, component, adapter, integration, E2E, visual, accessibility and Web/Tauri parity checks before the next phase starts. Optional dependencies SHALL be introduced only after the corresponding capability is in scope.

#### Scenario: Promote the AI Entry migration

- **GIVEN** PromptInput, Conversation, Message, Attachments and ModelSelector have been migrated
- **WHEN** the phase gate is evaluated
- **THEN** IME, keyboard, streaming, scroll, attachment, model search, SSR and visual checks SHALL have evidence
- **AND** no unrelated file changes or known P0/P1 interaction regressions SHALL remain

#### Scenario: Upgrade an official component source

- **GIVEN** a newer official source version is requested
- **WHEN** the upgrade is prepared
- **THEN** the project SHALL record CLI/version, source diff, dependency diff and local brand modifications
- **AND** the upgrade SHALL not overwrite local changes without review

## REMOVED Requirements

- Page-level duplicate AI Composer, Model Selector, Message list, Process renderer, Source card and Artifact card implementations SHALL be removed after their migration phase passes.
- The legacy custom AI primitive implementation in `packages/workbench-ui/src/ai-elements.tsx` SHALL be removed after compatibility exports are no longer needed.
- No standalone custom `Ai*` API SHALL be introduced for interactions already represented by official AI Elements components.
