## Purpose

This document controls how the executive consulting suite presents its outputs.

The default experience must stay lightweight, decision-oriented, and useful to a business leader. The skill should solve for clarity first and only escalate into a reusable artifact when that is actually helpful.

## Supported output modes

Exactly three output modes are supported:
1. **Conversational Executive Summary**
2. **Structured Action Plan**
3. **Optional Export**

## Output mode selection

Use this order:
1. If the user needs fast orientation, use **Conversational Executive Summary**.
2. If the user needs clear next moves, add **Structured Action Plan**.
3. If the user explicitly needs a reusable artifact, first judge deliverable readiness, then use **Optional Export**.

Modes 1 and 2 are often combined. Mode 3 is optional and should happen only when the artifact is ready enough to be useful or when a clearly labeled provisional version is the best next move.

## Mode 1 — Conversational Executive Summary

Must contain:
- what appears to be happening
- what likely matters most
- what is still uncertain
- the main tradeoff or risk

Quality rule:
- keep it short
- keep it readable
- keep it like one advisor speaking to a leader, not like a report

## Mode 2 — Structured Action Plan

Must contain:
- ranked issue framing
- a small number of prioritized actions, scaled to the case
- why each action matters now
- the main dependency, uncertainty, or risk

Quality rule:
- the action plan should feel like a decision memo, not a consulting deck

## Mode 3 — Optional Export

Use only when:
- the user explicitly asks for a memo, brief, tracker, or table
- the requested artifact is ready enough to produce responsibly, or a provisional version is the clearest next step
- unresolved data gaps remain visible enough that the artifact will not mislead

Do not use when:
- the user is still exploring what the problem is
- routing is still unstable
- legal or governance escalation is unresolved
- the requested artifact depends on missing foundations that have not been acknowledged

Optional Export contains two internal tracks:
- **Advisory Export**
- **Artifact Generation**

The user does not need to see these labels unless it helps.

## Advisory Export

Use when the user wants a reusable summary of the diagnosis or recommendation set.

Typical outputs:
- executive memo
- decision brief
- advisory note
- issue diagnosis brief

## Artifact Generation

Use when the user wants a reusable business artifact rather than just a recommendation summary.

Supported artifact types:
- `advisory-doc`
- `legal-advice-note`
- `contract-review-note`
- `policy-doc`
- `contract-draft`
- `operating-sheet`

### `advisory-doc`
Use for:
- owner memo
- diagnosis brief
- organization optimization note

Default format:
- Word / `.docx`

### `legal-advice-note`
Use for:
- bounded legal risk notes
- clause-risk summaries
- internal legal suggestion memos
- employment-handling guidance notes

Default format:
- Word / `.docx`

Mandatory boundaries:
- keep jurisdiction scope explicit when relevant
- keep uncertainty visible
- do not imply final legal opinion status
- preserve the correct review tier
- separate reviewed risky language from missing protections when both matter

### `contract-review-note`
Use for:
- review comments on an existing draft
- clause-risk annotation summaries
- red-flag memos before redrafting

Default format:
- Word / `.docx`

Mandatory boundaries:
- make clear that this is a review or annotation output, not a finalized rewritten contract
- preserve the correct review tier
- separate party, baseline text, commercial, and legal findings when that improves clarity

### `policy-doc`
Use for:
- management systems
- sales management policy
- performance management policy
- process or operating standards

Default format:
- Word / `.docx`

### `contract-draft`
Use for:
- labor contract drafts
- framework agreement drafts
- service contract drafts
- NDA / confidentiality drafts
- addendum drafts
- notice drafts

Default format:
- Word / `.docx`

Mandatory boundaries:
- label as draft
- keep the correct review tier visible
- never imply the draft is final or ready to sign
- separate reused company language from new clause suggestions when template reuse exists

Review tier model:
- `internal_confirmation`: acceptable for standardized, low-risk drafts inside supported scope
- `recommended_legal_review`: use when there is moderate risk, non-standard language, or incomplete facts
- `mandatory_lawyer_review`: use when the draft is high-risk, non-standard, disputed, or tied to irreversible action

### `operating-sheet`
Use for:
- performance sheets
- action trackers
- KPI dashboards
- issue-priority matrices

Default format:
- Excel / `.xlsx`

## Requested Deliverable

Use this internal structure when the user asks for a named business output.

Required fields:
- `deliverable_name`
- `deliverable_type`
- `user_stated_goal`
- `implied_business_outcome`
- `time_horizon`
- `requested_format`

Purpose:
- define what the user thinks they need
- separate the artifact from the business problem it is meant to solve

## Deliverable Readiness

Use this internal structure before artifact generation when the output depends on upstream operating foundations.

Required fields:
- `readiness_state`
- `missing_prerequisites`
- `critical_dependencies`
- `can_produce_provisional_version`
- `must_reframe_before_final_artifact`
- `knowledge_base_support`
- `highest_risk_if_produced_now`

Allowed `readiness_state` values:
- `ready`
- `partially_ready`
- `not_ready`
- `blocked_by_risk`

Interpretation:
- `ready`: formal artifact path is appropriate
- `partially_ready`: artifact can proceed, but should usually preserve staged guidance or a provisional label
- `not_ready`: fix minimum prerequisites first, optionally give a skeleton or temporary version
- `blocked_by_risk`: do not generate the final artifact until the risk boundary is resolved

## Staged Deliverable Plan

Use when the best answer is a build order rather than a single immediate document.

Required fields:
- `current_stage`
- `stage_goal`
- `why_not_final_yet`
- `what_to_build_first`
- `provisional_output_if_any`
- `final_deliverable_path`

Purpose:
- turn a premature deliverable request into a practical sequence
- allow the skill to keep momentum without pretending the final artifact is already grounded

## Handoff path

The executive consulting skill should not implement document mechanics itself.

Use these downstream skills for document production:
- `/Users/YangMac/.codex/skills/doc/SKILL.md`
- `/Users/YangMac/.codex/skills/spreadsheet/SKILL.md`

The executive skill is responsible for business framing and handoff completeness, not for low-level file formatting.

If enterprise knowledge already contains existing policies, process documents, sales rules, KPI sheets, or contract templates, reuse that context in the handoff instead of generating from a blank slate.

For legal outputs, enterprise knowledge may also include:
- standard contract templates
- prior negotiated clauses
- labor-contract supplements
- employee handbook rules
- signing or approval rules

## Word vs Excel

### Use Word when
- the user needs an executive memo
- the user needs a leadership brief
- the output is primarily narrative reasoning and recommendation framing

Typical Word deliverables:
- executive memo
- decision brief
- short advisory note

### Use Excel when
- the user needs a tracker
- the user needs a KPI watchlist
- the user needs an issue-priority matrix
- the output is primarily operational structure

Typical Excel deliverables:
- action tracker
- KPI watchlist
- issue-priority matrix
- dependency table
- performance management sheet

Excel discipline rule:
- do not build a complex financial model by default

## Artifact Handoff contract

If export mode is used, carry forward:
- **Intake Snapshot**
- **Integrated Analysis Brief**
- requested objective
- preferred output form
- unresolved data gaps
- risk boundaries that affect reuse

Required fields:
- `artifact_type`
- `business_purpose`
- `source_brief`
- `readiness_basis`
- `provisional_or_final`
- `required_sections_or_columns`
- `risk_flags`
- `review_tier`
- `kb_backed_context`
- `unresolved_data_gaps`

Legal-artifact recommended add-ons when relevant:
- `contract_type`
- `review_mode`
- `four_layer_review_summary`
- `clause_review_summary`
- `missing_protections`
- `key_obligations_or_deadlines`
- `negotiation_suggestions`
- `source_support_note`
- `placeholder_fields`

Suggested template:

```md
## Artifact Handoff

### Artifact type
- advisory-doc / legal-advice-note / contract-review-note / policy-doc / contract-draft / operating-sheet

### Business purpose
- ...

### Source brief
- ...

### Readiness basis
- why this artifact is ready, partially ready, or still provisional

### Provisional or final
- provisional / final

### Required sections or columns
- ...

### Risk flags
- ...

### Review tier
- internal_confirmation / recommended_legal_review / mandatory_lawyer_review

### Contract type
- if legal artifact, identify the document family and why that classification was used

### Review mode
- comment_first / comment_plus_redraft / draft

### Four-layer review summary
- party verification
- baseline text
- commercial terms
- legal terms

### Clause review summary
- what the highest-risk clauses mean
- why they matter
- what direction the wording should move

### Missing protections
- what important protections are absent
- which missing protections should be added first

### Key obligations or deadlines
- what duties, triggers, dates, notices, payments, or return obligations must be managed

### Negotiation suggestions
- preferred position
- fallback position if needed

### Source support note
- whether the result relies mainly on company template reuse, official-source verification, or a bounded low-risk draft assumption

### Placeholder fields
- any key facts, business inputs, dates, counterparties, payment terms, or clause inputs that are still intentionally left as placeholders rather than guessed

### KB-backed context
- what existing company material was used
- what is preserved from current company materials
- what is newly recommended in this consultation

### Unresolved data gaps
- ...
```

Contract-specific rule:
- `contract-draft` must always set an explicit `review_tier`
- `risk_flags` must mention the review tier before use
- if enterprise knowledge contains prior contract language or versions, `kb_backed_context` must distinguish reused clauses from new draft suggestions
- when the draft or note is clause-heavy, include contract type, missing protections, and key obligations or deadlines if they materially affect use
- if a key commercial or factual input is missing, keep it as a visible placeholder rather than silently inventing it

Legal-note rule:
- `legal-advice-note` must stay inside supported jurisdiction and scope
- it must not read like a final legal opinion
- when authority matters, source support must be visible in the note or clearly reflected in risk language
- when clause review is central, the note should explain what the clause means, why it is risky, and what revision direction is preferred

Contract-review-note rule:
- prefer this mode when the user is reviewing an existing draft and does not need a full rewrite yet
- if useful, organize findings into party verification, baseline text, commercial terms, and legal terms
- distinguish comment-only guidance from clauses that truly require immediate redraft

Readiness rule:
- if the company is not ready for a formal final artifact, the handoff must say so explicitly and label the output as `provisional`
- do not smuggle a provisional artifact into a final-looking deliverable

## Output boundaries

Allowed by default:
- concise summary
- prioritized action plan
- lightweight memo or tracker when asked

Not allowed by default:
- PPT deliverables
- long formal consulting reports
- giant appendices
- multi-section deck-style packages
- final legal-ready contracts

## Output anti-patterns

Do not:
- generate long polished prose when the user needs prioritization
- export a document just because export is technically possible
- create Excel when a simple action list would be better
- create Word when the user really needs a tracker
- let formal structure overshadow the actual decision problem
- hide uncertainty behind formatting
- output a contract draft without explicit legal-review language
- output a legal note that reads like a formal external legal opinion
- default into artifact generation when the user has not asked for a reusable file
- ignore relevant enterprise knowledge and generate from a blank slate when usable company material already exists
- generate a polished final artifact when missing foundations materially undermine execution quality

## Pass criteria

This document is successful if it causes the skill to:
- keep summaries lightweight
- keep action plans prioritized
- use Word and Excel intentionally rather than automatically
- carry forward Intake Snapshot + Integrated Analysis Brief into deeper outputs
- judge deliverable readiness before artifact generation
- treat artifact generation as an optional downstream handoff
- reuse relevant enterprise knowledge in artifact handoffs when it exists
- keep contract outputs at draft level with tiered review flags
- support bounded legal-advice notes without implying substitute-counsel status
- avoid becoming a report factory
