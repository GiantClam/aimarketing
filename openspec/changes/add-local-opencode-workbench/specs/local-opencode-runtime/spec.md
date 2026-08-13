## Purpose

Define the local OpenCode runtime that owns every Windows desktop text interaction while providing persistent sessions, live tool events, Full Access, cancellation, and recoverable failure semantics.

## ADDED Requirements

### Requirement: Every ordinary desktop chat uses OpenCode
The Windows desktop application SHALL route every ordinary chat turn through the local OpenCode runtime. It MUST NOT use an AI SDK native text path, a direct text-model request path, Railway, Cloudflare, or another AIMarketing backend as a fallback.

#### Scenario: Send an ordinary chat message
- **WHEN** a user submits text without selecting a specialized Skill
- **THEN** the run selects local OpenCode, creates or resumes the conversation's OpenCode session, and streams the answer through the shared runtime event contract

#### Scenario: OpenCode is unavailable
- **WHEN** the local OpenCode probe or process is unavailable
- **THEN** the chat does not bypass OpenCode and instead enters the mandatory runtime repair or explicit failed state

### Requirement: Conversations have isolated persistent sessions
Each local conversation SHALL map to one stable OpenCode session within the active normal or portable data root. Sessions MUST remain isolated across conversations and MUST NOT use SaaS enterprise identity as a persistence key.

#### Scenario: Continue a conversation
- **WHEN** a user sends a later turn in the same conversation
- **THEN** the runtime reuses that conversation's OpenCode session and preserves its local working context

#### Scenario: Start a second conversation
- **WHEN** the same user creates another conversation
- **THEN** the runtime uses a distinct OpenCode session and workspace

### Requirement: OpenCode is locally supervised and not externally exposed
The application SHALL run `opencode serve` on loopback with a random port and random Basic Auth for the application lifetime. CORS and mDNS exposure MUST be disabled, and the process tree MUST be supervised by the desktop foundation.

#### Scenario: The application exits
- **WHEN** the Tauri host terminates normally or abnormally
- **THEN** its Job Object terminates the local OpenCode process tree

#### Scenario: OpenCode crashes during a run
- **WHEN** the OpenCode process exits before completion
- **THEN** the run is marked interrupted, the process may restart, and the application does not automatically replay a potentially paid request

### Requirement: OpenCode runs with default Full Access
The desktop OpenCode runtime SHALL start with file, shell, Skill, network, and accessible external-directory tools allowed under the current Windows user's privileges. The application MUST NOT show a permission-mode picker or request confirmation for each command, and MUST NOT automatically elevate through UAC.

#### Scenario: A Skill needs a shell or file operation
- **WHEN** OpenCode invokes an allowed local tool
- **THEN** the operation runs with the current Windows user's access and its lifecycle is visible in the workbench

#### Scenario: A user stops a dangerous or unwanted run
- **WHEN** the user activates emergency stop
- **THEN** the current OpenCode session is aborted and the run reaches a terminal cancelled or interrupted state

### Requirement: Runtime events and secrets are handled safely
Text, reasoning, tool, usage, artifact, warning, error, and completion events SHALL be normalized, ordered, and bounded. API keys MUST NOT appear in command-line arguments, SQLite, user-visible tool output, raw logs, or diagnostic exports.

#### Scenario: A tool emits a large diagnostic
- **WHEN** stdout or stderr exceeds the event display limit
- **THEN** the UI receives a bounded summary while the redacted raw output is written to the run log

