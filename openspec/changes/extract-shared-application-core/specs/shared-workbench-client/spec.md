## Purpose

Define the client and navigation seams that allow the same React workbench behavior to run inside Next.js and Tauri without embedding either host's routing or transport APIs.

## ADDED Requirements

### Requirement: Shared UI uses an injected application client
Shared React workbench components SHALL perform conversation, message, model, workflow, media, artifact, usage, and streaming operations through a typed `WorkbenchClient`. Shared components MUST NOT hard-code `/api/*`, Tauri invoke calls, or direct database access.

#### Scenario: SaaS renders a shared workspace
- **WHEN** a shared workspace runs in Next.js
- **THEN** the Web adapter translates client operations into the existing authenticated API contracts

#### Scenario: Desktop renders a shared workspace
- **WHEN** the same workspace runs in Tauri
- **THEN** the Desktop adapter translates operations into versioned local commands and streamed events

### Requirement: Shared UI uses injected navigation
Shared components SHALL navigate, link, replace, and read route state through a `NavigationAdapter`. They MUST NOT import `next/navigation` or `next/link` from the shared package.

#### Scenario: Open a conversation in SaaS
- **WHEN** a user selects a conversation in the Web host
- **THEN** the Next navigation adapter updates the existing SaaS route

#### Scenario: Open a conversation in desktop
- **WHEN** a user selects the same conversation in the desktop host
- **THEN** the desktop navigation adapter updates local route state without starting a web server

### Requirement: UI extraction preserves SaaS behavior
UI slices SHALL be migrated incrementally behind Web adapters before the desktop host consumes them. Existing SaaS loading, error, streaming, cancellation, and artifact states MUST remain covered by regression tests.

#### Scenario: A client seam changes response mapping
- **WHEN** a shared component receives a Web adapter response that differs from the previous API shape
- **THEN** a parity test fails before the component is released to either host

