## Purpose

This document defines how the executive consulting suite should use enterprise context.

The goal is not to build a complete company database. The goal is to help the model use existing company knowledge well, avoid repetitive questions, and stay honest about gaps.

## Core principle

Treat enterprise knowledge as useful but fallible.

Good behavior means:
- check for enterprise knowledge before asking broad intake questions
- use current user clarification over older company memory
- keep freshness, coverage, and conflicts visible internally
- use only the amount of structure needed for the case

## Enterprise knowledge sources

Default enterprise knowledge sources:
- Dify-backed normalized enterprise retrieval supplied by the hosting platform or backend adapter
- preloaded enterprise knowledge base
- explicitly attached company files or materials in the current task

Do not assume live ERP, CRM, HRIS, production telemetry, or finance-model access unless that access is explicitly provided in the current task.

## Knowledge Base State

Use this as an internal summary when enterprise knowledge exists or when its absence matters.

Internal fields:
- `kb_available`
- `kb_sources_used`
- `kb_source_provider`
- `kb_binding_status`
- `kb_coverage`
- `kb_freshness_state`
- `kb_conflicts`
- `kb_missing_critical_fields`
- `kb_retrieval_summary`
- `kb_retrieval_mode_used`

Field value guidance:
- `kb_available`: `yes` or `no`
- `kb_source_provider`: `dify`, `attached_files`, `preloaded_kb`, or `mixed`
- `kb_binding_status`: `bound`, `unbound`, or `error`
- `kb_coverage`: `not_found`, `partial`, or `sufficient`
- `kb_freshness_state`: `current`, `stale`, or `unknown`
- `kb_conflicts`: `none` or a short description of the material conflict(s)
- `kb_retrieval_mode_used`: `profile_bootstrap`, `question_targeted`, `artifact_context`, or `mixed`

Use it to answer:
- what company memory is already available
- how much of it is trustworthy enough to use
- what still needs clarification
- whether enterprise knowledge came from Dify, attached files, preloaded knowledge, or a mix
- whether a Dify binding existed but failed or returned insufficient results

This structure is internal by default. It only needs to be surfaced when:
- the user asks what the diagnosis is based on
- enterprise knowledge is insufficient and drives follow-up questions
- enterprise knowledge conflicts with the user's current clarification

## High-value company context fields

When available, these fields materially improve diagnosis quality.

### Core context
- `company_name`
- `industry`
- `business_model`
- `revenue_stage`
- `headcount_band`
- `core_products`
- `top_goals`
- `known_constraints`

### Commercial context
- `customer_segments`
- `channel_mix`
- `sales_model`
- `pricing_model`
- `brand_context`

### Delivery and operating context
- `delivery_model`
- `operations_constraints`
- `service_or_fulfillment_complexity`

### Management-system context
- `org_notes`
- `management_system_maturity`
- `founder_dependency`
- `decision_rights_notes`
- `existing_policies_or_playbooks`
- `existing_templates_or_forms`
- `existing_plans_or_review_cycles`

### Legal context
- `contract_templates`
- `preferred_clause_positions`
- `employment_policies_or_handbook`
- `signing_or_approval_rules`
- `prior_legal_review_notes`

### Financial context
- `financial_signals`
- `unit_economics_signals`

### Change context
- `recent_changes`
- `recent_shocks`

## Intake Snapshot

Use an Intake Snapshot when the case needs a cleaner business fact base.

Typical sections:
- confirmed facts
- uncertain facts
- missing facts
- user-corrected facts
- high-risk unknowns

Keep it short, operational, and decision-relevant.

If enterprise knowledge exists, the snapshot should reflect:
- what came from company materials
- what the user corrected
- what remains missing despite retrieval
- whether the retrieval came from Dify profile bootstrap, targeted retrieval, artifact-context retrieval, or a mix

## Knowledge support for deliverable readiness

When the user asks for a concrete artifact, enterprise knowledge should also be used to judge whether the company is ready for that artifact.

Look for signals such as:
- existing policies, SOPs, or workflow rules
- prior plan templates, budget cycles, or review documents
- role definitions, approval rules, and ownership boundaries
- current contract language or form templates
- KPI sheets, scorecards, or operating trackers already in use
- employee handbook rules or discipline policies
- prior negotiated clauses or legal-review comments

Use enterprise knowledge to answer:
- is there already a usable baseline to improve from
- is the company partially ready, or still missing core foundations
- which follow-up question would most change whether a provisional or final artifact is appropriate

If enterprise knowledge shows that a baseline already exists, prefer improving or restructuring it.

If enterprise knowledge shows that the baseline is missing, weak, or outdated, avoid broad intake and ask only about the specific missing prerequisites that decide readiness.

## Freshness and conflict handling

### Missing data

If important fields are missing:
- record the gap internally
- decide whether it materially changes diagnosis, routing, or prioritization
- ask only the next best question if the answer would matter

If enterprise knowledge already covers the basics, do not ask the user to restate baseline company facts.

### Stale data

If information may be outdated:
- downgrade it internally from firm fact to uncertainty
- avoid building high-confidence recommendations on it
- only ask freshness-confirming questions when the answer changes the decision

### Contradictory data

If older company materials conflict with the current conversation:
- record the contradiction internally
- prefer the user's current clarification by default
- carry unresolved contradiction forward as uncertainty rather than silently choosing a side

## Source precedence

Use this order:
1. current user clarification in this conversation
2. explicit current files, structured inputs, or attached company materials in the current task
3. Dify-backed normalized retrieval result
4. preloaded enterprise knowledge base
5. cautious inference

If Dify-backed retrieval is available, use `profile_bootstrap` first before broad intake.

If the user then asks for a concrete plan, policy, or contract artifact, use `artifact_context` retrieval before deciding readiness.

## Follow-up question policy

Ask follow-up questions only when they materially improve the judgment.

Good reasons to ask:
- the main problem cannot yet be framed responsibly
- routing would likely change
- prioritization would likely change
- legal or governance boundaries depend on the answer
- enterprise knowledge is missing, stale, or conflicting on a key field

Prefer narrow questions such as:
- “更像是需求不足，还是转化不足？”
- “现金压力在最近 3-6 个月是否明显恶化？”
- “你们现在更像销售打法有问题，还是销售管理制度跟不上？”
- “交付问题主要出在产能、流程、质量，还是跨部门协同？”

Avoid broad prompts such as:
- “多介绍一下公司”
- “把所有情况都讲一下”

Knowledge-aware phrasing can be:
- “我先按现有公司资料和你刚才的信息判断，下面只补两个会影响结论的问题。”
- “现有资料里销售流程有定义，但我还缺一个会影响判断的信息：现在主要问题更像机会阶段失真，还是报价承诺失真？”

## Prohibited assumptions

Do not assume:
- complete company understanding just because retrieval returned some material
- exact metrics when the user only gave qualitative descriptions
- live system access that was not explicitly provided

## Pass criteria

This document is successful if it causes the skill to:
- use enterprise knowledge before repeating intake questions
- stay honest about coverage, freshness, and conflict
- let the user correct company memory
- ask better, narrower follow-up questions
- improve diagnosis quality without forcing ritual
