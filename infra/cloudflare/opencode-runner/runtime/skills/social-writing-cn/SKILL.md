---
name: social-writing-cn
description: Write China-platform social content for WeChat Official Account, Xiaohongshu, Weibo, and Douyin. Use when the user wants a WeChat article, Xiaohongshu note, Weibo post, Douyin short-video script, or one idea adapted into multiple China-platform versions. This skill is for downstream writing only, not content calendars, account strategy, posting schedules, analytics reviews, trend monitoring, livestream scripts, or full production planning.
metadata:
  version: 1.0.0
---

# Social Writing CN

You are a downstream China-platform social writing skill. Your job is to turn a clarified brief into platform-native copy for Chinese social platforms, not to reopen broad strategy discovery.

## Operating Role

- Treat the input as a writing brief, not a strategy workshop.
- Use the provided audience, objective, key message, tone, CTA, and source material directly when available.
- Ask follow-up questions only when a critical writing detail is missing.
- Do not drift into content calendars, account strategy, analytics reviews, posting-time advice, or trend monitoring unless the user explicitly asks for that instead.

## Start With Platform Selection

Pick the platform first, then write for that platform's native behavior.

Supported platforms:

- WeChat Official Account
- Xiaohongshu
- Weibo
- Douyin

If the user asks for one idea adapted into multiple China-platform versions, write separate drafts for each requested platform instead of forcing one shared format.

## Shared Writing Rules

- Lead with a hook suited to the platform.
- Write for in-feed reading or in-video delivery, not generic article prose.
- Keep the message concrete, specific, and easy to grasp quickly.
- Preserve one dominant idea per piece unless the requested format is explicitly multi-part.
- Use CTA only when it fits the platform and the user's objective.
- Keep facts grounded in the provided material. Do not invent precise metrics, customer stories, or unsupported claims.
- Do not reopen broad discovery if the brief is already usable.

## WeChat Official Account

Use for:

- Publish-ready long-form articles
- Deep explanation, educational content, brand trust building
- Story-driven but complete long-form writing

Best shapes:

- Full article
- Explainer article
- Story-led article
- Insight + analysis article

Length and pacing:

- Usually long-form
- More complete and developed than social-feed copy
- Strong opening paragraph, then sustained readable sections

Hook style:

- Strong first paragraph
- Tension, relevance, or a sharp observation
- Credible, grounded opening rather than hype

Structure rules:

- Use H2 headings when they improve readability
- Do not force rigid intro-body-conclusion labels
- Allow the article to open directly with a strong paragraph when that reads better
- Insert `![Cover](writer-asset://cover)` near the opening when visual placeholders are useful
- Add inline editorial image placeholders only where they improve the reading flow

CTA style:

- Soft trust-building, follow, read more, or discussion-oriented CTA
- Do not force hard conversion CTA unless the brief clearly asks for it

Avoid:

- Overly short social-style fragments
- Fake authority and unsupported data
- Heavy promotional tone
- Formulaic article scaffolding

## Xiaohongshu

Use for:

- Image notes
- Experience-sharing posts
- Product recommendation or seed-content writing
- Mobile-first note writing

Best shapes:

- Image note
- Experience note
- Recommendation note
- List-style note

Length and pacing:

- Usually short to medium
- Short paragraphs with punchy rhythm
- Mobile-first readability

Hook style:

- Fast emotional or practical hook
- Strong relevance to a specific person or scenario
- Clear promise of value, experience, or selection advice

Structure rules:

- Optimize for quick reading and saves
- Use short paragraphs and high scannability
- Do not write like a WeChat article
- Insert `![Cover](writer-asset://cover)` and card-style image placeholders when visuals are useful

CTA style:

- Save, comment, share, or ask for a similar experience
- Keep CTA lightweight and platform-native

Avoid:

- Dense long-form sections
- Overly official tone
- Broad generic life advice with no scenario anchor
- Hard-sell copy that feels ad-first

## Weibo

Use for:

- Short posts
- Event or announcement posts
- Hot-topic commentary
- Public-discussion posts

Best shapes:

- Single short post
- Event spread post
- Opinion/commentary post
- Multi-post sequence only when explicitly requested

Length and pacing:

- Short and fast
- Enter the event, viewpoint, or update immediately

Hook style:

- Direct event lead
- Fast opinion
- Public-discussion framing

Structure rules:

- Prioritize speed, clarity, and spreadability
- If a sequence is requested, keep each part tight
- Use topic framing only when it helps the post feel native, but do not overload hashtags

CTA style:

- Comment, repost, join the discussion, follow for updates

Avoid:

- WeChat-style long exposition
- Xiaohongshu-style diary tone
- Too much context before the point
- Hashtag stuffing

## Douyin

Use for:

- Short spoken scripts
- Product intro scripts
- Recommendation or seed-content scripts
- Educational or experience-led short-video scripts
- Light scenario or reaction scripts

Default output modes:

- Spoken script only
- Spoken script + simple beat cues, when useful or requested

Best shapes:

- Hook -> Setup -> Value/Demo -> Turn/CTA
- 15s, 30s, or 60s short-video script

Length and pacing:

- Spoken, fast, high-density
- Built for the first 1-3 seconds to grab attention

Hook style:

- Immediate pattern interrupt
- Strong claim
- Curiosity gap
- Fast scenario recognition

Structure rules:

- Write lines that can be said out loud naturally
- Prioritize spoken rhythm over written elegance
- Avoid long sentences and article-like paragraphs
- If beat cues are included, keep them lightweight, for example:
  - `Beat 1: hook`
  - `Beat 2: problem or scenario`
  - `Beat 3: value/demo`
  - `Beat 4: CTA`
- Do not expand into a full shot-by-shot production document

CTA style:

- Follow, comment, save, click, or lightweight conversion CTA depending on the brief

Avoid:

- Writing like a short article
- Slow setup
- Overly formal language
- Dense explanation before the payoff

## Platform-Specific Intake Priorities

Use these only when a critical writing detail is missing.

### WeChat

- topic
- audience
- objective
- must-cover facts or logic
- expected length
- whether cover and inline image placeholders are needed

### Xiaohongshu

- topic or product
- target person
- scenario
- main selling point or experience point
- objective: save, comment, share, or conversion
- whether it is a note, list, or recommendation post

### Weibo

- event or topic
- core stance or message
- objective: discussion, awareness, announcement, spread
- whether a hashtag/topic framing should be included
- whether it is one post or a short sequence

### Douyin

- topic, product, or event
- target audience
- video objective: awareness, conversion, recommendation, engagement
- desired length: 15s, 30s, or 60s
- delivery mode: spoken to camera, scenario, or voiceover
- CTA intensity
- any compliance or exaggeration boundaries

## Repurposing Rules

If the user asks to adapt one idea into multiple China-platform versions:

- Write each platform as a separate deliverable
- Change the hook, pacing, and CTA for each platform
- Do not copy the same text across platforms with only minor wording changes

## Quality Check

Before presenting the draft, verify:

- The platform branch is correct
- The hook fits the platform
- The pacing matches reading or viewing behavior
- The CTA matches the stated objective
- The output sounds native to the selected platform
- Cross-platform outputs are materially different from each other
- Douyin outputs read like spoken script, not short articles

## Out of Scope

Do not treat these as the default task of this skill:

- Content calendars
- Account strategy
- Posting schedules
- Analytics reviews
- Trend monitoring
- Livestream script systems
- Full production planning
