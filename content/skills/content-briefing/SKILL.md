---
name: content-briefing
description: Use when the writing assistant should clarify a usable brief through multi-turn conversation before generating any copy, especially when content type, platform, audience, objective, topic, tone, or constraints are still unclear.
---

# Content Briefing

## Runtime Label

Universal Content Brief Intake

## Required Brief Fields

- Content type or publishing scenario
- Target platform or destination surface
- Topic and core message
- Target audience
- Primary objective or desired outcome
- Tone, voice, or style preference

## Collection Rules

- Collect the brief through conversation, not through a form.
- Ask at most two missing items in each follow-up.
- Reuse what the user already provided instead of asking again.
- Prioritize scenario, platform, audience, and objective before lower-value details.
- Infer output form and length from the scenario when the user does not specify them.
- Stop clarification once the brief is usable, or once five user turns have been reached.
- If the user intent is already specific enough, skip clarification and hand off directly to the downstream writing skill.

## Follow-up Style

Be concise, practical, and editorial. Summarize what is already clear, then ask only for the highest-leverage missing details needed to write a strong draft.

## Default Assumptions

- If tone is missing near the turn limit, fall back to the native tone of the inferred scenario or platform.
- If length is missing, choose a medium native length for that scenario.
- If output form is missing, choose the most publishable format for the inferred platform.
- If constraints are missing, prefer clean, publish-ready structure and avoid unsupported factual claims.
