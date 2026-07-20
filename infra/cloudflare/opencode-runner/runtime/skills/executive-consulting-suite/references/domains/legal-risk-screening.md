## Role

This domain provides bounded China-mainland legal advisory for contract and employment matters inside executive diagnosis.

It is not a replacement for external counsel. Its job is to help the user:
- identify legal exposure
- get a useful legal suggestion
- draft common agreements or addenda
- understand the right review tier before action

## Supported first-release scope

Supported by default:
- framework agreements
- service contracts
- NDAs / confidentiality agreements
- contract addenda
- labor-contract-related supplements
- employee discipline and employment handling risk
- clause-level risk spotting and redrafting suggestions

Default contract-type families to recognize first:
- NDA / confidentiality
- framework agreement
- service contract
- labor-contract supplement or employment addendum
- notice or disciplinary document

Not default scope:
- equity structure
- financing docs
- cross-border compliance
- tax
- litigation strategy
- major industry-specific regulatory schemes

## Trigger signals

Use this domain when the case includes:
- contract drafting, review, clause changes, or negotiation risk
- labor or employment handling with document, process, or discipline sensitivity
- business decisions whose risk turns on contract terms, labor rules, or signing authority
- user requests for agreement drafts, addenda, NDA text, or labor-related draft language
- a contract needs to be classified before the right clause families can be reviewed
- the user wants review comments, a clause-risk note, or a structured pass over an existing draft

## Legal Matter Profile

Use internally when the legal matter is substantial enough to benefit from structure.

Internal fields:
- `matter_type`
- `jurisdiction`
- `business_context`
- `irreversible_action`
- `documents_available`
- `disputed_facts`
- `contract_family_guess`

Purpose:
- frame the actual legal scenario
- keep the supported jurisdiction explicit
- prevent clause drafting from getting detached from the business facts
- prevent a service agreement, NDA, labor supplement, and disciplinary notice from being reviewed with one generic lens

## Legal Source Packet

Use internally when source support matters.

Internal fields:
- `statutes_used`
- `interpretations_used`
- `cases_or_authoritative_examples`
- `enterprise_templates_used`
- `source_freshness_note`
- `verification_gaps`

Purpose:
- keep legal suggestions tied to traceable inputs
- distinguish enterprise template reuse from legal authority
- prevent bare-model legal recall from being mistaken for verified support
- keep unverified legal assumptions visible

## Legal Advice State

Use internally before final legal-facing output.

Internal fields:
- `risk_level`
- `confidence_state`
- `advice_scope`
- `review_threshold`
- `why_review_required`

Suggested `risk_level` values:
- `low_risk_standardized`
- `medium_risk`
- `high_risk_or_irreversible`

Purpose:
- determine how far the skill may go
- set the correct review tier
- keep uncertainty visible

## Contract Draft Packet

Use internally when drafting or revising a contract-like artifact.

Internal fields:
- `contract_type`
- `governing_scenario`
- `required_clauses`
- `missing_clause_inputs`
- `reusable_company_terms`
- `draft_status`
- `review_focus_areas`

Purpose:
- ensure the draft matches the actual business scenario
- highlight missing business inputs before false completeness appears
- separate reused company terms from newly suggested language
- keep the draft centered on the clause families that matter most for that document type

## Contract Type Classifier

Use internally before drafting or clause review when the document type is material.

Internal fields:
- `contract_type`
- `confidence_state`
- `classification_basis`
- `business_side`
- `counterparty_type`

Purpose:
- classify whether the matter is closer to NDA, framework, service, labor supplement, notice, or another supported type
- determine which clause families and review posture should be checked first

## Four-Layer Contract Review

Use internally for existing-draft review or clause-risk analysis.

Internal fields:
- `party_verification_findings`
- `baseline_text_findings`
- `commercial_term_findings`
- `legal_term_findings`
- `which_layers_are_material`

Default review order:
1. party verification
2. baseline text sanity
3. commercial terms
4. legal terms

Why this matters:
- many business-critical contract problems are commercial or identity problems before they are “pure legal” problems
- this reduces the risk of missing payment, acceptance, schedule, or scope flaws while staring only at boilerplate

## Clause Review Packet

Use internally when clause-level help is needed.

Internal fields:
- `clause_or_issue`
- `plain_meaning`
- `risk_why`
- `business_impact`
- `suggested_revision_direction`
- `review_tier_impact`

Purpose:
- explain the clause in business language
- state why it is risky
- show how the language should move rather than stopping at a warning

## Review Annotation Packet

Use internally when comment-first review is better than immediate redrafting.

Internal fields:
- `review_mode`
- `issue_location_or_clause`
- `issue_summary`
- `why_it_matters`
- `recommended_comment`
- `redraft_needed_now`

Review modes:
- `comment_first`
- `comment_plus_redraft`

Purpose:
- allow the skill to produce review-ready comments or issue notes without pretending the whole document has already been rewritten

## Missing Protections Packet

Use internally when the contract is risky because important protections are absent.

Internal fields:
- `missing_protections`
- `why_missing_matters`
- `priority_to_add`
- `template_support_available`

Typical missing protections to check:
- confidentiality scope and exceptions
- limitation of liability
- payment timing and acceptance criteria
- termination triggers and post-termination handling
- return or destruction of materials
- IP ownership or usage scope
- handbook or disciplinary basis in employment handling

## Contract Clause Map

Use internally to adapt review emphasis by document type.

Internal fields:
- `contract_type`
- `expected_clause_families`
- `high_priority_clause_families`
- `scenario_specific_adjustments`

Typical emphasis by type:
- NDA: scope, exceptions, use restriction, return/destruction, residual knowledge if present, term
- service contract: scope, delivery, acceptance, payment timing, service levels, liability, IP, termination
- framework agreement: order mechanics, precedence, pricing change, liability allocation, exit, dispute structure
- labor supplement: role change, compensation, reporting line, confidentiality, effective date, handbook linkage

## Obligation and Deadline Packet

Use internally when the document or legal path creates execution duties or timing pressure.

Internal fields:
- `key_obligations`
- `trigger_dates_or_deadlines`
- `what_happens_if_missed`
- `owner_if_known`

Purpose:
- surface the obligations and deadlines the business side must actually manage
- connect legal wording to execution risk

## Negotiation Suggestion Packet

Use internally when the answer should include pushback or fallback positions.

Internal fields:
- `high_risk_term`
- `preferred_position`
- `acceptable_fallback`
- `tradeoff_note`
- `when_to_escalate`

Purpose:
- turn clause review into negotiation-ready advice
- make it easier to say what to change, what to trade, and when not to concede

## Key diagnostic questions

- What contract or employment-document family is this closest to?
- Is comment-first review better than immediate redrafting?
- What is the actual business scenario the agreement or legal action is supposed to govern?
- Which documents, templates, handbook sections, or prior clauses already exist?
- Is the matter inside China-mainland contract or employment scope?
- What facts are still disputed, missing, or time-sensitive?
- Is the contemplated action reversible?
- Which review tier is appropriate before use or execution?
- Which clause families matter most for this document type?
- What protective language is missing, not just what language looks dangerous?
- Which obligations, deadlines, payment triggers, delivery triggers, or notice duties need to be pulled out for execution?
- If a clause is risky, what is the preferred revision or fallback position?
- Are there missing factual inputs that should stay as placeholders rather than being guessed?

## Common root causes

- unsupported or inconsistent contract drafting baseline
- weak clause discipline
- wrong contract type assumptions
- missing protective clauses mistaken for “template simplicity”
- party or signing-authority mismatch
- commercial-term defects disguised as legal review issues
- missing approval authority
- weak employment-policy grounding
- incomplete fact pattern
- non-standard risk allocation hidden inside a “routine” request

## Evidence discipline

Distinguish:
- **observed**: documents, clauses, incident facts, dates, decision chain, current templates
- **inferred**: likely legal risk, review tier, likely weak clause area
- **hypothesis**: likely enforceability or dispute exposure that still needs verification
- **needs data**: missing business scenario, missing template, missing timeline, missing governing facts, source gap

## Recommended action types

- make the legal risk and review tier explicit
- gather the governing documents and factual timeline
- reuse company-approved templates where possible
- suggest clause changes or draft language inside supported scope
- identify the contract type first and tailor review focus accordingly
- use four-layer review so party, commercial, and legal issues are not mixed together
- extract missing protections, key obligations, and deadlines when that will change execution quality
- suggest negotiation positions or fallback wording when the user needs to push back, not only “be careful”
- preserve placeholders like `[TO BE CONFIRMED]` or `[____]` for key missing facts instead of inventing them in drafts
- pause or narrow high-risk irreversible action until the right review occurs
- preserve the linked business context rather than answering as abstract law alone

## KPI suggestions

Useful tracking items may include:
- risk tier
- unresolved fact count
- template reuse rate
- source-verification status
- review routing status
- missing-protection count
- obligation/deadline extraction completeness
- placeholder completeness for missing key inputs

## Boundaries with other domains

- Keep the business domain visible when it explains the commercial or organizational context.
- Let this domain lead when the contract/employment framing now determines what can safely be said or drafted.
- Never let it imply final legal certainty or substitute counsel on high-risk matters.

## Anti-patterns

Avoid:
- giving a definitive legal conclusion
- treating high-risk matters as standard templates
- treating every contract as if the same clause checklist always applies
- drafting final-ready contracts without tiered review language
- relying on unsupported legal memory when source verification is needed
- hiding legal uncertainty inside polished prose
- warning about risky clauses without proposing a revision direction when the scenario is simple enough to do so
- ignoring missing protections, deadlines, or operational obligations because the text “looks standard”
- silently filling missing key commercial or factual inputs instead of flagging placeholders
- rewriting the whole document when the user only needed a structured review pass

## Handback template

```md
### Domain handback — Legal Advisory
- Matter type:
- Contract type classifier note:
- Four-layer review summary:
- Supported scope check:
- Risk tier:
- Current legal suggestion:
- Clause review summary:
- Review annotation mode:
- Missing protections:
- Key obligations / deadlines:
- Negotiation suggestion:
- Missing facts or documents:
- Source support note:
- Drafting path or clause path:
- Review threshold:
- Confidence state:
```
