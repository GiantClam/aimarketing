## Purpose

This document defines how the executive consulting suite should use Dify-backed enterprise knowledge in a cloud or website deployment.

The skill itself does not call Dify directly. A hosting platform or backend service performs retrieval and passes normalized results into the skill context.

## Core architecture

Use this chain:
- website or application frontend
- backend or platform adapter
- Dify knowledge API
- normalized retrieval result
- executive consulting skill

Do not use this chain:
- browser directly to Dify with exposed credentials
- skill directly holding Dify API keys

## Binding model

v1 assumes one enterprise maps to one default Dify knowledge base.

Binding fields:
- `enterprise_id`
- `enterprise_display_name`
- `provider`
- `dify_base_url`
- `credential_ref`
- `default_dataset_id`
- `default_dataset_name`
- `status`

Expected values:
- `provider`: `dify`
- `status`: `active`, `disabled`, or `error`

Recommended example:

```json
{
  "enterprise_id": "lingchuang-ai",
  "enterprise_display_name": "灵创智能",
  "provider": "dify",
  "dify_base_url": "https://dify-api.o3-tools.com/v1",
  "credential_ref": "DIFY_API_KEY_LINGCHUANG",
  "default_dataset_id": "302cf95a-2473-4d57-be04-401d5cfda3d6",
  "default_dataset_name": "灵创企业知识库",
  "status": "active"
}
```

Notes:
- `default_dataset_id` must be the real Dify dataset UUID, not a display name.
- `credential_ref` should point to a server-side secret or environment variable, not a plaintext API key inside the skill or client.
- `enterprise_id` should be a stable machine identifier, not just the human-facing company name.

## Service-side retrieval interface

The platform adapter should expose one retrieval interface to the skill host:

`POST /api/enterprise-knowledge/retrieve`

Request body:
```json
{
  "enterprise_id": "string",
  "retrieval_mode": "profile_bootstrap | question_targeted | artifact_context",
  "query": "string | null",
  "needed_fields": ["string"],
  "top_k": 5,
  "current_problem_hint": "string | null"
}
```

Response body:
```json
{
  "provider": "dify",
  "binding_status": "bound | unbound | error",
  "dataset_id": "string | null",
  "kb_coverage": "not_found | partial | sufficient",
  "kb_freshness_state": "current | stale | unknown",
  "kb_retrieval_summary": "string",
  "normalized_company_profile": {
    "company_name": "string | null",
    "industry": "string | null",
    "business_model": "string | null",
    "headcount_band": "string | null",
    "customer_segments": "string | null",
    "channel_mix": "string | null",
    "sales_model": "string | null",
    "delivery_model": "string | null",
    "management_system_maturity": "string | null",
    "existing_policies_or_playbooks": ["string"],
    "existing_templates_or_forms": ["string"],
    "recent_changes": ["string"],
    "known_constraints": ["string"]
  },
  "chunks": [
    {
      "source_document": "string",
      "text": "string",
      "score": 0.0,
      "updated_at": "string | null",
      "tags": ["string"]
    }
  ],
  "kb_missing_critical_fields": ["string"],
  "source_notes": ["string"]
}
```

The skill should consume this normalized shape rather than Dify-native raw payloads.

## Local testing shortcut

Before a real backend exists, local testing may use:
- `scripts/dify_local_adapter.py`

Its scope is intentionally narrow:
- read one binding JSON
- call one bound Dify dataset
- emit a normalized retrieval packet that matches the shape above

This is only a local testing shortcut. It does not replace the production architecture, which should still keep credentials and retrieval orchestration on the backend side.

## Retrieval modes

### `profile_bootstrap`

Use first when an enterprise is bound and enterprise context is needed.

The backend should retrieve at least these buckets:
1. company profile, industry, business model, core products
2. organization, roles, management layers, authority
3. sales flow, growth channels, customer mix
4. policies, templates, forms, contracts, handbook
5. recent reviews, major changes, known constraints or risks

Default v1 behavior:
- `top_k = 3` per bootstrap bucket
- merged result should keep at most 12 chunks
- prefer coverage of the high-value fields described in `kb-contract.md`

### `question_targeted`

Use after bootstrap when the current executive question needs sharper context.

Inputs:
- current user problem statement
- optional `current_problem_hint`

Default v1 behavior:
- `top_k = 5`
- use results to refine routing, prioritization, and follow-up questions

### `artifact_context`

Use before generating or handing off:
- plans
- budgets
- policies
- operating sheets
- contract drafts
- contract review notes

The backend should prioritize:
- existing policies
- legacy plans
- forms
- KPI sheets
- contract templates
- employee handbook rules
- approval rules

## Skill-side behavior

If the current context contains `enterprise_id`, the skill should first look for a Dify-backed retrieval result.

Interpretation rules:
- `binding_status = bound` and `kb_coverage != not_found`: treat Dify as the lead enterprise-knowledge source
- `binding_status = unbound`: fall back to attached files or preloaded knowledge
- `binding_status = error`: do not fail the whole diagnosis; fall back and keep confidence calibrated
- `kb_freshness_state = unknown`: do not treat retrieved facts as fully confirmed where freshness matters

## Source precedence

When Dify-backed retrieval exists, use this order:
1. current user clarification in this conversation
2. current-task attached files or structured inputs
3. Dify-backed normalized retrieval result
4. preloaded enterprise knowledge
5. cautious inference

If attached files and Dify disagree:
- prefer the current-task files if they are evidently newer or user-provided in this session
- otherwise keep the conflict visible internally and ask only the next best clarifying question

## Failure and fallback behavior

The skill should not overreact to Dify failure.

If Dify is:
- unbound
- disabled
- erroring
- empty

then:
- fall back to attached files or preloaded enterprise knowledge
- do not claim complete enterprise understanding
- ask only the narrowest follow-up questions that change the judgment

## Pass criteria

This document is successful if it causes the skill to:
- use Dify-backed enterprise knowledge when available through the platform
- avoid direct credential handling inside the skill
- prefer profile bootstrap before broad questioning
- use targeted retrieval for current diagnosis
- use artifact-context retrieval before plans, policies, or contracts
- fall back gracefully when binding is absent or retrieval fails
