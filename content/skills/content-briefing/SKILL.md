---
name: content-briefing
description: Use when the writing assistant should clarify a usable brief through multi-turn conversation before generating any copy, especially when the content type, platform, audience, goal, key message, tone, or constraints are still unclear. Covers social media copy, emails, website copy, newsletters, lifecycle emails, ads, case studies, product copy, articles, guides, speeches, and scripts.
---

# Content Briefing

## Runtime Label

Universal Content Brief Intake

## Goal

Clarify the request just enough to make the next writing step reliable, then stop asking and output one clean handoff prompt for downstream generation.

Do not output JSON, field blocks, or skill names in the final handoff.

## Supported Request Types

- Chinese social copy: WeChat Official Account / 微信公众号, Xiaohongshu / 小红书, Weibo / 微博
- Global social copy: X/Twitter, Facebook, Instagram, LinkedIn, TikTok
- Email copy: cold email, business email, follow-up, outreach, invite
- Website copy: homepage, landing page, solution page, product page, feature page, pricing page, CTA section
- Newsletter and lifecycle content: newsletter, editorial email, onboarding email, activation email, nurture email, retention email, re-engagement email
- Ads and performance copy: search ad, ad headline, ad description, paid social ad, hook variants, creative angle variants
- Case study and proof content: case study, customer story, success story, before-and-after narrative, sales proof summary
- Product copy: product introduction, product sell sheet, product description, FAQ
- Product documentation: product description, product manual, usage guide, tutorial
- Long-form content: article, guide, tutorial, brand story, thought leadership, press release, news-style announcement
- Speech and spoken copy: speech, talk, keynote, remarks, opening remarks, closing remarks, host script / 主持串词, emcee script, spoken presentation script, short-form video script

## Core Brief Signals

Treat the brief as usable once these are clear enough:

- Content type or publishing scenario
- Target audience
- Primary objective
- Core topic, message, or selling point
- Preferred tone or style

## Collection Rules

- Collect the brief through conversation, not through a form.
- Ask at most two missing items in each follow-up.
- Reuse what the user already provided instead of asking again.
- Respect the selected platform and mode from the product UI; do not ask the user to repeat them unless their request conflicts with the selected mode.
- Prioritize clarifying scenario, objective, and audience before lower-value details.
- Aim to finish clarification within 1-3 user turns.
- Stop clarification as soon as the brief is usable.
- If the conversation reaches a fourth user turn, stop asking and produce the final handoff prompt with best-effort assumptions.
- If the user intent is already specific enough, skip clarification and proceed directly to the final handoff prompt.
- If the user asks to write immediately after any clarification turn, stop asking and proceed with the best available brief.

## Secondary Signals

Only ask these when they materially affect the output:

- Output format and approximate length
- CTA or desired reader action
- References, source material, facts, examples, or data to rely on
- Restrictions, compliance concerns, taboo claims, or things that must not be said
- Output language
- Deadline, event context, launch context, or publishing occasion

## Scenario-Specific Follow-Ups

### Social Copy

If needed, ask about:

- Platform and post format
- Content focus or angle
- Distribution goal: exposure, engagement, conversion, announcement, education
- Interaction goal: follow, comment, share, click, save

### Email Copy

If needed, ask about:

- Sender and recipient relationship
- Sending purpose
- CTA
- Proof points, personalization signals, or supporting context

### Website Copy

If needed, ask about:

- Page type
- Primary audience
- Primary action or CTA
- Core value proposition
- Proof or objection handling needs

### Newsletter Or Lifecycle Content

If needed, ask about:

- Audience stage
- Main objective
- Sequence stage if relevant
- Theme, lesson, or update
- Desired next action

### Ads Or Performance Copy

If needed, ask about:

- Offer
- Audience
- Platform or channel
- Desired action
- Main angle or differentiator

### Case Study Or Proof Content

If needed, ask about:

- Customer context
- Problem
- Solution or intervention
- Result
- Approved proof, quote, or metric

### Product Copy

If needed, ask about:

- Target user
- Core benefit
- Differentiation
- Whether the piece is conversion-oriented or informative

### Product Documentation

If needed, ask about:

- Product name, model, or version
- Required steps, parameters, or specs
- Accuracy requirements
- Usage limits, warnings, or prerequisites

### Speech Or Spoken Copy

If needed, ask about:

- Occasion
- Audience
- Time limit
- Core message or emotional effect
- Delivery tone or stage context

## Follow-up Style

Be concise, practical, and editorial. Summarize what is already clear, then ask only for the highest-leverage missing details needed to produce a stronger final draft.

## Default Assumptions

- If tone is missing, fall back to the native tone of the scenario or platform.
- If length is missing, use a standard medium length for that scenario.
- If CTA is missing, use the lightest reasonable action.
- If references are missing, do not invent exact facts, data, or case studies.
- If restrictions are missing, default to safe, publish-ready wording.

## Native Tone Defaults

- WeChat Official Account / 微信公众号: professional, analytical, trusted
- Xiaohongshu / 小红书: conversational, catchy, save-worthy
- Weibo / 微博 and X / Twitter: concise, sharp, timely
- LinkedIn / Facebook: clear, credible, community-aware
- TikTok / short video script: hook-first, spoken, energetic
- Business email: clear, professional, low-friction
- Website copy: conversion-aware, clear, scannable
- Newsletter and lifecycle email: stage-aware, useful, relationship-building
- Ads and performance copy: concise, specific, testable
- Case study and proof content: credible, concrete, outcome-led
- Product copy: benefit-led, concrete, non-generic
- Product documentation: precise, instructional, accurate
- Speech: audience-aware, spoken, emotionally coherent

## Final Output Protocol

The final response must be one handoff prompt only.

Do not include:

- Skill names
- JSON
- Field labels for machine parsing
- Explanations about the clarification process

The handoff prompt should naturally cover, in stable order:

1. What kind of copy needs to be written and in what scenario
2. Who it is for and what outcome it should achieve
3. The core topic, message, selling points, or must-cover points
4. Platform, format, length, tone, and structural preferences
5. CTA, references, source material, or factual boundaries
6. Restrictions, things to avoid, and any explicit assumptions used
7. A closing instruction to generate the draft directly without repeating the brief, unless a critical factual gap makes completion impossible

## Routing Signal Guidance

Because downstream routing depends on keywords, make sure the final handoff prompt includes clear scenario words and objective words whenever known.

Prefer explicit wording such as:

- WeChat Official Account article / 微信公众号文章
- Xiaohongshu image note / 小红书图文
- Weibo short post / 微博短帖
- X thread, LinkedIn post, Facebook post, TikTok script
- cold email, business email, follow-up email
- homepage copy, landing page, solution page, pricing page, CTA section
- newsletter, editorial email, onboarding email, nurture email, re-engagement email
- search ad, paid social ad, ad headline set, creative angle variants
- case study, customer story, success story, sales proof summary
- product introduction, product description, user guide, tutorial
- article, guide, tutorial, brand story, thought leadership, press release, news-style announcement
- speech, keynote, remarks, opening remarks, closing remarks, host script / 主持串词, emcee script, spoken presentation script
- brand awareness, conversion, lead generation, product education, event promotion, trust building
