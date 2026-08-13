## Purpose

Define a host-neutral workflow runtime whose schema and execution semantics remain identical across SaaS and desktop while storage and capability execution remain host-owned.

## ADDED Requirements

### Requirement: Versioned workflow definitions are shared
Workflow node, edge, port, schema-version, revision, and definition-hash behavior SHALL have one TypeScript implementation shared by every host. Existing definitions MUST migrate deterministically and reject unsupported or invalid graphs consistently.

#### Scenario: Load an existing SaaS workflow
- **WHEN** the shared runtime receives a supported legacy or current workflow definition
- **THEN** it produces the same normalized definition, hash, validation results, and executable plan as the pre-extraction SaaS implementation

#### Scenario: Load an invalid graph
- **WHEN** a definition contains a cycle, dangling edge, incompatible port, or unsupported node version
- **THEN** every host receives the same structured validation issue and does not start execution

### Requirement: Execution depends only on workflow ports
The shared workflow executor SHALL invoke capabilities, persistence, artifacts, events, time, cancellation, and recovery only through declared ports. It MUST NOT construct Next requests, access a database directly, reserve credits, or assume cloud artifact URLs.

#### Scenario: SaaS executes a node
- **WHEN** the SaaS host runs a workflow node
- **THEN** its adapter may apply identity, billing, cloud task, and artifact policies without changing shared graph semantics

#### Scenario: Desktop executes a node
- **WHEN** the desktop host runs the same workflow node
- **THEN** its adapter may invoke local OpenCode, local files, RAG, or configured media Providers without importing SaaS infrastructure

### Requirement: Iteration and recovery semantics remain stable
Foreach, collect, concurrency limits, fail-fast behavior, cancellation, idempotency, retry, resume compatibility, and node-state transitions SHALL be part of the shared runtime and covered by shared fixtures.

#### Scenario: Recover an interrupted asynchronous node
- **WHEN** a host restores a persisted node attempt with a provider task identifier
- **THEN** the runtime resumes through the host port without submitting a duplicate external request

#### Scenario: Cancel a running graph
- **WHEN** cancellation is requested during parallel or foreach execution
- **THEN** no new eligible nodes start, running operations receive the cancellation signal, and final node states follow the shared contract

### Requirement: SaaS workflow parity is verified
Extraction SHALL NOT be considered complete until the existing SaaS workflow tests and an adapter-parity suite pass against the shared implementation.

#### Scenario: A migration changes execution output
- **WHEN** a shared-core fixture produces a different plan, state transition, output bundle, or normalized error than the SaaS baseline
- **THEN** the parity gate fails and the migration cannot be completed

