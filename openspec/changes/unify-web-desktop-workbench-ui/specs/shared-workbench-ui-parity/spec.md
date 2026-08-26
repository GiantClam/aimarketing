## ADDED Requirements

### Requirement: Target workspaces SHALL have one React and CSS source

The Web and Windows hosts SHALL render the targeted dashboard surfaces from public exports of `@aimarketing/workbench-ui`. Host code MAY compose adapters and capability policy but SHALL NOT maintain copied page components or copied route-specific CSS.

#### Scenario: Both hosts render a target surface

- **WHEN** Web and Desktop render the same target route
- **THEN** both SHALL import the same public shared workspace or view component
- **AND** both SHALL load the package CSS export
- **AND** provenance tests SHALL fail if Desktop reintroduces a private target-page implementation

### Requirement: Messages SHALL retain structured timeline semantics

Every message SHALL have a stable creation timestamp and MAY contain ordered structured parts for text, tool activity, status, usage, artifacts, sources and reports. Adapters SHALL preserve event sequence and timestamps instead of flattening them into display-only labels.

#### Scenario: A streamed assistant message completes

- **WHEN** the first assistant delta creates a message and later terminal events complete it
- **THEN** the original `createdAt` SHALL remain unchanged
- **AND** tool, usage, artifact and terminal parts SHALL appear in deterministic sequence order

#### Scenario: An old flat message is restored

- **WHEN** a persisted message has content but no structured parts
- **THEN** the adapter SHALL expose an equivalent text part without rejecting the conversation

### Requirement: Shared interactions SHALL be accessible and host-neutral

Copy, open/reveal artifact, retry and navigation controls SHALL expose accessible names and invoke injected actions. Shared UI SHALL NOT import Next APIs, Tauri APIs, SQLite or provider SDKs.

#### Scenario: A user opens an artifact

- **WHEN** the user activates the artifact action in either host
- **THEN** the same shared component SHALL call the injected artifact action with the same artifact identity
- **AND** each host adapter SHALL perform its appropriate open/reveal behavior
