## Purpose

This document helps the executive consulting suite decide which expert lenses matter most.

It should improve judgment, not force artificial precision too early.

## Routing guardrails

These are hard boundaries:
- legal, employment, compliance, governance, and contract-sensitive issues must trigger bounded legal handling with the right review tier
- cross-domain problems must stay mixed when that changes the answer
- the user must receive one unified recommendation stream
- internal expert routing must not become visible multi-persona output

These are defaults, not rigid quotas:
- choose a lead domain when the case is mature enough
- preserve supporting domains when they materially change the recommendation
- load the minimum necessary expert perspectives

In many cases that will be 1-3 expert lenses, but the real goal is a coherent decision, not compliance with a number.

## Internal routing fields

Use these when they help:
- `primary_domain`
- `secondary_domains`
- `experts_to_load`
- `strategy_check_note`
- `key_conflict`
- `escalation_required`
- `why_this_primary_domain`
- `integrated_recommendation_basis`

Not every field needs to be surfaced to the user.

## Domain overview

### `brand`
Use when the real issue is positioning clarity, market interpretation, trust, or category understanding.

### `growth`
Use when the real issue is growth logic, channel mix, acquisition quality, or demand generation.

### `sales-strategy`
Use when the company is selling with the wrong ICP, offer, motion, or pricing logic.

### `sales-management-system`
Use when the issue is sales discipline, forecast reliability, manager inspection, pipeline hygiene, or incentive/CRM enforcement.

### `organization-hr`
Use when leadership alignment, role clarity, management quality, accountability, incentives, or people-system weakness is central.

### `operations-production-management`
Use when delivery, production, process stability, quality, capacity, handoffs, or operating rhythm is central.

### `finance-management`
Use when cash, margin, cost structure, profitability quality, budget discipline, or management reporting is constraining decisions.

### `legal-risk-screening`
Use for China-mainland contract and employment matters when legal framing, draft support, clause risk, or review-tier assignment materially changes the answer.

## Strategy override

If the visible issue may actually be upstream of the named function, keep strategy and business-model mismatch in play.

Common patterns:
- wrong customer segment
- channel mix inconsistent with buying motion
- pricing and delivery model misaligned
- growth ambition outrunning capacity or economics
- offer design creating downstream sales, operations, or margin symptoms

## Default routing patterns

### Brand vs Growth
- lead with `brand` if market understanding and trust are the bigger problem
- lead with `growth` if channel logic and demand generation are weaker

### Growth + Sales-Strategy
- lead with `growth` if upstream demand quality is weaker
- lead with `sales-strategy` if ICP, offer, or motion is more wrong than the channel logic

### Sales-Strategy + Sales-Management-System
- lead with `sales-strategy` if the company is selling the wrong way
- lead with `sales-management-system` if the motion is roughly right but execution discipline is weak

### Sales-Management-System + Organization-HR
- lean sales-management when the first fix is discipline and inspection
- lean organization-HR when the deeper issue is manager quality, role design, or accountability

### Operations + Organization-HR
- lean operations when process, capacity, handoffs, or quality are central
- lean organization-HR when management structure, authority, or accountability diffusion is central

### Operations + Finance-Management
- lean operations when operating repair changes the economics first
- lean finance when liquidity, margin protection, or financial containment must lead immediately

### Growth + Finance-Management
- lean growth when better growth logic is the first unlock
- lean finance when runway, payback, or cost discipline must dominate first

### Any business domain + Legal-Risk-Screening
- keep the business domain visible
- add legal-risk-screening when legal framing, draft risk, or review tier materially changes what can be said or produced

## Forced integrated scenarios

These scenarios should usually trigger integrated multi-expert handling:

### Employee misconduct or disciplinary action
Default lenses:
- `organization-hr`
- `legal-risk-screening`
- `finance-management` when pay, settlement, or compensation handling matters

Default legal posture:
- bounded legal suggestion is allowed
- high-risk or irreversible action usually requires `mandatory_lawyer_review`

### Employment adjustment or exit handling
Default lenses:
- `organization-hr`
- `legal-risk-screening`
- `finance-management` if severance, incentive settlement, or payroll impact is material

Default legal posture:
- keep the business and people context visible
- legal review tier should usually be at least `recommended_legal_review`, often `mandatory_lawyer_review` when facts are disputed or action is irreversible

### Sales promise vs contract obligation conflict
Default lenses:
- `sales-strategy` or `sales-management-system`
- `legal-risk-screening`
- `finance-management` when collections, credits, penalties, or margin exposure matter

Default legal posture:
- legal may stay supporting if the core problem is still commercial discipline
- review tier rises quickly if signed-language interpretation or non-standard liability becomes central

### Delivery failure causing compensation, collections, or margin risk
Default lenses:
- `operations-production-management`
- `finance-management`
- `legal-risk-screening` if liability or contractual remedy risk appears

### High growth colliding with cash, capacity, or management capability
Default lenses:
- whichever of `growth`, `operations-production-management`, or `finance-management` is the first binding constraint
- plus whichever supporting lenses materially change the recommendation

These cases must still end in one integrated recommendation stream.

### Contract review or draft request
Default lenses:
- `legal-risk-screening`
- plus the business domain that defines the actual scenario

Default legal posture:
- low-risk standardized drafts may remain legal-led with `internal_confirmation`
- non-standard, disputed, or high-exposure drafts must move to higher review tiers

Default internal contract-review pattern:
- classify the document type first
- decide whether this is better handled as comment-first review or immediate draft/redraft
- prioritize the clause families that matter for that type
- check both risky language and missing protections
- extract obligations, deadlines, payment triggers, delivery triggers, and notice duties when they materially affect execution
- provide negotiation direction or fallback positions when the user needs to push back on terms
- keep missing key facts as placeholders when drafting would otherwise fake completeness

## Deliverable dependency routing

When the user asks for a named business artifact, do not route only by the deliverable label. Route by the missing foundations that determine whether the artifact is actually usable.

### Sales plan
Usually depends on:
- `sales-strategy` for ICP, offer, motion, and target logic
- `sales-management-system` for stage definitions, forecast discipline, target decomposition, and manager rhythm

If these foundations are weak:
- route first to the missing sales foundations
- then produce the plan, or a clearly provisional skeleton if the user needs momentum now

### Growth plan
Usually depends on:
- `growth` for channel and demand logic
- `brand` when positioning clarity materially affects channel performance
- `finance-management` when payback logic or budget discipline materially constrains the plan

### Performance scheme
Usually depends on:
- `organization-hr` for role clarity, management layers, and accountability
- `finance-management` when payout logic or incentive affordability materially changes design

### Management policy
Usually depends on:
- `organization-hr` for authority, ownership, and execution subject
- `operations-production-management` when the policy is really an operating-rhythm or process-control problem

### Collections or receivables governance plan
Usually depends on:
- `finance-management`
- `sales-strategy` or `sales-management-system`
- `legal-risk-screening` when contract remedies or liability risk materially shape the answer

### Employment handling plan
Usually depends on:
- `organization-hr`
- `legal-risk-screening`
- `finance-management` when payroll, bonus, or settlement treatment matters

### Budget plan
Usually depends on:
- `finance-management`
- supporting commercial or operating domains if revenue logic, delivery capacity, or cost ownership are still unstable

### Contract draft
Usually depends on:
- `legal-risk-screening`
- whichever business domain defines the actual scenario being contracted

Contract-specific routing note:
- if the request is a standard draft inside supported scope and the company has usable template language, legal may lead
- if liability allocation, disputed facts, or irreversible consequences are material, legal remains active but review tier must rise

Routing rule:
- artifact requests cannot bypass diagnosis
- if the missing prerequisite is more important than the requested artifact itself, route first to the prerequisite domains
- still keep one integrated recommendation stream for the user
- keep the review tier visible internally even when the user only sees one answer

## When not to force routing

Do not force a fake lead domain when:
- the case is still too early
- the business question is still underspecified
- one high-value answer could reverse the routing

In those cases:
- keep the likely competing domains visible internally
- ask the next best question
- or give a clearly provisional judgment

## Conflict framing

Whenever more than one domain matters, surface the main tension in plain language.

Good examples:
- “问题表面上像增长变慢，但当前更关键的约束是销售管理纪律不足。”
- “公司想继续扩张，但交付体系和毛利质量都支撑不了当前节奏。”
- “销售结果不好，但更深层的问题可能是组织授权和管理者能力。”

Bad behavior:
- pretending the secondary domain does not matter
- labeling everything as equally primary
- giving separate mini-solutions per expert

## User-facing rule

If multiple lenses informed the answer, the user-facing response may include one short integration line, such as:
- “这个建议已综合考虑人事管理、法务风险和薪酬处理影响。”
- “这个方案已综合考虑销售承诺、合同义务和回款风险。”

Do not present the answer as several experts speaking in sequence.

## Pass criteria

This document is successful if it causes the skill to:
- find the lead business constraint when one is clear
- preserve mixed cases when they matter
- trigger legal-risk handling when needed
- integrate multiple lenses into one recommendation stream
- avoid fake precision when the case is still immature
