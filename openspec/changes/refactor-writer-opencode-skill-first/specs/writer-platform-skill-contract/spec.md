## Purpose

Define a replaceable, registry-governed contract for Writer platform Skills so each turn has one editorial authority and platform capabilities can evolve without changing the Writer application workflow.

## ADDED Requirements

### Requirement: One primary Skill per supported platform
Every listed Writer platform SHALL have exactly one primary Skill binding with a declared interface version, release, digest, capabilities, output contract, and compatible optional style Skills. The runtime MUST activate exactly one primary platform Skill for each Writer turn.

#### Scenario: Resolve a normal platform turn
- **WHEN** a Writer turn continues on its active or UI-selected platform without an explicit platform switch
- **THEN** the runtime activates that platform's single registered primary Skill

#### Scenario: Registry has duplicate or missing primary bindings
- **WHEN** a listed platform has zero or more than one primary Skill
- **THEN** registry validation fails and the affected platform cannot be published

### Requirement: Khazix is the WeChat editorial authority
The WeChat Official Account platform SHALL bind `khazix-writer` as its only primary platform Skill. The runtime MUST NOT additionally activate `writer-wechat` as a competing platform or style authority for a WeChat turn.

#### Scenario: Generate a WeChat article
- **WHEN** the target platform is WeChat Official Account
- **THEN** the activated platform Skill is `khazix-writer` and its workflow owns clarification, drafting, revision, title, structure, and self-review

### Requirement: Skill-owned platform selection within the allowed registry
The application SHALL provide the current platform as a default and the registry-approved platform set without parsing platform intent from natural-language text. The Writer orchestrator SHALL change platforms only when the current user turn explicitly requests a supported target, and the result platform MUST match the primary Skill actually activated.

#### Scenario: Explicit cross-platform adaptation
- **WHEN** a user explicitly asks to adapt the active article from WeChat to Xiaohongshu
- **THEN** the orchestrator activates the registered Xiaohongshu primary Skill and the result operation is platform adaptation

#### Scenario: Platform name appears only as article content
- **WHEN** a platform name appears in source material without an explicit request to switch output platforms
- **THEN** the active platform and primary Skill remain unchanged

#### Scenario: Requested platform is unsupported
- **WHEN** the user requests a platform that is not in the allowed registry
- **THEN** the system returns a concise supported-platform clarification and does not install or activate an unknown Skill

### Requirement: Atomic platform Skill replacement
A platform primary Skill SHALL be replaceable by updating its Skill source and registry binding without changing Writer API contracts, task payload contracts, conversation/session mapping, billing, asset APIs, or the Writer UI message protocol. New requests MUST use only the current binding; the runtime MUST NOT execute old and new primary Skills in parallel.

#### Scenario: Replace a platform Skill
- **WHEN** a validated registry release changes one platform's primary Skill binding
- **THEN** subsequent turns for that platform activate only the new primary Skill while the common Writer workflow remains unchanged

#### Scenario: Continue a conversation after replacement
- **WHEN** an existing conversation continues after its platform Skill was replaced
- **THEN** the current registered Skill receives the active draft and prior Skill metadata but the old Skill is not executed

### Requirement: Optional style compatibility
An optional style Skill SHALL be activated only when the user explicitly selects it and the active platform binding declares it compatible. A style Skill MUST NOT replace or override the primary platform Skill's output and safety contract.

#### Scenario: Compatible style is selected
- **WHEN** the user selects a style Skill listed as compatible with the target platform
- **THEN** the runtime activates it in addition to the single primary Skill

#### Scenario: Incompatible style is selected
- **WHEN** the requested style Skill is not compatible with the target platform
- **THEN** the system rejects the style binding and retains the platform primary Skill without silently applying it

### Requirement: Single source and verifiable Skill release
Writer Skill source files and references SHALL have one canonical repository source. Runtime bundles and catalogs SHALL be generated from that source, and published Skill releases MUST have verified digests that match the application registry.

#### Scenario: Runtime bundle is synchronized
- **WHEN** a Skill or reference changes
- **THEN** generated runtime content and its digest change together and validation confirms registry/runtime consistency

#### Scenario: Skill bundle drifts from the registry
- **WHEN** runtime Skill content does not match the registered digest
- **THEN** validation or runtime loading fails closed instead of executing unverified instructions
