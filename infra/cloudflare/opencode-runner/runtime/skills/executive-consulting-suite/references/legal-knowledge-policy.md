## Purpose

This document defines the legal-source strategy for the executive consulting suite's legal enhancement.

The skill must not rely on bare model recall for substantive legal guidance when source quality, freshness, or authority matters.

## Jurisdiction default

Default supported jurisdiction:
- China mainland

If the current task does not clearly stay inside China-mainland contract or employment matters, the skill must narrow scope or downgrade confidence.

## Hybrid legal-knowledge model

Use this stack in order:

1. current user facts and attached documents
2. enterprise legal knowledge
3. official legal and regulatory sources
4. authoritative judicial example sources
5. cautious inference by the model

This means:
- the model organizes and reasons
- enterprise materials provide company-specific baseline
- official and authoritative sources anchor legal support
- unsupported recollection never becomes a strong legal assertion

## Enterprise legal knowledge

Typical enterprise legal knowledge includes:
- contract templates
- prior negotiated clause language
- framework agreements
- NDAs
- labor contracts and supplements
- employee handbook or discipline rules
- approval matrices and signing authority rules
- prior legal review comments or standard positions

Prefer enterprise legal knowledge when:
- the request is to revise, improve, or extend company-standard language
- the user wants a draft that reflects existing company practice
- the company already has approved clause preferences

If the team later builds a controlled legal knowledge base, prefer structured legal text ingestion:
- normalize official rules, judicial interpretations, and guidance into Markdown or similarly structured article-level text
- preserve article numbering, source title, issue date, and effective-date metadata
- keep retrieval grounded in source structure rather than loose summaries alone

## Official-source strategy

Preferred official or authoritative sources include:

- National Laws and Regulations Database: [https://flk.npc.gov.cn](https://flk.npc.gov.cn)
- People's Court Case Database: [https://rmfyalk.court.gov.cn](https://rmfyalk.court.gov.cn)
- Official labor or policy guidance published on [gov.cn](https://www.gov.cn) or relevant ministry sites such as [mohrss.gov.cn](https://www.mohrss.gov.cn)

Use these sources for:
- statutory wording or latest-valid rule checks
- judicial interpretation direction
- labor and employment policy verification
- official template or guideline support when available

## Source-precedence rule

Use this order:
1. current task facts and files
2. enterprise legal materials
3. official legal sources
4. authoritative judicial examples
5. cautious inference

Do not let unofficial commentary outrank official sources.

## When verification is mandatory

Verification is mandatory when:
- the answer depends on current legal validity or freshness
- the issue is high-risk or irreversible
- the request asks for clause enforceability or legality in strong terms
- the request involves labor discipline, termination, compensation, or other sensitive employment handling
- the request involves non-standard liability, indemnity, penalty, exclusivity, or dispute-resolution clauses

## When bounded drafting can proceed

Bounded drafting can proceed without full legal-source lookup only when all of the following are true:
- the request is inside supported first-release scope
- the draft is clearly marked as draft
- the scenario is standardized and low-risk
- enterprise template support is available or the missing authority does not materially change the structure
- the output keeps the correct review tier visible

## Forbidden source behavior

Do not:
- treat generic blogs or anonymous forum posts as legal authority
- treat law-firm marketing summaries as sole authority
- treat model memory as verified law
- imply legal freshness if no freshness check was performed
- ingest unofficial legal summaries into the controlled legal KB without source metadata and traceable origin

## Confidence and downgrade rules

If official-source support is missing, stale, or inconclusive:
- reduce confidence
- narrow the claim
- move from “legal conclusion” framing to “risk suggestion” framing
- increase the review tier if necessary

## Pass criteria

This document is successful if it causes the skill to:
- prefer enterprise legal materials when relevant
- use official or authoritative sources when legal support matters
- avoid bare-model legal certainty
- keep jurisdiction explicit
- downgrade or escalate when source support is incomplete
