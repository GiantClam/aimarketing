## Purpose

Define shared contracts for OpenCode sessions, streamed events, Provider capabilities, artifacts, usage, and host communication so runtime behavior can be reused without sharing cloud transports.

## ADDED Requirements

### Requirement: Runtime communication is versioned and bounded
Commands, responses, streamed events, reverse requests, and errors SHALL use a versioned contract with request identity, run identity, event sequence, structured error codes, and explicit size limits. Large artifacts MUST be exchanged by validated path and metadata rather than embedded in IPC messages.

#### Scenario: Receive an unknown future event
- **WHEN** a host receives a schema-valid event type it does not yet render
- **THEN** it preserves ordering, records a bounded diagnostic, and does not corrupt the active run

#### Scenario: Receive an oversized message
- **WHEN** a runtime or host sends a message above the declared IPC limit
- **THEN** the receiver rejects it with a structured protocol error without allocating an unbounded buffer

### Requirement: OpenCode session behavior is host-neutral
Session creation, prompt submission, event normalization, usage extraction, tool lifecycle, abort, and completion semantics SHALL have one shared implementation. Railway, Cloudflare, local process supervision, and desktop IPC SHALL remain transport adapters outside that implementation.

#### Scenario: A tool call streams from OpenCode
- **WHEN** OpenCode emits start, completion, or failure state for a tool call
- **THEN** every host receives the same normalized tool event and run identity

#### Scenario: An OpenCode session aborts
- **WHEN** a host requests cancellation
- **THEN** the shared client invokes the transport abort operation and emits the same terminal cancellation semantics

### Requirement: Provider behavior separates requests from host policy
Shared media Provider code SHALL own input validation, request construction, response normalization, async status mapping, cancellation support, and usage parsing. Host adapters SHALL own credentials, persistence, billing, downloads, artifact registration, and retry policy.

#### Scenario: Provider returns an asynchronous task
- **WHEN** a Provider accepts a media request and returns a task identifier
- **THEN** the shared adapter returns a normalized task result while the host persists and later queries that identifier

#### Scenario: Provider is not configured
- **WHEN** required injected Provider configuration is absent
- **THEN** the adapter returns a stable configuration-required error without reading process-global SaaS environment variables

### Requirement: Canonical Skills generate host bundles
`content/skills/` SHALL remain the canonical source for shared writing Skills. Host runtime bundles, catalogs, releases, and digests MUST be generated from that source and validation MUST fail closed on missing files or digest drift.

#### Scenario: A canonical Skill changes
- **WHEN** a Skill or referenced resource under the canonical source is modified
- **THEN** generated SaaS and desktop bundle digests change together and validation detects stale output

