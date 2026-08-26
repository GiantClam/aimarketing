## ADDED Requirements

### Requirement: Desktop conversations SHALL use the shared online interaction model

Desktop conversation rows, message timeline, composer feedback and message actions SHALL be rendered by the shared workbench UI and backed by structured local events/artifacts.

#### Scenario: A local run emits tool and artifact events

- **WHEN** OpenCode streams text, tool, usage, artifact and terminal events
- **THEN** the shared timeline SHALL update without changing the message creation time
- **AND** the artifact action SHALL open or reveal the local file through the Desktop adapter

### Requirement: Desktop Image Assistant SHALL preserve the online state machine

Desktop SHALL support the online Image Assistant session, chat, adaptive clarification, reference carryover, task lifecycle, recovery, candidates, Canvas/layers and export interactions through local adapters.

#### Scenario: The app restarts during generation

- **WHEN** a persisted image task is queued or running at restart
- **THEN** Desktop SHALL restore the session and resume polling or expose a bounded recoverable failure
- **AND** completed candidates and reference selections SHALL not be lost

### Requirement: Desktop workflows SHALL follow the online list-to-canvas flow

`/dashboard/workflows` SHALL first render the shared online list experience including metrics, workflow cards, templates and recent runs. Opening or creating a workflow SHALL enter the shared Builder whose primary authoring surface is Canvas.

#### Scenario: A user opens an existing workflow

- **WHEN** the workflow is selected from the list
- **THEN** the Builder/Canvas SHALL load the local persisted definition
- **AND** save and run SHALL use injected Desktop workflow actions

### Requirement: Desktop Capability Center SHALL apply Windows availability policy

Desktop SHALL use the shared online Capability Center layout and interaction while filtering business capabilities by the Windows v1 execution policy.

#### Scenario: A supported capability has no provider configuration

- **WHEN** the user views the capability center
- **THEN** the capability SHALL remain visible with a needs-configuration state and concrete reason
- **AND** cloud-only and enterprise-only capabilities SHALL be hidden
