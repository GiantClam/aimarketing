## Purpose

Define the no-account local Agent workbench for ordinary conversation, model and Skill selection, live execution visibility, and desktop-only navigation.

## ADDED Requirements

### Requirement: The workbench is local and account-free
The desktop workbench SHALL open under one stable local identity without registration, login, enterprise selection, role checks, subscription, balance, or billing gates.

#### Scenario: Open the application after runtime bootstrap
- **WHEN** all mandatory runtime and data migrations pass
- **THEN** the user enters the local workbench without an authentication screen

#### Scenario: Inspect desktop navigation
- **WHEN** the desktop shell renders its primary navigation
- **THEN** it contains only approved local product areas and no Lead Hunter, public marketing, enterprise, billing, Agent publishing, or marketplace entry

### Requirement: Desktop shell follows the online dashboard contract
The desktop shell SHALL preserve the online dashboard's retained route paths, navigation order, section labels, typography tokens, spacing, and message-frame geometry. The desktop adapter MAY replace authentication and cloud data sources, but MUST NOT invent a second product shell or rename retained routes.

#### Scenario: Navigate to a retained online route
- **WHEN** the user selects Home, AI Chat, Writing, Image Assistant, Workflows, Tasks, Assets, Knowledge Base, or Video Agent
- **THEN** the desktop URL state uses the corresponding `/dashboard/...` route and renders the same route label and section placement as the online dashboard

#### Scenario: Render a streamed message
- **WHEN** an assistant or user message is displayed on desktop
- **THEN** it uses the shared online message max width, 14px/16px row padding, 36px avatar, 6px radius, role colors, label typography, and task-event indentation

### Requirement: Users can select configured models and Skills
The workbench SHALL list compatible text models and approved local Skills from the desktop config and generated Skill catalog. Missing Provider configuration SHALL be visible and MUST prevent only the affected execution.

#### Scenario: Select an OpenAI-compatible model
- **WHEN** a configured Provider/model and reasoning effort are selected
- **THEN** the next OpenCode request receives that request-scoped configuration

#### Scenario: A selected model has no usable key
- **WHEN** the user submits a turn with an unconfigured Provider
- **THEN** the workbench shows a configuration-required error and does not start a fallback model

### Requirement: Execution is visible and controllable
The workbench SHALL stream assistant text, reasoning status, tool lifecycle, artifacts, warnings, usage, and terminal state as they occur. An emergency stop MUST remain available while a run is active.

#### Scenario: OpenCode uses multiple tools
- **WHEN** a run invokes file, shell, Skill, or network tools
- **THEN** the workbench appends ordered visible steps and associates them with the active run

#### Scenario: The user cancels during streaming
- **WHEN** emergency stop is selected before completion
- **THEN** streaming stops, the runtime receives abort, and the conversation preserves completed messages and artifacts without inventing a successful answer

### Requirement: Shared UI behavior remains host-adapted
The desktop workbench SHALL compose the shared Workbench UI through the Desktop `WorkbenchClient` and desktop navigation adapter. It MUST NOT call Next `/api/*` routes or depend on a locally hosted Next server.

#### Scenario: Load conversation history
- **WHEN** the desktop workspace requests conversations and messages
- **THEN** the Desktop client resolves them through local IPC and foundation repositories

### Requirement: Retained routes preserve their online page archetypes
The desktop adapter SHALL render the retained routes using the same page archetype as the online dashboard: full-height conversation canvas for AI Chat and Writer, node-oriented builder for Workflows, creation controls plus preview for Image/PPT/Video routes, and resource/stat panels for Tasks, Assets, Knowledge Base, Capabilities, and Settings.

#### Scenario: Open a conversation or Writer route
- **WHEN** the user opens `/dashboard/ai`, `/dashboard/ai/[conversationId]`, `/dashboard/writer`, or `/dashboard/writer/[conversationId]`
- **THEN** the desktop renders the shared message stream and bottom composer layout, while sending the turn through the local OpenCode session

#### Scenario: Open a workflow or media route
- **WHEN** the user opens `/dashboard/workflows`, `/dashboard/image-assistant`, `/dashboard/video`, or an approved PPT assistant query
- **THEN** the desktop renders the corresponding builder/media archetype and keeps the route path, capability labels, and local run/stop interaction stable

#### Scenario: Open a local resource route
- **WHEN** the user opens `/dashboard/tasks`, `/dashboard/assets`, `/dashboard/knowledge-base`, `/dashboard/capabilities`, or `/dashboard/settings`
- **THEN** the desktop renders the resource/stat archetype and uses local repositories/configuration without introducing a cloud account gate
