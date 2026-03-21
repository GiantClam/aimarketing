---
name: longform-writing
description: Use when the user needs substantial written content such as an article, tutorial, guide, brand story, thought leadership piece, press release, or news-style announcement. Best for long-form writing where structure, voice, credibility, and content-type-specific formatting matter.
---

# Longform Writing

## Runtime Label

Long-form Content Writer

## Goal

Write long-form content that is structurally correct for the requested format, credible in tone, and ready to publish or hand off with minimal extra clarification.

This is a downstream writing skill. If the user already provided a usable brief, write directly instead of restarting broad discovery.

## Scope

Use this skill for:

- Article
- Tutorial
- Guide
- Brand story
- Brand content
- Thought leadership piece
- Press release
- News-style announcement

Do not use this skill for:

- Social media posts
- Email copy
- Product page copy or product selling points
- FAQ or product usage guides that belong in product documentation
- Speeches, keynotes, remarks, or host scripts that are meant to be delivered aloud
- API docs or developer reference docs
- Independent journalism, reported features, or investigative reporting

By default, a press release here means a company or brand announcement, not a third-party news report.

## Pick The Mode First

Before drafting, decide which mode fits the request.

### Editorial / Educational Long-form

Use for:

- Article
- Tutorial
- Guide

Primary goal:

- Explain a topic clearly
- Educate the reader
- Build credibility through useful substance
- Help the reader understand an issue or complete a task

### Brand / Thought Leadership Content

Use for:

- Brand content
- Brand story
- Founder or operator point-of-view piece
- Thought leadership article

Primary goal:

- Build trust and recognition
- Express a clear perspective
- Shape how the audience understands the brand, market, or problem

### Press Release / News-Style Announcement

Use for:

- Press release
- Product launch announcement
- Funding announcement
- Partnership announcement
- Milestone or event announcement

Primary goal:

- Deliver a clear, quotable, distribution-ready announcement in a formal structure

If the request could fit multiple modes, choose the primary user outcome first. Do not write a tutorial like a blog essay, do not write brand content like a brochure, and do not write a press release like a founder blog post.

## Shared Rules

- Open with something concrete: a fact, observation, example, event, outcome, or tension.
- Show before you explain whenever possible.
- Prefer short, direct sentences over inflated phrasing.
- Do not invent facts, quotes, customer evidence, company metrics, or timelines.
- Remove filler transitions, vague claims, and generic grandstanding.
- Match the requested language. If unspecified, follow the conversation language.
- Keep the structure easy to scan without flattening the content into shallow bullets.

## Mode 1: Editorial / Educational Long-form

### Use This For

- Analysis article
- Explainer article
- Tutorial
- Guide

### Core Writing Rules

- Start from a clear topic or thesis.
- Keep the reader and objective visible throughout.
- Organize sections so each one advances a distinct point or task.
- Use examples, evidence, scenarios, or source material to support claims.
- For tutorials and guides, optimize for task completion, not for literary flair.

### Article

Prefer when the piece needs:

- A thesis
- Analysis
- Interpretation
- Narrative flow across sections

Default shape:

1. Concrete opening
2. Core claim or framing
3. Structured supporting sections
4. Practical takeaway or closing implication

### Tutorial / Guide

Prefer when the piece needs:

- Sequential steps
- Prerequisites
- A defined outcome
- Failure prevention

Default shape:

1. What the reader will accomplish
2. Prerequisites or context
3. Ordered steps or sections
4. Expected result
5. Notes, cautions, or common mistakes

### Minimum Inputs

If needed, ask for:

- Topic or thesis
- Target reader
- Primary objective
- Desired format: article, tutorial, or guide
- References or source material
- Preferred tone
- Approximate length
- For tutorial/guide: prerequisites, steps, expected result, likely failure points

## Mode 2: Brand / Thought Leadership Content

### Use This For

- Brand story
- Point-of-view article
- Thought leadership
- Brand perspective on an industry issue

### Core Writing Rules

- Write for an audience, not for the brand's ego.
- Lead with value, tension, insight, or a real market observation.
- Make the point of view specific and defensible.
- Use stories, examples, or concrete observations to carry the argument.
- Let the brand appear as a guide with judgment, not as a loud hero.
- Keep the piece persuasive through clarity and point of view, not through slogans.

### Avoid

- Brochure-style self-praise
- Generic mission-statement language
- Empty “future of X” claims
- Brand-first openings that give the reader no reason to care

### Minimum Inputs

If needed, ask for:

- Audience
- Brand or author point of view
- Core message
- Desired trust, emotion, or perception to build
- Supporting stories, examples, or proof
- Tone or voice references
- Desired format: brand story, founder-style article, or thought leadership piece

## Mode 3: Press Release / News-Style Announcement

### Use This For

- Press release
- Launch announcement
- Funding announcement
- Partnership announcement
- Event or milestone release

### Core Writing Rules

- Lead with the news, not with scene-setting.
- Keep the tone formal, factual, and quotable.
- Use an inverted-pyramid tendency: the most important information first.
- Keep claims tightly bounded to approved facts.
- Include boilerplate and media contact only when relevant or requested.
- Use the standard structure documented in [references/press-release-patterns.md](references/press-release-patterns.md).

### Required Structure

Unless the user requests a lighter format, include:

1. Headline
2. Optional subheadline
3. Dateline
4. Lead paragraph
5. Supporting body
6. Quote
7. Boilerplate
8. Media contact if requested

### Avoid

- Writing it like a blog post
- Overusing promotional adjectives
- Burying the actual announcement
- Fabricating quotes, dates, metrics, or spokesperson details

### Minimum Inputs

If needed, ask for:

- What the news is
- Why it matters now
- Who is involved
- Timing, date, or place if relevant
- Approved facts
- Spokesperson or quote source
- Company boilerplate availability
- Whether media contact details should be included

## Missing-Info Policy

If the brief is already usable, write directly.

If key information is missing:

- For editorial long-form, prioritize topic, reader, objective, and source material
- For brand content, prioritize audience, point of view, and core message
- For press releases, prioritize approved facts, who/what/why-now, and quote source

Ask only for the minimum critical gap. Do not restart a full briefing workflow if upstream already produced a usable handoff prompt.

## Quality Check

Before finalizing, verify that:

- The selected mode matches the requested outcome
- The opening is concrete rather than generic
- The structure fits the content type
- The piece does not overclaim beyond the provided facts
- Tutorials and guides are task-oriented
- Brand content has a clear point of view
- Press releases read like announcements, not blog posts
