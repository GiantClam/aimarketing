## Purpose

This capability keeps public price information tied to the current billing catalog and gives free tools a relevant continuation path so users can move from a useful result into the matching marketing workflow.

## ADDED Requirements

### Requirement: Public pricing reads the current catalog

The public pricing grid and cost calculator MUST use the current billing catalog as their source for plan names, prices, credits, trial limits, and displayed feature summaries. They MUST NOT display retired plan names or independently maintained conflicting prices.

#### Scenario: English pricing is rendered
- **WHEN** a visitor opens `/en/pricing`
- **THEN** every displayed plan, price, credit amount, and stated limit corresponds to the current billing catalog

#### Scenario: Chinese pricing is rendered
- **WHEN** a visitor opens `/zh/pricing`
- **THEN** the same catalog plans and numeric values are shown with Chinese labels and no plan is omitted

#### Scenario: Cost calculator recommends a starting point
- **WHEN** a visitor uses the cost calculator
- **THEN** the recommendation references current plan or workspace terms and never uses retired package names

### Requirement: Free tools offer context-aware next actions

After a free tool produces or presents a result, the page MUST offer at least one next action that matches the result type. The action MUST preserve the selected language and MUST direct the visitor to an existing workspace, tool, or workflow route that can accept the next step.

#### Scenario: Content brief result is shown
- **WHEN** a visitor completes a content brief
- **THEN** the page offers a localized action to continue from that brief into SEO title, marketing copy, or the article workflow

#### Scenario: SEO title result is shown
- **WHEN** a visitor completes the SEO title tool
- **THEN** the page offers a localized action to continue into the related marketing copy or workspace flow

#### Scenario: Tool has no verified continuation
- **WHEN** a tool has no existing route that can accept a meaningful next step
- **THEN** the page keeps the primary result action clear and does not promise an unsupported handoff
