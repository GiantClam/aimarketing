## Purpose

This capability makes bilingual marketing pages explain verified user outcomes and buying boundaries clearly, using the same product story across the homepage, workflow directory, team use case, and comparison pages.

## ADDED Requirements

### Requirement: Homepage leads with the marketing brief outcome

The English and Chinese homepages MUST lead with the outcome of taking one marketing brief through research, copy, image, video, and review work in one workspace. The homepage MUST use a free-start primary call to action and a full-workflow secondary call to action, and MUST avoid claims that are not supported by the current product.

#### Scenario: English homepage is rendered
- **WHEN** a visitor opens `/en/`
- **THEN** the first content block presents the marketing workspace benefit, uses the title `AI Workspace for Marketing Teams | AIMarketingSite` in metadata, and offers `Start Free` plus a link to the full workflow

#### Scenario: Chinese homepage is rendered
- **WHEN** a visitor opens `/zh/`
- **THEN** the first content block presents the equivalent marketing workspace benefit in Chinese, uses one consistent brand suffix, and offers `免费开始` plus a link to the complete workflow

### Requirement: Public copy uses customer language

Indexable public pages MUST NOT expose internal implementation terms such as `existing_runtime`, `entitlement`, raw runtime identifiers, or raw access-state keys. Public status and access messages MUST be phrased as user-facing availability, login, permission, or planning information.

#### Scenario: Public platform directory is rendered
- **WHEN** a visitor opens a public capability, plugin, MCP, agent, or workflow directory
- **THEN** the page contains user-facing status language and does not display internal enum names or administration terminology

#### Scenario: Homepage client data is serialized
- **WHEN** either localized homepage serializes its client props into HTML or an RSC payload
- **THEN** capability cards contain only public display fields and entry links, with no registry configuration, provider notes, internal enums, or unused implementation descriptions

### Requirement: Workflow pages explain input, output, and next action

Public workflow pages MUST explain what input a visitor supplies, what result the workflow produces, and what the visitor can do next. If a workflow exposes a preview before persistence, the page MUST distinguish preview from saved output and MUST identify the action that saves or continues the result.

#### Scenario: Workflow detail page is rendered
- **WHEN** a visitor opens a localized workflow detail page
- **THEN** the page presents an input, output, and next-step explanation and labels preview and saved output separately when both exist

### Requirement: Marketing-team page uses one concrete brief scenario

The marketing-team use-case page MUST follow one representative brief through research, copy, visual creation, and team review. It MUST include verifiable product screenshots or outputs from the repository's current product evidence, describe the inputs and resulting assets, and link to the next workspace action.

#### Scenario: Marketing-team page is rendered in English and Chinese
- **WHEN** a visitor opens either localized marketing-team use-case page
- **THEN** the page presents the same scenario in the selected language, includes evidence with meaningful alternative text, and provides a localized next action into the workspace or an available tool

### Requirement: ChatGPT Team comparison is factual and bounded

The ChatGPT Team alternative page MUST compare ChatGPT Team and the marketing workspace across intended audience, model coverage, marketing workflow fit, price, and quota or usage model. It MUST state cases where ChatGPT Team is the better fit, identify the source-check date for volatile competitor facts, and avoid claims that cannot be verified from the page's evidence.

#### Scenario: Comparison page is rendered
- **WHEN** a visitor opens either localized ChatGPT Team alternative page
- **THEN** the page shows a dated factual comparison, explains who each option fits, and includes a workflow-specific next action
