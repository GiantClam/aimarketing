## ADDED Requirements

### Requirement: Windows v1 SHALL provide a local read-only Agent Center

Windows Desktop v1 SHALL register `/dashboard/agent-platform` and present the same grouping, search, filters and card interaction as the current online Agent Center, using the canonical installed Agent/Skill catalog.

This requirement supersedes the earlier Windows v1 page-level exclusion of Agent Platform. It does not supersede the exclusion of agent publishing, marketplace, enterprise administration, billing or cloud account binding.

#### Scenario: A configured local agent is selected

- **WHEN** the user selects an available agent
- **THEN** the primary action SHALL start a local conversation carrying the selected agent/skill identity
- **AND** execution SHALL remain behind the local WorkbenchClient/OpenCode adapter

#### Scenario: A local agent lacks configuration

- **WHEN** its required model, provider or installed dependency is unavailable
- **THEN** the card SHALL remain discoverable when the capability is supported on Windows v1
- **AND** the primary action SHALL be disabled or redirected to configuration with a concrete reason

#### Scenario: A SaaS-only agent action exists online

- **WHEN** the directory is rendered in Desktop
- **THEN** publish, marketplace, enterprise and cloud-binding actions SHALL be absent
