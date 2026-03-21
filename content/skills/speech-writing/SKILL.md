---
name: speech-writing
description: Use when the user needs spoken-first content for a speech, keynote, remarks, opening remarks, closing remarks, host script, emcee script, or spoken presentation script. Best for formal spoken content that must sound natural aloud, fit a live setting, and work with audience, time, and event constraints.
---

# Speech Writing

## Runtime Label

Speech And Spoken Remarks Writer

## Goal

Write spoken-first content that sounds natural aloud, fits the event context, and is ready to deliver or rehearse with minimal extra clarification.

This is a downstream writing skill. If the user already provided a usable brief, write directly instead of reopening broad discovery.

## Scope

Use this skill for:

- Speech
- Keynote
- Conference talk
- Remarks
- Opening remarks
- Closing remarks
- Welcome address
- Thank-you remarks
- Host script
- Emcee script
- Spoken presentation script

Do not use this skill for:

- Short-form video scripts
- Social video voiceovers
- Livestream script systems
- Ad voiceovers
- Product FAQ or user guides
- Written-only articles, essays, or press releases
- Slide-by-slide speaker notes unless the user explicitly asks for them

## Pick The Mode First

Before drafting, decide which mode fits the request.

### Speech / Keynote

Use for:

- Keynote
- Conference talk
- External presentation
- Persuasive or inspiring speech

Primary goal:

- Land one clear central message
- Move an audience through a spoken arc
- Create memorable opening and closing moments

### Remarks / Formal Address

Use for:

- Opening remarks
- Closing remarks
- Welcome speech
- Thank-you speech
- Leadership remarks
- Ceremony or meeting address

Primary goal:

- Deliver a clear formal message with the right tone and level of restraint

### Host Script / 主持串词

Use for:

- Event hosting
- Segment transitions
- Guest introductions
- Opening, transition, and closing lines

Primary goal:

- Keep the event flowing smoothly and naturally in real time

If the request could fit multiple modes, choose the primary live-use case first. Do not write remarks like a keynote, and do not write a host script like a long speech.

## Shared Rules

- Write for the ear, not just for the eye.
- Prefer short spoken units that are easy to breathe through.
- Advance one idea at a time.
- Build around a clear opening, body, and closing.
- Use repetition deliberately when it strengthens recall.
- Keep wording natural enough to say aloud without rewriting.
- Avoid dense data dumps, long lists, and heavy subordinate clauses unless the user explicitly needs them.
- Do not invent stories, data, accomplishments, quotes, or organizational details.
- Match the requested language. If unspecified, follow the conversation language.

## Output Modes

Support two default output shapes:

### Full Script

Use when the user explicitly asks for:

- 演讲稿
- 发言稿
- 串词
- keynote script
- full speech

Rules:

- Keep paragraphs short.
- Break lines at natural pauses when helpful.
- Let key lines stand alone when they should land with emphasis.
- Avoid dense prose blocks.

### Speaking Outline

Use when:

- The user asks for an outline
- The event is longer and the input is still coarse
- A speaker likely needs structure and key lines more than a strict word-for-word draft

Include:

- Section flow
- Key message per section
- Key lines or phrases
- Transition lines where useful

## Mode 1: Speech / Keynote

### Core Writing Rules

- Anchor the speech around one central idea.
- Open with a line, observation, story beat, or contrast that earns attention quickly.
- Keep the body organized into a few memorable beats, not too many points.
- Use examples, contrast, repetition, and callbacks to increase recall.
- End with a line or image that feels finishable and memorable.
- Respect the requested or implied time limit.

### Minimum Inputs

If needed, ask for:

- Occasion or event
- Audience
- Purpose
- Core message
- Time limit
- Tone
- Any must-include story, example, or fact
- Any taboo, political, or sensitive boundary

## Mode 2: Remarks / Formal Address

### Core Writing Rules

- Keep the purpose explicit: welcome, thank, announce, inspire, summarize, or close.
- Match the formality of the event.
- Be concise and stable in tone.
- Include required acknowledgements without making the piece read like a list.
- Avoid turning formal remarks into a motivational keynote unless requested.

### Minimum Inputs

If needed, ask for:

- Event or setting
- Speaker identity
- Audience
- Purpose
- Time limit
- Required acknowledgements, names, or mentions
- Tone and formality level

## Mode 3: Host Script / 主持串词

### Core Writing Rules

- Write for flow, transitions, and real-time usability.
- Keep lines shorter and easier to retrieve on stage.
- Organize by event segment.
- Introduce guests clearly and respectfully.
- Make transitions feel smooth, not mechanical.
- Prefer modular output when the run-of-show has multiple segments.

### Default Structure

1. Opening
2. Segment transitions
3. Guest introduction blocks
4. Closing

### Minimum Inputs

If needed, ask for:

- Event type
- Run-of-show or agenda
- Audience
- Segment list
- Guest names and titles
- Desired energy level
- Whether modular script or full script is needed

## Missing-Info Policy

If the brief is already usable, write directly.

If key information is missing:

- For speeches and keynotes, prioritize audience, purpose, core message, and time limit
- For remarks, prioritize event context, speaker identity, and exact purpose
- For host scripts, prioritize agenda, segments, and guest details

Ask only for the minimum critical gap. Do not restart a full briefing workflow if upstream already produced a usable handoff prompt.

## Quality Check

Before finalizing, verify that:

- The selected mode matches the live-use case
- The wording sounds natural aloud
- The structure can be delivered within the time constraint
- The opening and closing are distinct and intentional
- Host scripts are organized by segment
- Remarks stay concise and formal where needed
- The content does not drift into article-style prose
