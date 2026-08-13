## Purpose

Define durable local conversation history, run summaries, file artifacts, raw-log retention, and usage estimates for the OpenCode workbench without cloud storage or billing semantics.

## ADDED Requirements

### Requirement: Local repositories are the durable conversation source
Conversations, messages, run summaries, key run events, artifacts, and usage SHALL be persisted through the desktop foundation repositories. OpenCode session state MAY accelerate continuity but MUST NOT be the only source needed to display history or diagnose a run.

#### Scenario: Restart the application
- **WHEN** the user closes and reopens the desktop application
- **THEN** conversation history, messages, terminal runs, artifact references, and usage remain available from local storage

#### Scenario: A run was active during a crash
- **WHEN** startup finds a run without a trustworthy terminal event
- **THEN** it is marked interrupted and the UI offers explicit retry without pretending the prior execution succeeded

### Requirement: Artifacts remain local files
Writing, PPT, and general OpenCode outputs SHALL be written into the selected local project and indexed by canonical path, metadata, size, and hash. The application MUST NOT upload, mirror, or convert them into R2 or another AIMarketing-owned storage object.

#### Scenario: Open an existing artifact
- **WHEN** the indexed file still exists and passes path validation
- **THEN** the user can preview it or open it in Explorer or the associated local application

#### Scenario: An indexed artifact was moved externally
- **WHEN** the file no longer exists at its recorded path
- **THEN** the workbench shows it as unavailable and offers relink or removal without deleting unrelated files

### Requirement: Usage is informational and never a balance gate
The workbench SHALL record Provider, model, token counts, Provider-reported cost, and locally estimated cost when known. Usage records MUST NOT debit a balance, enforce subscription limits, or block a configured model because of AIMarketing billing state.

#### Scenario: OpenCode reports tokens and cost
- **WHEN** a completed run includes input tokens, output tokens, or cost
- **THEN** the usage view records the available values with the selected Provider and model

#### Scenario: Pricing is unknown
- **WHEN** tokens or media requests are known but no trustworthy price is configured
- **THEN** the workbench records the usage and labels cost as unknown rather than inventing a value

### Requirement: Raw logs are bounded and redacted
Complete OpenCode NDJSON and tool stdout/stderr SHALL be stored in per-run JSONL files after secret redaction. Raw logs SHALL be deleted when older than 30 days or when their aggregate size exceeds 1GB, oldest first. Conversations, messages, artifacts, projects, and usage MUST NOT be removed by this policy.

#### Scenario: Raw logs exceed the size limit
- **WHEN** retained run logs grow beyond 1GB
- **THEN** the oldest raw logs are deleted until the limit is satisfied while durable history and artifact indexes remain intact

#### Scenario: Export diagnostics
- **WHEN** the user creates a diagnostic package
- **THEN** the package includes bounded runtime and run diagnostics and excludes API keys and unredacted secrets

