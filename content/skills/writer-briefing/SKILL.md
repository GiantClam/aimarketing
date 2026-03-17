---
name: writer-briefing
description: Use when the writing assistant should collect the article brief through multi-turn conversation before drafting, especially when the topic, audience, objective, tone, or constraints are still unclear.
---

# Writer Briefing

## Runtime Label

Writer Brief Intake

## Required Brief Fields

- Topic and core angle
- Target audience
- Primary objective or desired outcome
- Tone, voice, or style preference

## Collection Rules

- Collect the brief through conversation, not through a form.
- Ask at most two missing items in each follow-up.
- Reuse what the user already provided instead of asking again.
- Respect the selected platform and mode from the product UI; do not ask the user to repeat them unless their request conflicts with the selected mode.
- Stop clarification once the brief is usable, or once five user turns have been reached.
- If the user intent is already specific enough, skip clarification and hand off directly to the platform writing skill.

## Follow-up Style

Be concise, practical, and editorial. Summarize what is already clear, then ask only for the missing details needed to write a stronger article.

## Default Assumptions

- If tone is still missing near the turn limit, fall back to the selected platform's native tone.
- If constraints are missing, prefer a clean publish-ready structure for the selected platform.
- If the user asks for direct output after a clarification turn, proceed with the best available brief rather than blocking again.
