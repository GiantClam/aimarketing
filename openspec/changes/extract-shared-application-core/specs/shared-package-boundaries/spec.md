## Purpose

Define enforceable boundaries that keep AIMarketing application logic reusable by the existing SaaS host and the Windows desktop host without maintaining copied implementations.

## ADDED Requirements

### Requirement: Shared packages are host-neutral
Every shared package SHALL be buildable without importing Next.js routes or navigation, Postgres repositories, SaaS authentication, enterprise governance, billing, R2, Railway, Cloudflare, or another host-specific runtime. A repository check MUST fail when a forbidden dependency enters a shared package.

#### Scenario: A host-specific import is introduced
- **WHEN** a shared source file imports a forbidden SaaS module or framework API
- **THEN** the package boundary test fails and identifies the offending file and import

#### Scenario: A package uses an injected port
- **WHEN** shared logic needs persistence, navigation, artifacts, provider configuration, or external execution
- **THEN** it depends on a declared interface and the owning host supplies the implementation

### Requirement: Shared behavior has one maintained implementation
Logic moved into a shared package SHALL NOT remain as a second independently maintained implementation under its old path. Existing SaaS import paths MAY remain as thin re-exports or host composition modules during migration.

#### Scenario: Existing SaaS code imports the old path
- **WHEN** a SaaS caller has not yet migrated to the package import
- **THEN** the old path resolves to the shared implementation without duplicating its logic

#### Scenario: Desktop consumes shared behavior
- **WHEN** the desktop host needs the same runtime, workflow, Provider, Writer, or UI behavior
- **THEN** it imports the shared package and supplies desktop ports rather than copying a file from `lib/`

### Requirement: Extraction starts after the architecture direction is accepted
Broad shared extraction SHALL begin after the Windows foundation decision is `approved`. Incomplete runtime, capability, clean-VM, packaging, or release evidence MUST NOT block host-neutral TypeScript extraction.

#### Scenario: Runtime evidence is incomplete
- **WHEN** WebView2, OpenCode, PPT, embedding, or clean-VM evidence remains assigned to a downstream change
- **THEN** extraction continues and keeps those behaviors behind declared host ports

#### Scenario: A discovery invalidates the shared boundary
- **WHEN** implementation proves the planned host-neutral boundary or SaaS parity strategy cannot hold
- **THEN** extraction pauses until the affected proposal and specification are revised

### Requirement: SaaS remains a supported host
The existing Next.js SaaS SHALL continue to build and SHALL preserve its current behavior while implementations move behind shared contracts. Desktop exclusions MUST NOT delete or disable SaaS-only identity, billing, enterprise, cloud storage, or public-site features.

#### Scenario: A shared implementation is adopted by SaaS
- **WHEN** a SaaS module switches to a shared package
- **THEN** its existing unit, route, integration, lint, typecheck, and production-build gates continue to pass
