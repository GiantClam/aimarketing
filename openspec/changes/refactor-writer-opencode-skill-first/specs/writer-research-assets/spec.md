## Purpose

Define governed research and article-asset behavior so platform Skills can use real sources and request appropriate cover or inline images without bypassing security, tenant isolation, billing, persistence, or recoverability.

## ADDED Requirements

### Requirement: Skill-directed URL research
The Writer application SHALL pass the user's current request without application-level URL intent enumeration. The active OpenCode Skill SHALL decide whether a URL or fresh information requires research and SHALL access it only through the governed Writer web-fetch capability.

#### Scenario: User provides a relevant URL
- **WHEN** the active Skill determines that the URL is needed to complete the request
- **THEN** OpenCode invokes the governed fetch capability and uses the returned readable source material

#### Scenario: URL is present but not requested as a source
- **WHEN** a URL appears in quoted or incidental content and the Skill determines it is not required
- **THEN** the turn can complete without fetching it

### Requirement: Governed network access
Writer research requests MUST allow only HTTP or HTTPS and MUST enforce server-side request-forgery protection, redirect limits, response-size limits, readable content types, per-request timeouts, and audit metadata. Skills MUST NOT receive credentials or unrestricted network access.

#### Scenario: URL resolves to a private network target
- **WHEN** a research URL resolves to a prohibited private, loopback, link-local, or metadata address
- **THEN** the fetch is denied and no connection to the target is made

#### Scenario: Response exceeds limits
- **WHEN** a fetched response exceeds the configured size, redirect, type, or timeout limit
- **THEN** the fetch stops with a bounded failure result

### Requirement: Research result transparency
The structured Writer result SHALL report whether research was requested, whether it completed, and which final source URLs were used. A Skill MUST NOT claim to have read or verified a source when governed retrieval failed or was unavailable.

#### Scenario: Research succeeds
- **WHEN** all required sources are retrieved successfully
- **THEN** the result marks research complete and reports the final source URLs

#### Scenario: Research fails
- **WHEN** required retrieval fails or times out
- **THEN** the result marks research incomplete and the output avoids unsupported source claims

### Requirement: Tenant-scoped enterprise knowledge
Enterprise knowledge access SHALL be read-only and automatically bound to the authenticated user's enterprise scope. A Skill MUST NOT select or override the enterprise identifier and MUST NOT receive knowledge-source credentials.

#### Scenario: Search enterprise knowledge
- **WHEN** a Skill requests enterprise context for an authenticated enterprise user
- **THEN** only authorized datasets from that user's enterprise are searched and returned with source metadata

#### Scenario: Attempt cross-enterprise access
- **WHEN** a request attempts to name or access another enterprise scope
- **THEN** the system ignores or rejects the supplied scope and returns no cross-enterprise content

### Requirement: Structured article asset intents
Platform Skills SHALL express cover and inline image needs as validated asset intents containing a stable identifier, kind, prompt, placement, and aspect ratio. Skills MUST NOT generate, upload, or fabricate final image URLs; the application SHALL own image generation, storage, billing, and URL persistence.

#### Scenario: WeChat article is ready
- **WHEN** `khazix-writer` submits a new WeChat article draft
- **THEN** its validated result supports at least one cover-image intent and any needed inline-image intents within the registry limits

#### Scenario: Platform does not support images
- **WHEN** a platform binding declares an asset kind unsupported
- **THEN** the system rejects a result that requests that asset kind

### Requirement: Independent per-image timeout
Each requested Writer image SHALL receive its own generation timeout. A multi-image task MUST allow total elapsed time to accumulate across images and MUST NOT apply an overall timeout that is shorter than the permitted cumulative per-image execution.

#### Scenario: Multiple images approach the per-image limit
- **WHEN** several images each complete within their individual timeout
- **THEN** the task allows their cumulative duration and does not fail solely because the total exceeds one image timeout

### Requirement: Partial success and resumable asset generation
The system SHALL persist asset progress after each image, preserve ready assets if a later image fails, report partial success when appropriate, and resume only unfinished assets after worker or task recovery.

#### Scenario: One image fails in a multi-image task
- **WHEN** earlier images are ready and a later image fails
- **THEN** ready images remain available, remaining eligible images continue, and final asset status can be partial

#### Scenario: Worker restarts during generation
- **WHEN** an asset worker restarts after some images are persisted as ready
- **THEN** recovery skips ready images and continues only pending or retryable assets
