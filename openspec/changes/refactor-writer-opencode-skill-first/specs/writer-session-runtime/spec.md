## Purpose

Define how Writer conversations continue through OpenCode without losing the complete active article, while preserving tenant isolation, durable recovery, and one authoritative Skill-driven result per user turn.

## ADDED Requirements

### Requirement: Stable conversation-scoped runtime session
The system SHALL associate every Writer conversation with a stable OpenCode session identity derived from the deployment environment, tenant or personal scope, user, conversation, and Writer agent. The identity MUST remain stable across text turns and MUST differ across users, tenants, environments, and conversations.

#### Scenario: Continue the same conversation
- **WHEN** the same user sends multiple text turns in one Writer conversation
- **THEN** every turn uses the same OpenCode session identity

#### Scenario: Isolate different conversations
- **WHEN** two conversations differ by user, tenant, environment, or conversation ID
- **THEN** they use different OpenCode session identities and cannot share runtime context

### Requirement: Complete active draft context
The system SHALL provide the complete persisted active draft and its revision to every Writer turn that has an active draft. The active draft MUST remain independent from clipped or summarized chat history and MUST NOT be excluded because a task or conversation is in a pending or drafting state.

#### Scenario: Revise a long existing article
- **WHEN** a user requests a change to an existing article whose body exceeds the chat-history summary limit
- **THEN** the Writer runtime receives the complete article, including its beginning and end, and the current revision

#### Scenario: Generate while a task is pending
- **WHEN** a revision task is marked pending or running
- **THEN** the previously active article remains available as runtime context and visible as the active draft

### Requirement: One Skill-driven execution per text turn
The system SHALL execute one OpenCode Writer turn for each accepted Writer text request. The selected orchestrator and platform Skill SHALL determine whether the turn needs clarification or produces a draft; the application MUST NOT run a separate model-backed brief extraction or infer create, revise, translate, research, or platform-adaptation intent with application heuristics.

#### Scenario: Information is incomplete
- **WHEN** the selected Skill determines that required information is missing
- **THEN** the turn returns a clarification outcome without starting a second model execution

#### Scenario: Information is sufficient
- **WHEN** the selected Skill determines that the request can be completed
- **THEN** the same OpenCode turn returns the completed draft result

### Requirement: Structured turn result
Every successful Writer turn SHALL submit a schema-valid result containing the outcome, operation, platform, user-visible message, optional draft, base revision, research state, and asset intents. The system MUST reject missing, malformed, incompatible, or stale results and MUST NOT infer a result from unstructured model text.

#### Scenario: Draft result is valid
- **WHEN** a Skill submits a draft-ready result with non-empty content and a current base revision
- **THEN** the system accepts and persists the result

#### Scenario: Skill does not submit a result
- **WHEN** OpenCode finishes without a schema-valid Writer result submission
- **THEN** the task fails with a result-not-submitted error and does not overwrite the active draft

#### Scenario: Submitted base revision is stale
- **WHEN** a transformation result references an older revision than the active draft
- **THEN** the system rejects the result as a revision conflict and preserves the active draft

### Requirement: Durable session recovery
The database SHALL remain the authoritative source for Writer messages, active draft, revision, platform binding, and recovery context. If the runtime session is unavailable or inconsistent, the system SHALL retry the turn at most once with a recovery snapshot containing the complete active draft and required recent context.

#### Scenario: Runtime session is lost
- **WHEN** OpenCode reports that the conversation session or checkpoint is unavailable
- **THEN** the system retries once with the durable recovery snapshot and the same conversation scope

#### Scenario: Recovery also fails
- **WHEN** the single recovery attempt fails
- **THEN** the task fails without changing the active draft or charging twice

### Requirement: Shared runtime configuration
Writer SHALL use the existing shared OpenCode runtime and provider configuration. The system MUST NOT require per-platform runtime URLs, per-platform OpenCode instances, or a Writer-specific enable flag to execute supported Writer platforms.

#### Scenario: Add a supported platform binding
- **WHEN** a new platform Skill is enabled in the Writer registry
- **THEN** it runs through the existing shared OpenCode runtime without new platform-specific environment variables
